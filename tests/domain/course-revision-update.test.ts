import { describe, expect, it } from "vitest";
import {
  buildCourseRevisionUpdatePreview,
  confirmCourseRevisionUpdate,
  createCourseDraft,
  placeCourseInstance,
  type CourseDraft,
  type CourseResult,
  type CourseRevisionUpdatePreview,
  type CourseRevisionUpdateResult,
} from "@/domain/course";
import {
  createLocalDesignWorkspace,
  saveLocalRevision,
  updateLocalDraft,
  type LocalDesignWorkspace,
  type LocalWorkspaceResult,
  type ObstacleDesignRevision,
} from "@/domain/design";

const T0 = "2026-07-14T08:00:00.000Z";
const T1 = "2026-07-14T08:01:00.000Z";
const T2 = "2026-07-14T08:02:00.000Z";
const T3 = "2026-07-14T08:03:00.000Z";
const T4 = "2026-07-14T08:04:00.000Z";

function workspaceSuccess<T>(result: LocalWorkspaceResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function courseSuccess(result: CourseResult<CourseDraft>): CourseDraft {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function updateSuccess<T>(result: CourseRevisionUpdateResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function revisionWorkspace(): LocalDesignWorkspace {
  const initial = createLocalDesignWorkspace({ draftId: "draft-1", now: T0 });
  const first = workspaceSuccess(
    saveLocalRevision(initial, { revisionId: "revision-1", now: T1 }),
  );
  const redGate = workspaceSuccess(
    updateLocalDraft(
      first,
      { ...first.draft.intent, frameColor: "red", lowerElement: "gate" },
      T2,
    ),
  );
  const second = workspaceSuccess(
    saveLocalRevision(redGate, { revisionId: "revision-2", now: T2 }),
  );
  const yellowFiller = workspaceSuccess(
    updateLocalDraft(
      second,
      {
        ...second.draft.intent,
        frameColor: "yellow",
        lowerElement: "filler",
      },
      T3,
    ),
  );
  return workspaceSuccess(
    saveLocalRevision(yellowFiller, {
      revisionId: "revision-3",
      now: T3,
    }),
  );
}

function mixedCourse(): CourseDraft {
  let draft = createCourseDraft(T0);
  draft = courseSuccess(
    placeCourseInstance(draft, {
      instanceId: "instance-1",
      obstacleDesignRevisionId: "revision-1",
      xMm: 16000,
      yMm: 16000,
      now: T1,
    }),
  );
  draft = courseSuccess(
    placeCourseInstance(draft, {
      instanceId: "instance-2",
      obstacleDesignRevisionId: "revision-1",
      xMm: 18000,
      yMm: 16000,
      now: T2,
    }),
  );
  return courseSuccess(
    placeCourseInstance(draft, {
      instanceId: "instance-3",
      obstacleDesignRevisionId: "revision-2",
      xMm: 42000,
      yMm: 24000,
      rotationDeg: 15,
      now: T3,
    }),
  );
}

function updateOnePreview(): CourseRevisionUpdatePreview {
  const workspace = revisionWorkspace();
  return updateSuccess(
    buildCourseRevisionUpdatePreview(mixedCourse(), workspace.revisions, {
      kind: "update_one",
      instanceId: "instance-1",
      sourceRevisionId: "revision-1",
      destinationRevisionId: "revision-3",
    }),
  );
}

describe("Phase 1E course revision updates", () => {
  it("previews update-one for exactly one named course instance", () => {
    const preview = updateOnePreview();
    expect(preview.operation.kind).toBe("update_one");
    expect(preview.affectedDisplayNumbers).toEqual([1]);
    expect(preview.instanceCount).toBe(1);
    expect(preview.affectedPlacements).toEqual([
      {
        instanceId: "instance-1",
        displayNumber: 1,
        beforePinnedRevisionId: "revision-1",
        afterPinnedRevisionId: "revision-3",
      },
    ]);
  });

  it("previews replace-all for exact source-revision matches only", () => {
    const workspace = revisionWorkspace();
    const preview = updateSuccess(
      buildCourseRevisionUpdatePreview(mixedCourse(), workspace.revisions, {
        kind: "replace_all_from_revision",
        sourceRevisionId: "revision-1",
        destinationRevisionId: "revision-3",
      }),
    );
    expect(preview.affectedDisplayNumbers).toEqual([1, 2]);
    expect(preview.affectedPlacements.map((item) => item.instanceId)).toEqual([
      "instance-1",
      "instance-2",
    ]);
    expect(
      preview.affectedPlacements.some(
        (item) => item.instanceId === "instance-3",
      ),
    ).toBe(false);
  });

  it("derives exact before, after, delta, warning, and hash evidence", () => {
    const preview = updateOnePreview();
    expect(preview.quantities.before).toMatchObject({
      obstacleInstances: 3,
      lowerElements: { decorative_panel: 0, gate: 1, filler: 0 },
    });
    expect(preview.quantities.after).toMatchObject({
      obstacleInstances: 3,
      lowerElements: { decorative_panel: 0, gate: 1, filler: 1 },
    });
    expect(preview.quantities.delta).toMatchObject({
      obstacleInstances: 0,
      poles: 0,
      lowerElements: { decorative_panel: 0, gate: 0, filler: 1 },
    });
    expect(preview.geometryWarnings.after).toEqual(
      preview.geometryWarnings.before,
    );
    expect(preview.currentReviewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.proposedReviewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.proposedReviewHash).not.toBe(preview.currentReviewHash);
  });

  it("confirms the previewed complete course and review hash exactly once", () => {
    const workspace = revisionWorkspace();
    const course = mixedCourse();
    const preview = updateSuccess(
      buildCourseRevisionUpdatePreview(course, workspace.revisions, {
        kind: "update_one",
        instanceId: "instance-1",
        sourceRevisionId: "revision-1",
        destinationRevisionId: "revision-3",
      }),
    );
    const confirmed = updateSuccess(
      confirmCourseRevisionUpdate(course, workspace.revisions, preview, T4),
    );
    expect(confirmed.courseDraft.draftVersion).toBe(course.draftVersion + 1);
    expect(confirmed.courseDraft.updatedAt).toBe(T4);
    expect(confirmed.review.reviewHash).toBe(preview.proposedReviewHash);
    expect(confirmed.courseDraft.instances[0].obstacleDesignRevisionId).toBe(
      "revision-3",
    );
  });

  it("leaves revision snapshots byte-for-byte unchanged", () => {
    const workspace = revisionWorkspace();
    const revisionsBefore = JSON.stringify(workspace.revisions);
    const course = mixedCourse();
    const preview = updateSuccess(
      buildCourseRevisionUpdatePreview(course, workspace.revisions, {
        kind: "replace_all_from_revision",
        sourceRevisionId: "revision-1",
        destinationRevisionId: "revision-3",
      }),
    );
    updateSuccess(
      confirmCourseRevisionUpdate(course, workspace.revisions, preview, T4),
    );
    expect(JSON.stringify(workspace.revisions)).toBe(revisionsBefore);
  });

  it("leaves unrelated course placements byte-for-byte unchanged", () => {
    const workspace = revisionWorkspace();
    const course = mixedCourse();
    const unrelatedBefore = JSON.stringify(course.instances[2]);
    const preview = updateSuccess(
      buildCourseRevisionUpdatePreview(course, workspace.revisions, {
        kind: "replace_all_from_revision",
        sourceRevisionId: "revision-1",
        destinationRevisionId: "revision-3",
      }),
    );
    const confirmed = updateSuccess(
      confirmCourseRevisionUpdate(course, workspace.revisions, preview, T4),
    );
    expect(JSON.stringify(confirmed.courseDraft.instances[2])).toBe(
      unrelatedBefore,
    );
  });

  it("returns typed missing source and destination failures", () => {
    const workspace = revisionWorkspace();
    expect(
      buildCourseRevisionUpdatePreview(mixedCourse(), workspace.revisions, {
        kind: "replace_all_from_revision",
        sourceRevisionId: "missing-source",
        destinationRevisionId: "revision-3",
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "missing_source_revision" },
    });
    expect(
      buildCourseRevisionUpdatePreview(mixedCourse(), workspace.revisions, {
        kind: "replace_all_from_revision",
        sourceRevisionId: "revision-1",
        destinationRevisionId: "missing-destination",
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "missing_destination_revision" },
    });
  });

  it("rejects a destination revision from another design", () => {
    const workspace = revisionWorkspace();
    const incompatible = {
      ...workspace.revisions[2],
      revisionId: "other-design-revision",
      designId: "other-design",
    } as unknown as ObstacleDesignRevision;
    expect(
      buildCourseRevisionUpdatePreview(
        mixedCourse(),
        [...workspace.revisions, incompatible],
        {
          kind: "update_one",
          instanceId: "instance-1",
          sourceRevisionId: "revision-1",
          destinationRevisionId: "other-design-revision",
        },
      ),
    ).toMatchObject({ ok: false, error: { kind: "incompatible_design" } });
  });

  it("rejects a missing update-one placement", () => {
    const workspace = revisionWorkspace();
    expect(
      buildCourseRevisionUpdatePreview(mixedCourse(), workspace.revisions, {
        kind: "update_one",
        instanceId: "missing-instance",
        sourceRevisionId: "revision-1",
        destinationRevisionId: "revision-3",
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "missing_course_instance" },
    });
  });

  it("rejects replace-all when no exact source matches remain", () => {
    const workspace = revisionWorkspace();
    expect(
      buildCourseRevisionUpdatePreview(mixedCourse(), workspace.revisions, {
        kind: "replace_all_from_revision",
        sourceRevisionId: "revision-3",
        destinationRevisionId: "revision-2",
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "destination_not_newer" },
    });
    const fourth = {
      ...workspace.revisions[2],
      revisionId: "revision-4",
      ordinal: 4,
    };
    expect(
      buildCourseRevisionUpdatePreview(
        mixedCourse(),
        [...workspace.revisions, fourth],
        {
          kind: "replace_all_from_revision",
          sourceRevisionId: "revision-3",
          destinationRevisionId: "revision-4",
        },
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "no_matching_placements" },
    });
  });

  it("rejects stale course and review preconditions without a result", () => {
    const workspace = revisionWorkspace();
    const course = mixedCourse();
    const preview = updateOnePreview();
    const stale: CourseDraft = {
      ...course,
      draftVersion: course.draftVersion + 1,
      updatedAt: T4,
    };
    expect(
      confirmCourseRevisionUpdate(stale, workspace.revisions, preview, T4),
    ).toMatchObject({
      ok: false,
      error: { kind: "stale_course_precondition" },
    });
  });

  it("rejects a no-longer-current exact target set", () => {
    const workspace = revisionWorkspace();
    const course = mixedCourse();
    const preview = updateSuccess(
      buildCourseRevisionUpdatePreview(course, workspace.revisions, {
        kind: "replace_all_from_revision",
        sourceRevisionId: "revision-1",
        destinationRevisionId: "revision-3",
      }),
    );
    const tampered = {
      ...preview,
      precondition: {
        ...preview.precondition,
        affectedPlacements: preview.precondition.affectedPlacements.slice(0, 1),
      },
    };
    expect(
      confirmCourseRevisionUpdate(course, workspace.revisions, tampered, T4),
    ).toMatchObject({
      ok: false,
      error: { kind: "stale_course_precondition" },
    });
  });

  it("rejects an invalid complete replacement course", () => {
    const workspace = revisionWorkspace();
    const course = mixedCourse();
    const preview = updateOnePreview();
    expect(
      confirmCourseRevisionUpdate(course, workspace.revisions, preview, ""),
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid_resulting_course" },
    });
  });
});
