import { describe, expect, it } from "vitest";
import {
  aggregateCourseQuantities,
  COURSE_SCHEMA_VERSION,
  createCourseDraft,
  deriveCourseWarnings,
  LARGE_MOVE_MM,
  moveCourseInstance,
  moveCourseInstanceTo,
  NORMAL_MOVE_MM,
  normalizeRotation,
  parseCourseDraft,
  placeCourseInstance,
  polygonsOverlapWithPositiveArea,
  PROTOTYPE_ARENA,
  removeCourseInstance,
  rotateCourseInstance,
  rotatedFootprintPolygon,
  ROTATION_STEP_DEG,
  serializeCourseDraft,
  type CourseDraft,
  type CourseResult,
} from "@/domain/course";
import {
  createLocalDesignWorkspace,
  saveLocalRevision,
  updateLocalDraft,
  type LocalWorkspaceResult,
} from "@/domain/design";

const T0 = "2026-07-13T10:00:00.000Z";
const T1 = "2026-07-13T10:01:00.000Z";
const T2 = "2026-07-13T10:02:00.000Z";

function courseSuccess(result: CourseResult<CourseDraft>): CourseDraft {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function workspaceSuccess<T>(result: LocalWorkspaceResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function revisions() {
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
  ).revisions;
}

function place(
  draft: CourseDraft,
  instanceId: string,
  revisionId = "revision-1",
  xMm = 30000,
  yMm = 20000,
) {
  return courseSuccess(
    placeCourseInstance(draft, {
      instanceId,
      obstacleDesignRevisionId: revisionId,
      xMm,
      yMm,
      now: T1,
    }),
  );
}

describe("Phase 1C course domain", () => {
  it("creates a valid empty versioned course with the exact prototype arena", () => {
    const draft = createCourseDraft(T0);
    expect(draft).toMatchObject({
      schemaVersion: COURSE_SCHEMA_VERSION,
      draftVersion: 1,
      arena: PROTOTYPE_ARENA,
      instances: [],
    });
    expect(PROTOTYPE_ARENA).toEqual({
      units: "mm",
      width: 60000,
      height: 40000,
      gridSize: 5000,
    });
  });

  it("places one immutable revision repeatedly with unique IDs and stable display numbers", () => {
    const first = place(createCourseDraft(T0), "instance-1");
    const second = place(first, "instance-2");
    expect(second.instances).toEqual([
      expect.objectContaining({
        instanceId: "instance-1",
        obstacleDesignRevisionId: "revision-1",
        displayNumber: 1,
      }),
      expect.objectContaining({
        instanceId: "instance-2",
        obstacleDesignRevisionId: "revision-1",
        displayNumber: 2,
      }),
    ]);
    const removed = courseSuccess(
      removeCourseInstance(second, "instance-1", T2),
    );
    const third = place(removed, "instance-3");
    expect(third.instances.map((instance) => instance.displayNumber)).toEqual([
      2, 3,
    ]);
    expect(
      placeCourseInstance(third, {
        instanceId: "instance-3",
        obstacleDesignRevisionId: "revision-1",
        now: T2,
      }),
    ).toMatchObject({ ok: false, error: { kind: "invalid_instance" } });
  });

  it("pins exact revision IDs and newer revisions never mutate placements", () => {
    const saved = revisions();
    const firstSnapshot = JSON.stringify(saved[0]);
    const draft = place(
      place(createCourseDraft(T0), "instance-1"),
      "instance-2",
    );
    expect(
      draft.instances.every(
        (instance) => instance.obstacleDesignRevisionId === "revision-1",
      ),
    ).toBe(true);
    expect(saved[1].revisionId).toBe("revision-2");
    expect(JSON.stringify(saved[0])).toBe(firstSnapshot);
  });

  it("moves in 500 and 2,000 mm steps and rotates in normalized 15-degree steps", () => {
    expect(NORMAL_MOVE_MM).toBe(500);
    expect(LARGE_MOVE_MM).toBe(2000);
    expect(ROTATION_STEP_DEG).toBe(15);
    const initial = place(createCourseDraft(T0), "instance-1");
    const moved = courseSuccess(
      moveCourseInstance(initial, "instance-1", { xMm: 500, yMm: -2000 }, T1),
    );
    expect(moved.instances[0]).toMatchObject({ xMm: 30500, yMm: 18000 });
    const pointerMoved = courseSuccess(
      moveCourseInstanceTo(moved, "instance-1", { xMm: 31149, yMm: 19180 }, T2),
    );
    expect(pointerMoved.instances[0]).toMatchObject({ xMm: 31000, yMm: 19000 });
    const rotated = courseSuccess(
      rotateCourseInstance(pointerMoved, "instance-1", -15, T2),
    );
    expect(rotated.instances[0].rotationDeg).toBe(345);
    expect(normalizeRotation(375)).toBe(15);
    expect(normalizeRotation(-15)).toBe(345);
  });

  it("movement and rotation never mutate revision data or quantities", () => {
    const saved = revisions();
    const source = JSON.stringify(saved);
    const initial = place(createCourseDraft(T0), "instance-1", "revision-2");
    const quantities = aggregateCourseQuantities(initial, saved);
    const moved = courseSuccess(
      moveCourseInstance(initial, "instance-1", { xMm: 2000, yMm: 500 }, T1),
    );
    const rotated = courseSuccess(
      rotateCourseInstance(moved, "instance-1", 15, T2),
    );
    expect(aggregateCourseQuantities(rotated, saved)).toEqual(quantities);
    expect(JSON.stringify(saved)).toBe(source);
  });

  it("derives rotated footprint polygons", () => {
    const instance = place(createCourseDraft(T0), "instance-1").instances[0];
    const polygon = rotatedFootprintPolygon(
      { ...instance, xMm: 0, yMm: 0, rotationDeg: 90 },
      { width: 5100, depth: 800 },
    );
    expect(polygon[0].x).toBeCloseTo(400);
    expect(polygon[0].y).toBeCloseTo(-2550);
    expect(polygon[2].x).toBeCloseTo(-400);
    expect(polygon[2].y).toBeCloseTo(2550);
  });

  it("warns only for positive-area overlap; touching edges are allowed", () => {
    const base = createCourseDraft(T0);
    const overlapping = place(
      place(base, "instance-1", "revision-1", 30000, 20000),
      "instance-2",
      "revision-1",
      32000,
      20000,
    );
    expect(deriveCourseWarnings(overlapping, revisions())).toContainEqual(
      expect.objectContaining({ kind: "overlap" }),
    );
    const separated = place(
      place(base, "instance-1", "revision-1", 20000, 20000),
      "instance-2",
      "revision-1",
      25500,
      20000,
    );
    const touching = {
      ...separated,
      instances: separated.instances.map((instance) =>
        instance.instanceId === "instance-2"
          ? { ...instance, xMm: 25100 }
          : instance,
      ),
    };
    expect(deriveCourseWarnings(touching, revisions())).not.toContainEqual(
      expect.objectContaining({ kind: "overlap" }),
    );
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(
      polygonsOverlapWithPositiveArea(
        square,
        square.map((p) => ({ ...p, x: p.x + 1 })),
      ),
    ).toBe(false);
  });

  it("warns out of bounds and clears geometry warnings after valid moves", () => {
    const out = place(createCourseDraft(T0), "instance-1", "revision-1", 0, 0);
    expect(deriveCourseWarnings(out, revisions())).toContainEqual(
      expect.objectContaining({ kind: "out_of_bounds" }),
    );
    const valid = courseSuccess(
      moveCourseInstanceTo(out, "instance-1", { xMm: 10000, yMm: 10000 }, T1),
    );
    expect(deriveCourseWarnings(valid, revisions())).toEqual([]);
  });

  it("reports a missing revision without trusting it for quantities", () => {
    const draft = place(createCourseDraft(T0), "instance-1", "unavailable");
    expect(deriveCourseWarnings(draft, revisions())).toEqual([
      expect.objectContaining({ kind: "missing_revision" }),
    ]);
    expect(
      aggregateCourseQuantities(draft, revisions()).obstacleInstances,
    ).toBe(0);
  });

  it("rolls up exact pinned bill-of-materials quantities", () => {
    const draft = place(
      place(createCourseDraft(T0), "instance-1", "revision-2"),
      "instance-2",
      "revision-2",
    );
    expect(aggregateCourseQuantities(draft, revisions())).toEqual({
      obstacleInstances: 2,
      printedWingAssemblies: 4,
      poles: 8,
      cupsOrReleaseAdapters: 16,
      trackAssemblies: 4,
      footOrBallastAssemblies: 4,
      flags: 4,
      poleEndCaps: 16,
      lowerElements: { decorative_panel: 0, gate: 2, filler: 0 },
    });
  });

  it("round-trips valid JSON and rejects malformed or tampered storage", () => {
    const draft = place(createCourseDraft(T0), "instance-1");
    expect(parseCourseDraft(serializeCourseDraft(draft))).toEqual({
      ok: true,
      value: draft,
    });
    expect(parseCourseDraft("not json")).toMatchObject({
      ok: false,
      error: { kind: "invalid_course" },
    });
    expect(
      parseCourseDraft(JSON.stringify({ ...draft, schemaVersion: "future" })),
    ).toMatchObject({
      ok: false,
      error: { kind: "unsupported_course_schema" },
    });
    for (const change of [
      { instances: [{ ...draft.instances[0], xMm: "no" }] },
      { instances: [{ ...draft.instances[0], rotationDeg: 7 }] },
      { instances: [{ ...draft.instances[0], obstacleDesignRevisionId: "" }] },
      { arena: { ...draft.arena, width: 100 } },
    ]) {
      expect(parseCourseDraft(JSON.stringify({ ...draft, ...change })).ok).toBe(
        false,
      );
    }
    expect(
      parseCourseDraft(
        JSON.stringify({
          ...draft,
          instances: [draft.instances[0], draft.instances[0]],
        }),
      ),
    ).toMatchObject({ ok: false, error: { kind: "invalid_instance" } });
  });
});
