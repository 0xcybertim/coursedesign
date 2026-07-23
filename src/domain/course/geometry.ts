import type { LocalDesignRevision } from "../design/local-library";
import type {
  CourseDraft,
  CourseInstance,
  CourseWarning,
  PointMm,
} from "./types";

export function rotatedFootprintPolygon(
  instance: CourseInstance,
  footprint: { width: number; depth: number },
): readonly PointMm[] {
  const halfWidth = footprint.width / 2;
  const halfDepth = footprint.depth / 2;
  const radians = (instance.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth },
  ].map((point) => ({
    x: instance.xMm + point.x * cos - point.y * sin,
    y: instance.yMm + point.x * sin + point.y * cos,
  }));
}

function axes(polygon: readonly PointMm[]): readonly PointMm[] {
  return polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const edge = { x: next.x - point.x, y: next.y - point.y };
    const length = Math.hypot(edge.x, edge.y);
    return { x: -edge.y / length, y: edge.x / length };
  });
}

function projection(polygon: readonly PointMm[], axis: PointMm) {
  const values = polygon.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function polygonsOverlapWithPositiveArea(
  first: readonly PointMm[],
  second: readonly PointMm[],
): boolean {
  return [...axes(first), ...axes(second)].every((axis) => {
    const a = projection(first, axis);
    const b = projection(second, axis);
    return Math.min(a.max, b.max) - Math.max(a.min, b.min) > 0.000001;
  });
}

function extendsBeyondArena(
  polygon: readonly PointMm[],
  arena: CourseDraft["arena"],
): boolean {
  return polygon.some(
    (point) =>
      point.x < -0.000001 ||
      point.y < -0.000001 ||
      point.x > arena.width + 0.000001 ||
      point.y > arena.height + 0.000001,
  );
}

export function deriveCourseWarnings(
  draft: CourseDraft,
  revisions: readonly LocalDesignRevision[],
): readonly CourseWarning[] {
  const revisionById = new Map(
    revisions.map((revision) => [revision.revisionId, revision]),
  );
  const warnings: CourseWarning[] = [];
  const polygons = new Map<string, readonly PointMm[]>();

  for (const instance of draft.instances) {
    const revision = revisionById.get(instance.obstacleDesignRevisionId);
    if (!revision) {
      warnings.push({
        kind: "missing_revision",
        instanceIds: [instance.instanceId],
        message: `Obstacle ${instance.displayNumber} references a saved revision unavailable on this device.`,
      });
      continue;
    }
    const polygon = rotatedFootprintPolygon(
      instance,
      revision.snapshot.footprint,
    );
    polygons.set(instance.instanceId, polygon);
    if (extendsBeyondArena(polygon, draft.arena)) {
      warnings.push({
        kind: "out_of_bounds",
        instanceIds: [instance.instanceId],
        message: `Obstacle ${instance.displayNumber} extends beyond the prototype arena boundary.`,
      });
    }
  }

  for (
    let firstIndex = 0;
    firstIndex < draft.instances.length;
    firstIndex += 1
  ) {
    const first = draft.instances[firstIndex];
    const firstPolygon = polygons.get(first.instanceId);
    if (!firstPolygon) continue;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < draft.instances.length;
      secondIndex += 1
    ) {
      const second = draft.instances[secondIndex];
      const secondPolygon = polygons.get(second.instanceId);
      if (
        secondPolygon &&
        polygonsOverlapWithPositiveArea(firstPolygon, secondPolygon)
      ) {
        warnings.push({
          kind: "overlap",
          instanceIds: [first.instanceId, second.instanceId],
          message: `Obstacle ${second.displayNumber} overlaps Obstacle ${first.displayNumber}. Move either placement to clear the planning warning.`,
        });
      }
    }
  }
  return warnings;
}
