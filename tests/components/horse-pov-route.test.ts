import { describe, expect, it } from "vitest";
import {
  buildHorsePovRoute,
  sampleHorsePovRoute,
} from "@/components/course/horse-pov-route";
import {
  createCourseDraft,
  placeCourseInstance,
  type CourseDraft,
} from "@/domain/course";

const T0 = "2026-07-23T16:00:00.000Z";
const T1 = "2026-07-23T16:01:00.000Z";

function oneJumpCourse(input?: {
  readonly xMm?: number;
  readonly yMm?: number;
  readonly rotationDeg?: number;
}): CourseDraft {
  const result = placeCourseInstance(createCourseDraft(T0), {
    instanceId: "horse-pov-jump-1",
    obstacleDesignRevisionId: "known-revision",
    xMm: input?.xMm ?? 30000,
    yMm: input?.yMm ?? 20000,
    rotationDeg: input?.rotationDeg ?? 0,
    now: T1,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function twoJumpCourse(): CourseDraft {
  const first = placeCourseInstance(createCourseDraft(T0), {
    instanceId: "horse-pov-jump-1",
    obstacleDesignRevisionId: "known-revision",
    xMm: 18000,
    yMm: 12000,
    rotationDeg: 0,
    now: T1,
  });
  if (!first.ok) throw new Error(first.error.message);
  const second = placeCourseInstance(first.value, {
    instanceId: "horse-pov-jump-2",
    obstacleDesignRevisionId: "known-revision",
    xMm: 43000,
    yMm: 29000,
    rotationDeg: 90,
    now: T1,
  });
  if (!second.ok) throw new Error(second.error.message);
  return second.value;
}

describe("Horse POV inferred route", () => {
  it("builds approach, takeoff, apex, landing, and exit across the obstacle face", () => {
    const route = buildHorsePovRoute(
      oneJumpCourse(),
      new Set(["known-revision"]),
    );

    expect(route.points.map((point) => point.phase)).toEqual([
      "approach",
      "takeoff",
      "apex",
      "landing",
      "exit",
    ]);
    expect(route.jumpDisplayNumbers).toEqual([1]);
    expect(route.points[0]).toMatchObject({ x: 0, z: -8 });
    expect(route.points[2]).toMatchObject({
      x: 0,
      z: 0,
      displayNumber: 1,
    });
    expect(route.points[2].y).toBeGreaterThan(route.points[0].y);
    expect(route.points[4]).toMatchObject({ x: 0, z: 6.5 });
    expect(route.durationSeconds).toBeGreaterThan(0);
  });

  it("uses obstacle rotation to keep the travel line perpendicular", () => {
    const route = buildHorsePovRoute(
      oneJumpCourse({ rotationDeg: 90 }),
      new Set(["known-revision"]),
    );
    const approach = route.points[0];
    const apex = route.points[2];
    const exit = route.points[4];

    expect(Math.abs(approach.z)).toBeLessThan(1e-10);
    expect(Math.abs(exit.z)).toBeLessThan(1e-10);
    expect(approach.x).toBeGreaterThan(apex.x);
    expect(exit.x).toBeLessThan(apex.x);
  });

  it("keeps inferred route points inside the prototype arena", () => {
    const route = buildHorsePovRoute(
      oneJumpCourse({ yMm: 1000 }),
      new Set(["known-revision"]),
    );

    for (const point of route.points) {
      expect(point.x).toBeGreaterThanOrEqual(-30);
      expect(point.x).toBeLessThanOrEqual(30);
      expect(point.z).toBeGreaterThanOrEqual(-20);
      expect(point.z).toBeLessThanOrEqual(20);
    }
  });

  it("curves between jump corridors without abrupt direction changes", () => {
    const route = buildHorsePovRoute(
      twoJumpCourse(),
      new Set(["known-revision"]),
    );
    const directions = route.pathSamples
      .slice(1)
      .map((point, index) => {
        const previous = route.pathSamples[index];
        const x = point.x - previous.x;
        const z = point.z - previous.z;
        const length = Math.hypot(x, z);
        return length < Number.EPSILON
          ? null
          : { x: x / length, z: z / length };
      })
      .filter((direction) => direction !== null);
    const turnAngles = directions.slice(1).map((direction, index) => {
      const previous = directions[index];
      const dot = Math.max(
        -1,
        Math.min(1, previous.x * direction.x + previous.z * direction.z),
      );
      return Math.acos(dot);
    });

    const maximumTurn = Math.max(...turnAngles);
    expect(maximumTurn).toBeLessThan(0.4);
  });

  it("samples the exact jump apex and reports completion deterministically", () => {
    const route = buildHorsePovRoute(
      oneJumpCourse(),
      new Set(["known-revision"]),
    );
    const apex = route.points.find((point) => point.phase === "apex");
    if (!apex) throw new Error("Expected an apex point.");
    const apexSample = sampleHorsePovRoute(
      route,
      apex.cumulativeDistance / route.totalDistance,
    );
    const completed = sampleHorsePovRoute(route, 1);
    const beforeApex = sampleHorsePovRoute(
      route,
      Math.max(0, apex.cumulativeDistance / route.totalDistance - 0.01),
    );
    const afterApex = sampleHorsePovRoute(
      route,
      Math.min(1, apex.cumulativeDistance / route.totalDistance + 0.01),
    );

    expect(apexSample.position.x).toBeCloseTo(apex.x);
    expect(apexSample.position.y).toBeCloseTo(apex.y);
    expect(apexSample.position.z).toBeCloseTo(apex.z);
    expect(apexSample.motion).toBe("jumping");
    expect(beforeApex.position.y).toBeLessThan(apexSample.position.y);
    expect(afterApex.position.y).toBeLessThan(apexSample.position.y);
    expect(apexSample.currentDisplayNumber).toBe(1);
    expect(completed.completed).toBe(true);
    expect(completed.progress).toBe(1);
  });

  it("excludes placements whose pinned revision is missing", () => {
    const route = buildHorsePovRoute(
      oneJumpCourse(),
      new Set(["another-revision"]),
    );

    expect(route.points).toEqual([]);
    expect(route.durationSeconds).toBe(0);
  });
});
