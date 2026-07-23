"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COURSE_STORAGE_KEY,
  createCourseDraft,
  deriveCourseWarnings,
  moveCourseInstance,
  moveCourseInstanceTo,
  parseCourseDraft,
  placeCourseInstance,
  removeCourseInstance,
  rotateCourseInstance,
  serializeCourseDraft,
  type CourseDraft,
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

type SaveState =
  | "checking"
  | "restored"
  | "saved"
  | "recovered"
  | "unavailable";

const INITIAL_COURSE = createCourseDraft("1970-01-01T00:00:00.000Z");

function now() {
  return new Date().toISOString();
}

function localInstanceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `instance-${crypto.randomUUID()}`;
  }
  return `instance-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusLabel(state: SaveState) {
  switch (state) {
    case "checking":
      return "Checking this-device course…";
    case "restored":
      return "Course restored on this device";
    case "recovered":
      return "Stored course was invalid · fresh local course started";
    case "unavailable":
      return "Browser storage unavailable · changes last for this tab only";
    default:
      return "Course saved on this device";
  }
}

export function useLocalCourseWorkspace() {
  const [course, setCourse] = useState<CourseDraft>(INITIAL_COURSE);
  const [revisions, setRevisions] = useState<readonly LocalDesignRevision[]>(
    [],
  );
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("checking");
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
    null,
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("Course workspace loading.");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let nextCourse: CourseDraft;
      let nextState: SaveState;
      let nextRevisions: readonly LocalDesignRevision[] = [];
      try {
        const migratedLibrary = migrateLocalDesignLibrary({
          librarySerialized: window.localStorage.getItem(
            LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
          ),
          legacyWorkspaceSerialized: window.localStorage.getItem(
            LOCAL_WORKSPACE_STORAGE_KEY,
          ),
          now: now(),
          draftId: "course-library-migration-draft",
        });
        if (migratedLibrary.ok) {
          nextRevisions = localDesignLibraryRevisions(
            migratedLibrary.value.library,
          );
          window.localStorage.setItem(
            LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
            serializeLocalDesignLibrary(migratedLibrary.value.library),
          );
        }

        const courseSerialized =
          window.localStorage.getItem(COURSE_STORAGE_KEY);
        if (courseSerialized) {
          const parsed = parseCourseDraft(courseSerialized);
          if (parsed.ok) {
            nextCourse = parsed.value;
            nextState = "restored";
          } else {
            nextCourse = createCourseDraft(now());
            window.localStorage.setItem(
              COURSE_STORAGE_KEY,
              serializeCourseDraft(nextCourse),
            );
            nextState = "recovered";
          }
        } else {
          nextCourse = createCourseDraft(now());
          window.localStorage.setItem(
            COURSE_STORAGE_KEY,
            serializeCourseDraft(nextCourse),
          );
          nextState = "saved";
        }
      } catch {
        nextCourse = createCourseDraft(now());
        nextState = "unavailable";
      }
      setCourse(nextCourse);
      setRevisions(nextRevisions);
      setSelectedRevisionId(nextRevisions[0]?.revisionId ?? null);
      setSaveState(nextState);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const status = statusLabel(saveState);
  const unavailableArtworkRevisionIds =
    useRevisionArtworkAvailability(revisions);
  const selectedInstance = useMemo(
    () =>
      course.instances.find(
        (instance) => instance.instanceId === selectedInstanceId,
      ) ?? null,
    [course.instances, selectedInstanceId],
  );

  function commit(nextCourse: CourseDraft) {
    setCourse(nextCourse);
    try {
      window.localStorage.setItem(
        COURSE_STORAGE_KEY,
        serializeCourseDraft(nextCourse),
      );
      setSaveState("saved");
    } catch {
      setSaveState("unavailable");
    }
  }

  function announceInstance(
    prefix: string,
    nextCourse: CourseDraft,
    instanceId: string,
  ) {
    const instance = nextCourse.instances.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (!instance) return;
    const warningText = deriveCourseWarnings(nextCourse, revisions)
      .filter((warning) => warning.instanceIds.includes(instanceId))
      .map((warning) => warning.message)
      .join(" ");
    setAnnouncement(
      `${prefix} Obstacle ${instance.displayNumber}. Position ${(
        instance.xMm / 1000
      ).toFixed(1)} by ${(instance.yMm / 1000).toFixed(1)} metres. Rotation ${
        instance.rotationDeg
      } degrees.${warningText ? ` ${warningText}` : ""}`,
    );
  }

  function placeSelectedRevision() {
    if (!hydrated || !selectedRevisionId) return;
    const result = placeCourseInstance(course, {
      instanceId: localInstanceId(),
      obstacleDesignRevisionId: selectedRevisionId,
      now: now(),
    });
    if (!result.ok) return;
    const instance = result.value.instances.at(-1);
    if (!instance) return;
    commit(result.value);
    setSelectedInstanceId(instance.instanceId);
    announceInstance("Placed and selected", result.value, instance.instanceId);
  }

  function selectInstance(instanceId: string) {
    setSelectedInstanceId(instanceId);
    announceInstance("Selected", course, instanceId);
  }

  function moveSelected(
    delta: { xMm: number; yMm: number },
    targetInstanceId = selectedInstanceId,
  ) {
    if (!targetInstanceId) return;
    const result = moveCourseInstance(course, targetInstanceId, delta, now());
    if (!result.ok) return;
    commit(result.value);
    setSelectedInstanceId(targetInstanceId);
    announceInstance("Moved", result.value, targetInstanceId);
  }

  function moveSelectedTo(
    position: { xMm: number; yMm: number },
    targetInstanceId = selectedInstanceId,
  ) {
    if (!targetInstanceId) return;
    const result = moveCourseInstanceTo(
      course,
      targetInstanceId,
      position,
      now(),
    );
    if (!result.ok) return;
    commit(result.value);
    setSelectedInstanceId(targetInstanceId);
    announceInstance("Moved", result.value, targetInstanceId);
  }

  function rotateSelected(
    deltaDeg = 15,
    targetInstanceId = selectedInstanceId,
  ) {
    if (!targetInstanceId) return;
    const result = rotateCourseInstance(
      course,
      targetInstanceId,
      deltaDeg,
      now(),
    );
    if (!result.ok) return;
    commit(result.value);
    setSelectedInstanceId(targetInstanceId);
    announceInstance("Rotated", result.value, targetInstanceId);
  }

  function removeSelected(targetInstanceId = selectedInstanceId) {
    if (!targetInstanceId) return;
    const targetInstance = course.instances.find(
      (instance) => instance.instanceId === targetInstanceId,
    );
    if (!targetInstance) return;
    const removedNumber = targetInstance.displayNumber;
    const result = removeCourseInstance(course, targetInstanceId, now());
    if (!result.ok) return;
    commit(result.value);
    setSelectedInstanceId(null);
    setAnnouncement(`Removed Obstacle ${removedNumber}.`);
  }

  return {
    course,
    revisions,
    unavailableArtworkRevisionIds,
    hydrated,
    saveState,
    status,
    selectedRevisionId,
    setSelectedRevisionId,
    selectedInstanceId,
    selectedInstance,
    announcement,
    setAnnouncement,
    placeSelectedRevision,
    selectInstance,
    moveSelected,
    moveSelectedTo,
    rotateSelected,
    removeSelected,
  };
}
