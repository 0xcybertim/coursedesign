"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";
import type { CourseRecord, DesignRevisionPage } from "@/persistence";
import { persistenceApi } from "@/lib/browser/persistence-api";
import { useRevisionArtworkAvailability } from "./useRevisionArtworkAvailability";

type ReviewSourceState =
  | "checking"
  | "restored"
  | "empty"
  | "server-restored"
  | "server-unavailable"
  | "course-invalid"
  | "storage-unavailable";

const EMPTY_COURSE = createCourseDraft("1970-01-01T00:00:00.000Z");

function sourceStatus(state: ReviewSourceState) {
  switch (state) {
    case "checking":
      return "Checking browser-local course…";
    case "restored":
      return "Browser-local course restored · updates require confirmation";
    case "server-restored":
      return "Server course restored · pinned revisions verified";
    case "server-unavailable":
      return "Server workspace unavailable · showing an empty review";
    case "course-invalid":
      return "Stored course was invalid · showing an empty review";
    case "storage-unavailable":
      return "Browser storage unavailable · showing an empty review";
    default:
      return "No browser-local course saved yet · empty review";
  }
}

export function useLocalCourseReview() {
  const persistenceMode = usePersistenceMode();
  const [course, setCourse] = useState<CourseDraft>(EMPTY_COURSE);
  const [revisions, setRevisions] = useState<readonly LocalDesignRevision[]>(
    [],
  );
  const [sourceState, setSourceState] = useState<ReviewSourceState>("checking");
  const lockVersionRef = useRef(1);

  useEffect(() => {
    let cancelled = false;
    if (persistenceMode === "server") {
      void Promise.all([
        persistenceApi<CourseRecord>("/api/courses/local-course-1"),
        persistenceApi<DesignRevisionPage>(
          "/api/designs/local-spj-04/revisions?limit=100",
        ),
      ]).then(([courseResult, revisionResult]) => {
        if (cancelled) return;
        if (!courseResult.ok || !revisionResult.ok) {
          setCourse(EMPTY_COURSE);
          setRevisions([]);
          setSourceState("server-unavailable");
          return;
        }
        lockVersionRef.current = courseResult.value.lockVersion;
        setCourse(courseResult.value.draft);
        setRevisions(revisionResult.value.revisions);
        setSourceState("server-restored");
      });
      return () => {
        cancelled = true;
      };
    }
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
  }, [persistenceMode]);

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

  async function confirmUpdatePreview(
    preview: CourseRevisionUpdatePreview,
  ): Promise<CourseRevisionUpdateResult<CourseRevisionUpdateConfirmation>> {
    if (persistenceMode === "server") {
      const result = confirmCourseRevisionUpdate(
        course,
        revisions,
        preview,
        new Date().toISOString(),
      );
      if (!result.ok) return result;
      const saved = await persistenceApi<CourseRecord>(
        "/api/courses/local-course-1",
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedLockVersion: lockVersionRef.current,
            draft: result.value.courseDraft,
          }),
        },
      );
      if (!saved.ok) {
        return {
          ok: false,
          error: {
            kind: "stale_course_precondition",
            message: saved.error.message,
          },
        };
      }
      lockVersionRef.current = saved.value.lockVersion;
      setCourse(saved.value.draft);
      setSourceState("server-restored");
      return result;
    }
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
