"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COURSE_STORAGE_KEY,
  buildCourseRevisionUpdatePreview,
  buildCourseReviewSnapshot,
  confirmCourseRevisionUpdate,
  createCourseDraft,
  parseCourseDraft,
  serializeCourseDraft,
  type CourseDraft,
  type CourseRevisionUpdateConfirmation,
  type CourseRevisionUpdateFailure,
  type CourseRevisionUpdateOperation,
  type CourseRevisionUpdatePreview,
  type CourseRevisionUpdateResult,
} from "@/domain/course";
import {
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  LOCAL_WORKSPACE_STORAGE_KEY,
  localDesignLibraryRevisions,
  migrateLocalDesignLibrary,
  serializeLocalDesignLibrary,
  type LocalDesignRevision,
} from "@/domain/design";
import { useRevisionArtworkAvailability } from "./useRevisionArtworkAvailability";

type ReviewSourceState =
  | "checking"
  | "restored"
  | "empty"
  | "course-invalid"
  | "storage-unavailable";

const EMPTY_COURSE = createCourseDraft("1970-01-01T00:00:00.000Z");

function sourceStatus(state: ReviewSourceState) {
  switch (state) {
    case "checking":
      return "Checking browser-local course…";
    case "restored":
      return "Browser-local course restored · updates require confirmation";
    case "course-invalid":
      return "Stored course was invalid · showing an empty review";
    case "storage-unavailable":
      return "Browser storage unavailable · showing an empty review";
    default:
      return "No browser-local course saved yet · empty review";
  }
}

export function useLocalCourseReview() {
  const [course, setCourse] = useState<CourseDraft>(EMPTY_COURSE);
  const [revisions, setRevisions] = useState<readonly LocalDesignRevision[]>(
    [],
  );
  const [sourceState, setSourceState] = useState<ReviewSourceState>("checking");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const migratedLibrary = migrateLocalDesignLibrary({
          librarySerialized: window.localStorage.getItem(
            LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
          ),
          legacyWorkspaceSerialized: window.localStorage.getItem(
            LOCAL_WORKSPACE_STORAGE_KEY,
          ),
          now: new Date().toISOString(),
          draftId: "course-review-library-migration-draft",
        });
        const nextRevisions = migratedLibrary.ok
          ? localDesignLibraryRevisions(migratedLibrary.value.library)
          : [];
        if (migratedLibrary.ok)
          window.localStorage.setItem(
            LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
            serializeLocalDesignLibrary(migratedLibrary.value.library),
          );

        const courseSerialized =
          window.localStorage.getItem(COURSE_STORAGE_KEY);
        if (!courseSerialized) {
          setCourse(EMPTY_COURSE);
          setRevisions(nextRevisions);
          setSourceState("empty");
          return;
        }
        const parsedCourse = parseCourseDraft(courseSerialized);
        setCourse(parsedCourse.ok ? parsedCourse.value : EMPTY_COURSE);
        setRevisions(nextRevisions);
        setSourceState(parsedCourse.ok ? "restored" : "course-invalid");
      } catch {
        setCourse(EMPTY_COURSE);
        setRevisions([]);
        setSourceState("storage-unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const review = useMemo(
    () => buildCourseReviewSnapshot(course, revisions),
    [course, revisions],
  );
  const unavailableArtworkRevisionIds =
    useRevisionArtworkAvailability(revisions);

  function buildUpdatePreview(operation: CourseRevisionUpdateOperation) {
    return buildCourseRevisionUpdatePreview(course, revisions, operation);
  }

  function storageFailure(message: string): CourseRevisionUpdateFailure {
    return {
      ok: false,
      error: { kind: "storage_unavailable", message },
    };
  }

  function confirmUpdatePreview(
    preview: CourseRevisionUpdatePreview,
  ): CourseRevisionUpdateResult<CourseRevisionUpdateConfirmation> {
    try {
      const currentCourseSerialized =
        window.localStorage.getItem(COURSE_STORAGE_KEY);
      if (!currentCourseSerialized) {
        return {
          ok: false,
          error: {
            kind: "stale_course_precondition",
            message:
              "The browser-local course was removed after this preview opened. Nothing was written.",
          },
        };
      }
      const currentCourse = parseCourseDraft(currentCourseSerialized);
      if (!currentCourse.ok) {
        return {
          ok: false,
          error: {
            kind: "stale_course_precondition",
            message:
              "The browser-local course is no longer valid. Nothing was written.",
          },
        };
      }

      const currentLibrary = migrateLocalDesignLibrary({
        librarySerialized: window.localStorage.getItem(
          LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
        ),
        legacyWorkspaceSerialized: window.localStorage.getItem(
          LOCAL_WORKSPACE_STORAGE_KEY,
        ),
        now: new Date().toISOString(),
        draftId: "course-review-confirmation-migration-draft",
      });
      const currentRevisions = currentLibrary.ok
        ? localDesignLibraryRevisions(currentLibrary.value.library)
        : [];
      const result = confirmCourseRevisionUpdate(
        currentCourse.value,
        currentRevisions,
        preview,
        new Date().toISOString(),
      );
      if (!result.ok) return result;

      const serializedReplacement = serializeCourseDraft(
        result.value.courseDraft,
      );
      window.localStorage.setItem(COURSE_STORAGE_KEY, serializedReplacement);
      setCourse(result.value.courseDraft);
      setRevisions(currentRevisions);
      setSourceState("restored");
      return result;
    } catch {
      return storageFailure(
        "Browser storage is unavailable. The previewed course was not written.",
      );
    }
  }

  return {
    course,
    revisions,
    review,
    unavailableArtworkRevisionIds,
    sourceState,
    sourceStatus: sourceStatus(sourceState),
    hydrated: sourceState !== "checking",
    buildUpdatePreview,
    confirmUpdatePreview,
  };
}
