import {
  SILHOUETTE_NORMALIZED_SIZE,
  type SilhouetteCleanupEvidence,
  type SilhouetteFinding,
  type SilhouettePoint,
} from "./types.ts";

export const SILHOUETTE_VALIDATION_RULES = {
  minimumVertices: 3,
  maximumVertices: 256,
  minimumAreaFraction: 0.01,
  maximumAreaFraction: 0.8,
  minimumCoreRadiusPixels: 4,
  prototypeEnvelope: {
    minX: 250,
    minY: 250,
    maxX: 9750,
    maxY: 9500,
  },
  reservedRegions: [
    {
      id: "prototype-bottom-track",
      minX: 0,
      minY: 9000,
      maxX: SILHOUETTE_NORMALIZED_SIZE,
      maxY: SILHOUETTE_NORMALIZED_SIZE,
    },
  ],
} as const;

export function signedPolygonArea(points: readonly SilhouettePoint[]) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += point.x * next.y - next.x * point.y;
  }
  return twiceArea / 2;
}

function orientation(
  a: SilhouettePoint,
  b: SilhouettePoint,
  c: SilhouettePoint,
) {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.sign(value);
}

function onSegment(
  point: SilhouettePoint,
  start: SilhouettePoint,
  end: SilhouettePoint,
) {
  return (
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y) &&
    orientation(start, end, point) === 0
  );
}

function segmentsIntersect(
  a: SilhouettePoint,
  b: SilhouettePoint,
  c: SilhouettePoint,
  d: SilhouettePoint,
) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC !== abD && cdA !== cdB) return true;
  return (
    (abC === 0 && onSegment(c, a, b)) ||
    (abD === 0 && onSegment(d, a, b)) ||
    (cdA === 0 && onSegment(a, c, d)) ||
    (cdB === 0 && onSegment(b, c, d))
  );
}

export function polygonHasSelfIntersection(points: readonly SilhouettePoint[]) {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (
        first === second ||
        firstNext === second ||
        secondNext === first ||
        (first === 0 && secondNext === 0)
      )
        continue;
      if (
        segmentsIntersect(
          points[first]!,
          points[firstNext]!,
          points[second]!,
          points[secondNext]!,
        )
      )
        return true;
    }
  }
  return false;
}

export function validateSilhouettePolygon(options: {
  readonly points: readonly SilhouettePoint[];
  readonly cleanup: SilhouetteCleanupEvidence;
}) {
  const { points, cleanup } = options;
  const findings: SilhouetteFinding[] = [];
  if (points.length < SILHOUETTE_VALIDATION_RULES.minimumVertices)
    findings.push({
      code: "too_few_vertices",
      message: "The contour has fewer than three canonical vertices.",
    });
  if (points.length > SILHOUETTE_VALIDATION_RULES.maximumVertices)
    findings.push({
      code: "too_many_vertices",
      message: "The contour exceeds the 256-vertex prototype limit.",
    });

  const signedArea = signedPolygonArea(points);
  const areaFraction =
    Math.abs(signedArea) /
    (SILHOUETTE_NORMALIZED_SIZE * SILHOUETTE_NORMALIZED_SIZE);
  if (areaFraction < SILHOUETTE_VALIDATION_RULES.minimumAreaFraction)
    findings.push({
      code: "area_below_minimum",
      message: "The silhouette area is below the prototype minimum.",
    });
  if (areaFraction > SILHOUETTE_VALIDATION_RULES.maximumAreaFraction)
    findings.push({
      code: "area_above_maximum",
      message: "The silhouette area exceeds the prototype maximum.",
    });
  if (
    cleanup.maximumCoreRadiusPixels <
    SILHOUETTE_VALIDATION_RULES.minimumCoreRadiusPixels
  )
    findings.push({
      code: "feature_core_too_thin",
      message: "The mask has no sufficiently thick connected feature core.",
    });

  const envelope = SILHOUETTE_VALIDATION_RULES.prototypeEnvelope;
  if (
    points.some(
      (point) =>
        point.x < envelope.minX ||
        point.x > envelope.maxX ||
        point.y < envelope.minY ||
        point.y > envelope.maxY,
    )
  )
    findings.push({
      code: "outside_prototype_envelope",
      message: "The contour extends beyond the Phase 1H-B1 prototype envelope.",
    });

  if (
    SILHOUETTE_VALIDATION_RULES.reservedRegions.some((region) =>
      points.some(
        (point) =>
          point.x >= region.minX &&
          point.x <= region.maxX &&
          point.y >= region.minY &&
          point.y <= region.maxY,
      ),
    )
  )
    findings.push({
      code: "reserved_region_overlap",
      message: "The contour overlaps a reserved prototype attachment region.",
    });

  if (polygonHasSelfIntersection(points))
    findings.push({
      code: "self_intersection",
      message: "The canonical contour self-intersects.",
    });
  if (signedArea <= 0)
    findings.push({
      code: "invalid_winding",
      message: "The contour winding is not clockwise in screen coordinates.",
    });
  return findings;
}
