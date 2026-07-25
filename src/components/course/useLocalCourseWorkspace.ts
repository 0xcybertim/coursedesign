"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COURSE_STORAGE_KEY,
  addCourseScenery,
  createCourseDraft,
  deriveCourseWarnings,
  moveCourseInstance,
  moveCourseInstanceTo,
  moveCourseScenery,
  parseCourseDraft,
  placeCourseInstance,
  removeCourseInstance,
  removeCourseScenery,
  rotateCourseInstance,
  serializeCourseDraft,
  setCourseSurface,
  type CourseDraft,
  type CourseSceneryKind,
  type CourseSurface,
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
import type {
  CourseRecord,
  DesignRevisionPage,
  PersistenceFailure,
} from "@/persistence";
import { persistenceApi } from "@/lib/browser/persistence-api";
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

function localSceneryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `scenery-${crypto.randomUUID()}`;
  }
  return `scenery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const SCENERY_LABEL: Record<CourseSceneryKind, string> = {
  palm_tree: "Palm tree",
  leafy_tree: "Leafy tree",
  flower_box: "Flower box",
};

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

export function useLocalCourseWorkspace(requestedRevisionId?: string) {
  const persistenceMode = usePersistenceMode();
  const [course, setCourse] = useState<CourseDraft>(INITIAL_COURSE);
  const [revisions, setRevisions] = useState<readonly LocalDesignRevision[]>(
    [],
  );
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("checking");
  const [status, setStatus] = useState(statusLabel("checking"));
  const [conflict, setConflict] = useState<{
    readonly attempted: CourseDraft;
    readonly latest: CourseRecord;
  } | null>(null);
  const lockVersionRef = useRef(1);
  const saveQueue = useRef(Promise.resolve());
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
    null,
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [selectedSceneryId, setSelectedSceneryId] = useState<string | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("Course workspace loading.");
  const [requestedRevisionStatus, setRequestedRevisionStatus] = useState<
    "none" | "ready" | "invalid"
  >("none");

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
        if (!courseResult.ok) {
          setStatus(courseResult.error.message);
          setSaveState("unavailable");
          setHydrated(true);
          return;
        }
        if (!revisionResult.ok) {
          setStatus(revisionResult.error.message);
          setSaveState("unavailable");
          setHydrated(true);
          return;
        }
        const nextCourse = courseResult.value.draft;
        const nextRevisions = revisionResult.value.revisions;
        lockVersionRef.current = courseResult.value.lockVersion;
        setCourse(nextCourse);
        setRevisions(nextRevisions);
        const requestedRevision = requestedRevisionId
          ? nextRevisions.find(
              (revision) => revision.revisionId === requestedRevisionId,
            )
          : null;
        if (requestedRevision) {
          setSelectedRevisionId(requestedRevision.revisionId);
          setRequestedRevisionStatus("ready");
          setAnnouncement(
            `Revision ${String(requestedRevision.ordinal).padStart(
              2,
              "0",
            )} is ready to place.`,
          );
        } else {
          setSelectedRevisionId(nextRevisions[0]?.revisionId ?? null);
          if (requestedRevisionId) {
            setRequestedRevisionStatus("invalid");
            setAnnouncement(
              "The requested saved revision is unavailable. No placement was created.",
            );
          }
        }
        setSaveState("restored");
        setStatus("Course restored from server workspace");
        setHydrated(true);
      });
      return () => {
        cancelled = true;
      };
    }
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
      const requestedRevision = requestedRevisionId
        ? nextRevisions.find(
            (revision) => revision.revisionId === requestedRevisionId,
          )
        : null;
      if (requestedRevision) {
        setSelectedRevisionId(requestedRevision.revisionId);
        setRequestedRevisionStatus("ready");
        setAnnouncement(
          `Revision ${String(requestedRevision.ordinal).padStart(
            2,
            "0",
          )} is ready to place.`,
        );
      } else {
        setSelectedRevisionId(nextRevisions[0]?.revisionId ?? null);
        if (requestedRevisionId) {
          setRequestedRevisionStatus("invalid");
          setAnnouncement(
            "The requested saved revision is unavailable. No placement was created.",
          );
        }
      }
      setSaveState(nextState);
      setStatus(statusLabel(nextState));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [persistenceMode, requestedRevisionId]);

  const unavailableArtworkRevisionIds =
    useRevisionArtworkAvailability(revisions);
  const selectedInstance = useMemo(
    () =>
      course.instances.find(
        (instance) => instance.instanceId === selectedInstanceId,
      ) ?? null,
    [course.instances, selectedInstanceId],
  );
  const selectedScenery = useMemo(
    () =>
      course.environment.scenery.find(
        (item) => item.sceneryId === selectedSceneryId,
      ) ?? null,
    [course.environment.scenery, selectedSceneryId],
  );

  function commit(nextCourse: CourseDraft) {
    setCourse(nextCourse);
    if (persistenceMode === "server") {
      setStatus("Saving course to server workspace…");
      saveQueue.current = saveQueue.current.then(async () => {
        const expectedLockVersion = lockVersionRef.current;
        const saved = await persistenceApi<CourseRecord>(
          "/api/courses/local-course-1",
          {
            method: "PATCH",
            body: JSON.stringify({
              expectedLockVersion,
              draft: nextCourse,
            }),
          },
        );
        if (saved.ok) {
          lockVersionRef.current = saved.value.lockVersion;
          setCourse((current) =>
            current.updatedAt === nextCourse.updatedAt
              ? saved.value.draft
              : current,
          );
          setConflict(null);
          setSaveState("saved");
          setStatus("Course saved to server workspace");
          return;
        }
        if (saved.error.kind === "stale_version") {
          const stale = saved as PersistenceFailure<CourseRecord>;
          if (stale.error.kind === "stale_version") {
            lockVersionRef.current = stale.error.actualLockVersion;
            setConflict({ attempted: nextCourse, latest: stale.error.latest });
            setSaveState("unavailable");
            setStatus(
              "Conflict: this course changed elsewhere. Your attempted edit is preserved.",
            );
            return;
          }
        }
        setSaveState("unavailable");
        setStatus(saved.error.message);
      });
      return;
    }
    try {
      window.localStorage.setItem(
        COURSE_STORAGE_KEY,
        serializeCourseDraft(nextCourse),
      );
      setSaveState("saved");
      setStatus(statusLabel("saved"));
    } catch {
      setSaveState("unavailable");
      setStatus(statusLabel("unavailable"));
    }
  }

  function reloadLatest() {
    if (!conflict) return;
    lockVersionRef.current = conflict.latest.lockVersion;
    setCourse(conflict.latest.draft);
    setConflict(null);
    setSaveState("restored");
    setStatus("Latest server course loaded. Your prior attempt was not saved.");
  }

  function retryAttempted() {
    if (!conflict) return;
    const attempted = conflict.attempted;
    setConflict(null);
    commit(attempted);
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
    setSelectedSceneryId(null);
    announceInstance("Placed and selected", result.value, instance.instanceId);
  }

  function selectInstance(instanceId: string) {
    setSelectedInstanceId(instanceId);
    setSelectedSceneryId(null);
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

  function updateSurface(surface: CourseSurface) {
    const result = setCourseSurface(course, surface, now());
    if (!result.ok) return;
    commit(result.value);
    setAnnouncement(
      `${surface === "grass" ? "Grass" : "Sand"} surface selected. This visual environment does not change obstacle geometry or equipment quantities.`,
    );
  }

  function addScenery(kind: CourseSceneryKind) {
    const result = addCourseScenery(course, {
      sceneryId: localSceneryId(),
      kind,
      now: now(),
    });
    if (!result.ok) return;
    const item = result.value.environment.scenery.at(-1);
    if (!item) return;
    commit(result.value);
    setSelectedInstanceId(null);
    setSelectedSceneryId(item.sceneryId);
    setAnnouncement(
      `Added and selected ${SCENERY_LABEL[kind]} ${item.displayNumber}. Visual scenery is excluded from obstacle warnings and equipment quantities.`,
    );
  }

  function selectScenery(sceneryId: string) {
    const item = course.environment.scenery.find(
      (candidate) => candidate.sceneryId === sceneryId,
    );
    if (!item) return;
    setSelectedInstanceId(null);
    setSelectedSceneryId(sceneryId);
    setAnnouncement(
      `Selected ${SCENERY_LABEL[item.kind]} ${item.displayNumber}. Position ${(item.xMm / 1000).toFixed(1)} by ${(item.yMm / 1000).toFixed(1)} metres.`,
    );
  }

  function moveSelectedScenery(
    delta: { xMm: number; yMm: number },
    targetSceneryId = selectedSceneryId,
  ) {
    if (!targetSceneryId) return;
    const result = moveCourseScenery(course, targetSceneryId, delta, now());
    if (!result.ok) return;
    commit(result.value);
    setSelectedSceneryId(targetSceneryId);
    const item = result.value.environment.scenery.find(
      (candidate) => candidate.sceneryId === targetSceneryId,
    );
    if (!item) return;
    setAnnouncement(
      `Moved ${SCENERY_LABEL[item.kind]} ${item.displayNumber}. Position ${(item.xMm / 1000).toFixed(1)} by ${(item.yMm / 1000).toFixed(1)} metres.`,
    );
  }

  function removeSelectedScenery(targetSceneryId = selectedSceneryId) {
    if (!targetSceneryId) return;
    const item = course.environment.scenery.find(
      (candidate) => candidate.sceneryId === targetSceneryId,
    );
    if (!item) return;
    const result = removeCourseScenery(course, targetSceneryId, now());
    if (!result.ok) return;
    commit(result.value);
    setSelectedSceneryId(null);
    setAnnouncement(
      `Removed ${SCENERY_LABEL[item.kind]} ${item.displayNumber}.`,
    );
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
    selectedSceneryId,
    selectedScenery,
    announcement,
    requestedRevisionStatus,
    conflict,
    setAnnouncement,
    placeSelectedRevision,
    selectInstance,
    moveSelected,
    moveSelectedTo,
    rotateSelected,
    removeSelected,
    updateSurface,
    addScenery,
    selectScenery,
    moveSelectedScenery,
    removeSelectedScenery,
    reloadLatest,
    retryAttempted,
  };
}
