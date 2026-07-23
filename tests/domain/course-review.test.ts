import { describe, expect, it } from "vitest";
import {
  buildCourseReviewSnapshot,
  COURSE_REVIEW_DISCLAIMER,
  COURSE_REVIEW_SCHEMA_VERSION,
  createCourseDraft,
  placeCourseInstance,
  type CourseDraft,
  type CourseResult,
} from "@/domain/course";
import {
  createLocalDesignWorkspace,
  saveLocalRevision,
  updateLocalDraft,
  type LocalDesignWorkspace,
  type LocalWorkspaceResult,
} from "@/domain/design";

const T0 = "2026-07-13T10:00:00.000Z";
const T1 = "2026-07-13T10:01:00.000Z";
const T2 = "2026-07-13T10:02:00.000Z";
const T3 = "2026-07-13T10:03:00.000Z";

function courseSuccess(result: CourseResult<CourseDraft>) {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function workspaceSuccess<T>(result: LocalWorkspaceResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function revisionWorkspace(): LocalDesignWorkspace {
  const initial = createLocalDesignWorkspace({ draftId: "draft-1", now: T0 });
  const first = workspaceSuccess(
    saveLocalRevision(initial, { revisionId: "revision-1", now: T1 }),
  );
  const changed = workspaceSuccess(
    updateLocalDraft(
      first,
      { ...first.draft.intent, frameColor: "red", lowerElement: "gate" },
      T2,
    ),
  );
  return workspaceSuccess(
    saveLocalRevision(changed, { revisionId: "revision-2", now: T2 }),
  );
}

function withThirdRevision(workspace = revisionWorkspace()) {
  const changed = workspaceSuccess(
    updateLocalDraft(
      workspace,
      {
        ...workspace.draft.intent,
        frameColor: "yellow",
        lowerElement: "filler",
      },
      T3,
    ),
  );
  return workspaceSuccess(
    saveLocalRevision(changed, { revisionId: "revision-3", now: T3 }),
  );
}

function placedCourse() {
  let draft = createCourseDraft(T0);
  draft = courseSuccess(
    placeCourseInstance(draft, {
      instanceId: "instance-2",
      obstacleDesignRevisionId: "revision-2",
      xMm: 40000,
      yMm: 22000,
      rotationDeg: 30,
      now: T1,
    }),
  );
  draft = courseSuccess(
    placeCourseInstance(draft, {
      instanceId: "instance-1",
      obstacleDesignRevisionId: "revision-1",
      xMm: 20000,
      yMm: 18000,
      rotationDeg: 0,
      now: T2,
    }),
  );
  return draft;
}

describe("Phase 1D course review domain", () => {
  it("builds the explicit deterministic review schema from pinned revisions", () => {
    const snapshot = buildCourseReviewSnapshot(
      placedCourse(),
      revisionWorkspace().revisions,
    );
    expect(snapshot).toMatchObject({
      schemaVersion: COURSE_REVIEW_SCHEMA_VERSION,
      courseId: "local-course-1",
      arena: { units: "mm", width: 60000, height: 40000, gridSize: 5000 },
      completeness: "complete",
      hashAlgorithm: "sha256",
    });
    expect(snapshot.reviewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      snapshot.placements.map((placement) => placement.displayNumber),
    ).toEqual([1, 2]);
    expect(snapshot.placements[0]).toMatchObject({
      obstacleDesignRevisionId: "revision-2",
      pinnedRevision: {
        ordinal: 2,
        name: "Club Classic · Revision 2",
      },
      pinnedFootprint: { width: 5100, depth: 800 },
      pinnedBillOfMaterials: { notForOrdering: true },
      pinnedProductionSpec: { notForProduction: true },
    });
  });

  it("canonicalizes placement, revision, and warning source ordering", () => {
    const workspace = revisionWorkspace();
    const draft = placedCourse();
    const overlapping: CourseDraft = {
      ...draft,
      instances: draft.instances.map((instance) =>
        instance.displayNumber === 2
          ? { ...instance, xMm: 41000, yMm: 22000 }
          : { ...instance, xMm: 40000, yMm: 22000 },
      ),
    };
    const first = buildCourseReviewSnapshot(overlapping, workspace.revisions);
    const second = buildCourseReviewSnapshot(
      { ...overlapping, instances: [...overlapping.instances].reverse() },
      [...workspace.revisions].reverse(),
    );
    expect(second.placements).toEqual(first.placements);
    expect(second.geometryWarnings).toEqual(first.geometryWarnings);
    expect(second.reviewHash).toBe(first.reviewHash);
  });

  it("changes the hash for movement, rotation, or a different pinned revision", () => {
    const workspace = revisionWorkspace();
    const draft = placedCourse();
    const initial = buildCourseReviewSnapshot(draft, workspace.revisions);
    const moved = buildCourseReviewSnapshot(
      {
        ...draft,
        instances: draft.instances.map((instance) =>
          instance.displayNumber === 1
            ? { ...instance, xMm: instance.xMm + 500 }
            : instance,
        ),
      },
      workspace.revisions,
    );
    const rotated = buildCourseReviewSnapshot(
      {
        ...draft,
        instances: draft.instances.map((instance) =>
          instance.displayNumber === 1
            ? { ...instance, rotationDeg: 45 }
            : instance,
        ),
      },
      workspace.revisions,
    );
    const repinned = buildCourseReviewSnapshot(
      {
        ...draft,
        instances: draft.instances.map((instance) =>
          instance.displayNumber === 2
            ? { ...instance, obstacleDesignRevisionId: "revision-2" }
            : instance,
        ),
      },
      workspace.revisions,
    );
    expect(moved.reviewHash).not.toBe(initial.reviewHash);
    expect(rotated.reviewHash).not.toBe(initial.reviewHash);
    expect(repinned.reviewHash).not.toBe(initial.reviewHash);
  });

  it("keeps the hash stable when an unused newer revision is created", () => {
    const workspace = revisionWorkspace();
    const draft: CourseDraft = {
      ...placedCourse(),
      instances: placedCourse().instances.map((instance) => ({
        ...instance,
        obstacleDesignRevisionId: "revision-1",
      })),
    };
    const before = buildCourseReviewSnapshot(draft, workspace.revisions);
    const after = buildCourseReviewSnapshot(
      draft,
      withThirdRevision(workspace).revisions,
    );
    expect(after.reviewHash).toBe(before.reviewHash);
    expect(
      after.placements.every(
        (placement) =>
          placement.newerRevisionAvailable?.revisionId === "revision-3",
      ),
    ).toBe(true);
    expect(
      after.placements.every(
        (placement) => placement.obstacleDesignRevisionId === "revision-1",
      ),
    ).toBe(true);
  });

  it("aggregates exact mixed-revision quantities", () => {
    const snapshot = buildCourseReviewSnapshot(
      placedCourse(),
      revisionWorkspace().revisions,
    );
    expect(snapshot.equipmentQuantities).toEqual({
      obstacleInstances: 2,
      printedWingAssemblies: 4,
      poles: 8,
      cupsOrReleaseAdapters: 16,
      trackAssemblies: 4,
      footOrBallastAssemblies: 4,
      flags: 4,
      poleEndCaps: 16,
      lowerElements: { decorative_panel: 0, gate: 1, filler: 0 },
    });
  });

  it("marks missing revisions incomplete without inventing quantities", () => {
    const draft: CourseDraft = {
      ...placedCourse(),
      instances: [
        placedCourse().instances[0],
        {
          ...placedCourse().instances[1],
          obstacleDesignRevisionId: "missing-revision",
        },
      ],
    };
    const snapshot = buildCourseReviewSnapshot(
      draft,
      revisionWorkspace().revisions,
    );
    expect(snapshot.completeness).toBe("incomplete");
    expect(snapshot.missingRevisionReferences).toEqual([
      {
        instanceId: "instance-1",
        displayNumber: 2,
        obstacleDesignRevisionId: "missing-revision",
      },
    ]);
    expect(snapshot.placements[1]).toMatchObject({
      pinnedRevision: null,
      pinnedFootprint: null,
      pinnedBillOfMaterials: null,
      pinnedProductionSpec: null,
    });
    expect(snapshot.equipmentQuantities.obstacleInstances).toBe(1);
    expect(snapshot.geometryWarnings).toContainEqual(
      expect.objectContaining({
        kind: "missing_revision",
        displayNumbers: [2],
      }),
    );
  });

  it("detects a newer revision without mutating the course or pinned inputs", () => {
    const workspace = withThirdRevision();
    const draft = placedCourse();
    const source = JSON.stringify(draft);
    const snapshot = buildCourseReviewSnapshot(draft, workspace.revisions);
    expect(snapshot.placements[0].newerRevisionAvailable).toMatchObject({
      revisionId: "revision-3",
      ordinal: 3,
    });
    expect(snapshot.placements[0].pinnedRevision?.revisionId).toBe(
      "revision-2",
    );
    expect(JSON.stringify(draft)).toBe(source);
  });

  it("includes the prototype disclaimer in human and machine-readable content", () => {
    const snapshot = buildCourseReviewSnapshot(
      placedCourse(),
      revisionWorkspace().revisions,
    );
    expect(snapshot.prototypeDisclaimer).toBe(COURSE_REVIEW_DISCLAIMER);
    expect(snapshot.humanReadableSpecification.disclaimer).toBe(
      COURSE_REVIEW_DISCLAIMER,
    );
    expect(JSON.stringify(snapshot)).toContain("not supplier-approved");
    expect(snapshot.prototypeExclusions).toContainEqual(
      expect.stringContaining("No retail pricing"),
    );
  });
});
