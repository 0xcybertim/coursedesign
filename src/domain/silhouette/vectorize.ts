import { stableHash } from "../design/stable-hash.ts";
import {
  SILHOUETTE_NORMALIZED_SIZE,
  SILHOUETTE_PROTOTYPE_FIT_VERSION,
  SILHOUETTE_VALIDATOR_VERSION,
  SILHOUETTE_VECTORIZER_VERSION,
  type RasterMaskInput,
  type SilhouetteCleanupEvidence,
  type SilhouetteFinding,
  type SilhouetteFindingCode,
  type SilhouettePoint,
  type SilhouettePrototypeFitEvidence,
  type SilhouetteVectorizationResult,
} from "./types.ts";
import { signedPolygonArea, validateSilhouettePolygon } from "./validate.ts";

export const SILHOUETTE_VECTORIZATION_RULES = {
  binaryThreshold: 128,
  significantComponentFraction: 0.002,
  initialSimplificationTolerancePixels: 1.25,
  maximumSimplificationTolerancePixels: 12,
} as const;

export const SILHOUETTE_PROTOTYPE_FIT_REGION = {
  minX: 500,
  minY: 500,
  maxX: 9500,
  maxY: 8750,
} as const;

const RECOVERABLE_PROTOTYPE_FIT_FINDINGS = new Set<SilhouetteFindingCode>([
  "area_above_maximum",
  "outside_prototype_envelope",
  "reserved_region_overlap",
]);

export function silhouetteFindingsAllowPrototypeFit(
  findings: readonly SilhouetteFinding[],
) {
  return (
    findings.length > 0 &&
    findings.every((finding) =>
      RECOVERABLE_PROTOTYPE_FIT_FINDINGS.has(finding.code),
    )
  );
}

interface PixelComponent {
  readonly pixels: readonly number[];
}

interface DirectedEdge {
  readonly start: SilhouettePoint;
  readonly end: SilhouettePoint;
  used: boolean;
}

function assertRasterMask(input: RasterMaskInput) {
  if (
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    input.width <= 0 ||
    input.height <= 0 ||
    input.values.byteLength !== input.width * input.height
  )
    throw new Error("Raster mask dimensions and byte length are inconsistent.");
}

function neighbors4(pixel: number, width: number, height: number) {
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  const neighbors: number[] = [];
  if (x > 0) neighbors.push(pixel - 1);
  if (x + 1 < width) neighbors.push(pixel + 1);
  if (y > 0) neighbors.push(pixel - width);
  if (y + 1 < height) neighbors.push(pixel + width);
  return neighbors;
}

function connectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  target: 0 | 1,
) {
  const visited = new Uint8Array(mask.byteLength);
  const queue = new Int32Array(mask.byteLength);
  const components: PixelComponent[] = [];
  for (let start = 0; start < mask.byteLength; start += 1) {
    if (visited[start] || mask[start] !== target) continue;
    let head = 0;
    let tail = 0;
    const pixels: number[] = [];
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const pixel = queue[head++]!;
      pixels.push(pixel);
      for (const neighbor of neighbors4(pixel, width, height))
        if (!visited[neighbor] && mask[neighbor] === target) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
    }
    components.push({ pixels });
  }
  return components.sort(
    (left, right) => right.pixels.length - left.pixels.length,
  );
}

function enclosedHoleCount(mask: Uint8Array, width: number, height: number) {
  return connectedComponents(mask, width, height, 0).filter((component) =>
    component.pixels.every((pixel) => {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      return x > 0 && y > 0 && x < width - 1 && y < height - 1;
    }),
  ).length;
}

function maximumCoreRadius(mask: Uint8Array, width: number, height: number) {
  const far = width + height + 1;
  const distances = new Int32Array(mask.byteLength);
  for (let pixel = 0; pixel < mask.byteLength; pixel += 1) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    distances[pixel] =
      mask[pixel] === 0
        ? 0
        : x === 0 || y === 0 || x === width - 1 || y === height - 1
          ? 1
          : far;
  }
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;
      if (x > 0)
        distances[pixel] = Math.min(
          distances[pixel]!,
          distances[pixel - 1]! + 1,
        );
      if (y > 0)
        distances[pixel] = Math.min(
          distances[pixel]!,
          distances[pixel - width]! + 1,
        );
    }
  for (let y = height - 1; y >= 0; y -= 1)
    for (let x = width - 1; x >= 0; x -= 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;
      if (x + 1 < width)
        distances[pixel] = Math.min(
          distances[pixel]!,
          distances[pixel + 1]! + 1,
        );
      if (y + 1 < height)
        distances[pixel] = Math.min(
          distances[pixel]!,
          distances[pixel + width]! + 1,
        );
    }
  return distances.reduce((maximum, value) => Math.max(maximum, value), 0);
}

function pointKey(point: SilhouettePoint) {
  return `${point.x},${point.y}`;
}

function boundaryEdges(mask: Uint8Array, width: number, height: number) {
  const edges: DirectedEdge[] = [];
  const foreground = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height
      ? mask[y * width + x] === 1
      : false;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      if (!foreground(x, y)) continue;
      if (!foreground(x, y - 1))
        edges.push({ start: { x, y }, end: { x: x + 1, y }, used: false });
      if (!foreground(x + 1, y))
        edges.push({
          start: { x: x + 1, y },
          end: { x: x + 1, y: y + 1 },
          used: false,
        });
      if (!foreground(x, y + 1))
        edges.push({
          start: { x: x + 1, y: y + 1 },
          end: { x, y: y + 1 },
          used: false,
        });
      if (!foreground(x - 1, y))
        edges.push({ start: { x, y: y + 1 }, end: { x, y }, used: false });
    }
  return edges;
}

function traceSingleContour(mask: Uint8Array, width: number, height: number) {
  const edges = boundaryEdges(mask, width, height);
  if (edges.length === 0) return null;
  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = pointKey(edge.start);
    outgoing.set(key, [...(outgoing.get(key) ?? []), index]);
  });
  const startIndex = edges
    .map((edge, index) => ({ edge, index }))
    .sort(
      (left, right) =>
        left.edge.start.y - right.edge.start.y ||
        left.edge.start.x - right.edge.start.x ||
        left.edge.end.y - right.edge.end.y ||
        left.edge.end.x - right.edge.end.x,
    )[0]!.index;
  const points: SilhouettePoint[] = [];
  let currentIndex = startIndex;
  for (let step = 0; step <= edges.length; step += 1) {
    const edge = edges[currentIndex]!;
    if (edge.used) return null;
    edge.used = true;
    points.push(edge.start);
    if (pointKey(edge.end) === pointKey(edges[startIndex]!.start)) break;
    const candidates = (outgoing.get(pointKey(edge.end)) ?? [])
      .filter((index) => !edges[index]!.used)
      .sort((left, right) => {
        const a = edges[left]!.end;
        const b = edges[right]!.end;
        return a.y - b.y || a.x - b.x;
      });
    if (candidates.length === 0) return null;
    currentIndex = candidates[0]!;
  }
  if (edges.some((edge) => !edge.used)) return null;
  return points;
}

function removeCollinear(points: readonly SilhouettePoint[]) {
  let current = [...points];
  let changed = true;
  while (changed && current.length >= 3) {
    changed = false;
    const next = current.filter((point, index) => {
      const previous = current[(index - 1 + current.length) % current.length]!;
      const following = current[(index + 1) % current.length]!;
      const collinear =
        (point.x - previous.x) * (following.y - point.y) ===
        (point.y - previous.y) * (following.x - point.x);
      if (collinear) changed = true;
      return !collinear;
    });
    current = next;
  }
  return current;
}

function distanceToSegmentSquared(
  point: SilhouettePoint,
  start: SilhouettePoint,
  end: SilhouettePoint,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0)
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  const x = start.x + projection * dx;
  const y = start.y + projection * dy;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

function simplifyOpen(
  points: readonly SilhouettePoint[],
  tolerance: number,
): SilhouettePoint[] {
  if (points.length <= 2) return [...points];
  let maximumDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegmentSquared(
      points[index]!,
      points[0]!,
      points[points.length - 1]!,
    );
    if (distance > maximumDistance) {
      maximumDistance = distance;
      splitIndex = index;
    }
  }
  if (maximumDistance <= tolerance * tolerance)
    return [points[0]!, points[points.length - 1]!];
  const left = simplifyOpen(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyOpen(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyClosed(points: readonly SilhouettePoint[], tolerance: number) {
  if (points.length <= 3) return [...points];
  const start = points[0]!;
  let splitIndex = 1;
  let maximumDistance = -1;
  for (let index = 1; index < points.length; index += 1) {
    const distance =
      (points[index]!.x - start.x) ** 2 + (points[index]!.y - start.y) ** 2;
    if (distance > maximumDistance) {
      maximumDistance = distance;
      splitIndex = index;
    }
  }
  const firstArc = simplifyOpen(points.slice(0, splitIndex + 1), tolerance);
  const secondArc = simplifyOpen(
    [...points.slice(splitIndex), start],
    tolerance,
  );
  return removeCollinear([...firstArc.slice(0, -1), ...secondArc.slice(0, -1)]);
}

function canonicalizePointSequence(points: readonly SilhouettePoint[]) {
  let normalized = removeCollinear(points).filter(
    (point, index, all) =>
      index === 0 ||
      point.x !== all[index - 1]!.x ||
      point.y !== all[index - 1]!.y,
  );
  if (signedPolygonArea(normalized) < 0) normalized = normalized.reverse();
  const startIndex = normalized
    .map((point, index) => ({ point, index }))
    .sort(
      (left, right) =>
        left.point.y - right.point.y ||
        left.point.x - right.point.x ||
        left.index - right.index,
    )[0]?.index;
  if (startIndex === undefined) return normalized;
  return [...normalized.slice(startIndex), ...normalized.slice(0, startIndex)];
}

function canonicalizeNormalized(
  points: readonly SilhouettePoint[],
  width: number,
  height: number,
) {
  return canonicalizePointSequence(
    points.map((point) => ({
      x: Math.round((point.x / width) * SILHOUETTE_NORMALIZED_SIZE),
      y: Math.round((point.y / height) * SILHOUETTE_NORMALIZED_SIZE),
    })),
  );
}

function canonicalizeAspectPreserving(
  points: readonly SilhouettePoint[],
  width: number,
  height: number,
) {
  const largestDimension = Math.max(width, height);
  const normalizedWidth = Math.round(
    (width / largestDimension) * SILHOUETTE_NORMALIZED_SIZE,
  );
  const normalizedHeight = Math.round(
    (height / largestDimension) * SILHOUETTE_NORMALIZED_SIZE,
  );
  const offsetX = Math.round(
    (SILHOUETTE_NORMALIZED_SIZE - normalizedWidth) / 2,
  );
  const offsetY = Math.round(
    (SILHOUETTE_NORMALIZED_SIZE - normalizedHeight) / 2,
  );
  return canonicalizePointSequence(
    points.map((point) => ({
      x:
        offsetX +
        Math.round((point.x / largestDimension) * SILHOUETTE_NORMALIZED_SIZE),
      y:
        offsetY +
        Math.round((point.y / largestDimension) * SILHOUETTE_NORMALIZED_SIZE),
    })),
  );
}

function pointBounds(points: readonly SilhouettePoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function fitPolygonToPrototype(
  points: readonly SilhouettePoint[],
  triggerFindings: readonly SilhouetteFinding[],
): {
  readonly points: readonly SilhouettePoint[];
  readonly evidence: SilhouettePrototypeFitEvidence;
} | null {
  const sourceBounds = pointBounds(points);
  const sourceWidth = sourceBounds.maxX - sourceBounds.minX;
  const sourceHeight = sourceBounds.maxY - sourceBounds.minY;
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  const target = SILHOUETTE_PROTOTYPE_FIT_REGION;
  const targetWidth = target.maxX - target.minX;
  const targetHeight = target.maxY - target.minY;
  const scalePartsPerMillion = Math.min(
    1_000_000,
    Math.floor((targetWidth * 1_000_000) / sourceWidth),
    Math.floor((targetHeight * 1_000_000) / sourceHeight),
  );
  const fittedWidth = Math.round(
    (sourceWidth * scalePartsPerMillion) / 1_000_000,
  );
  const fittedHeight = Math.round(
    (sourceHeight * scalePartsPerMillion) / 1_000_000,
  );
  const originX = Math.round(target.minX + (targetWidth - fittedWidth) / 2);
  const originY = target.maxY - fittedHeight;
  const fittedPoints = points.map((point) => ({
    x:
      originX +
      Math.round(
        ((point.x - sourceBounds.minX) * scalePartsPerMillion) / 1_000_000,
      ),
    y:
      originY +
      Math.round(
        ((point.y - sourceBounds.minY) * scalePartsPerMillion) / 1_000_000,
      ),
  }));
  return {
    points: fittedPoints,
    evidence: {
      mode: "auto-fit",
      version: SILHOUETTE_PROTOTYPE_FIT_VERSION,
      triggerFindingCodes: triggerFindings.map((finding) => finding.code),
      scalePartsPerMillion,
      sourceBounds,
      fittedBounds: pointBounds(fittedPoints),
    },
  };
}

function cleanupEvidence(options: {
  readonly input: RasterMaskInput;
  readonly removed: readonly PixelComponent[];
  readonly significantComponentCount: number;
  readonly cleaned: Uint8Array;
  readonly holes: number;
}): SilhouetteCleanupEvidence {
  const retainedForegroundPixels = options.cleaned.reduce(
    (sum, value) => sum + value,
    0,
  );
  return {
    sourceWidth: options.input.width,
    sourceHeight: options.input.height,
    binaryThreshold: SILHOUETTE_VECTORIZATION_RULES.binaryThreshold,
    removedIslandCount: options.removed.length,
    removedIslandPixels: options.removed.reduce(
      (sum, component) => sum + component.pixels.length,
      0,
    ),
    significantComponentCount: options.significantComponentCount,
    retainedForegroundPixels,
    retainedForegroundFraction:
      retainedForegroundPixels / options.cleaned.byteLength,
    enclosedHoleCount: options.holes,
    maximumCoreRadiusPixels: maximumCoreRadius(
      options.cleaned,
      options.input.width,
      options.input.height,
    ),
  };
}

function rejected(
  cleanup: SilhouetteCleanupEvidence,
  finding: SilhouetteFinding,
): SilhouetteVectorizationResult {
  return { status: "rejected", silhouette: null, findings: [finding], cleanup };
}

export function vectorizeSilhouetteMask(
  input: RasterMaskInput,
  options: { readonly prototypeFit?: "auto" } = {},
): SilhouetteVectorizationResult {
  assertRasterMask(input);
  const binary = Uint8Array.from(input.values, (value) =>
    value >= SILHOUETTE_VECTORIZATION_RULES.binaryThreshold ? 1 : 0,
  );
  const components = connectedComponents(binary, input.width, input.height, 1);
  const significantMinimum = Math.max(
    1,
    Math.ceil(
      binary.byteLength *
        SILHOUETTE_VECTORIZATION_RULES.significantComponentFraction,
    ),
  );
  const significant = components.filter(
    (component) => component.pixels.length >= significantMinimum,
  );
  const removed = components.filter(
    (component) => component.pixels.length < significantMinimum,
  );
  const cleaned = new Uint8Array(binary.byteLength);
  if (significant.length === 1)
    for (const pixel of significant[0]!.pixels) cleaned[pixel] = 1;
  const holes =
    significant.length === 1
      ? enclosedHoleCount(cleaned, input.width, input.height)
      : 0;
  const cleanup = cleanupEvidence({
    input,
    removed,
    significantComponentCount: significant.length,
    cleaned,
    holes,
  });

  if (significant.length === 0)
    return rejected(cleanup, {
      code: "empty_mask",
      message: "No significant foreground subject remains after cleanup.",
    });
  if (significant.length > 1)
    return rejected(cleanup, {
      code: "multiple_significant_subjects",
      message: "More than one significant subject is present.",
    });
  if (holes > 0)
    return rejected(cleanup, {
      code: "holes_not_supported",
      message: "Phase 1H-B1 supports one outer contour and no holes.",
    });

  const contour = traceSingleContour(cleaned, input.width, input.height);
  if (!contour)
    return rejected(cleanup, {
      code: "contour_trace_failed",
      message: "A single deterministic outer contour could not be traced.",
    });

  let tolerance =
    SILHOUETTE_VECTORIZATION_RULES.initialSimplificationTolerancePixels;
  let simplified = simplifyClosed(removeCollinear(contour), tolerance);
  while (
    simplified.length > 256 &&
    tolerance <
      SILHOUETTE_VECTORIZATION_RULES.maximumSimplificationTolerancePixels
  ) {
    tolerance += 0.75;
    simplified = simplifyClosed(removeCollinear(contour), tolerance);
  }
  let points = canonicalizeNormalized(simplified, input.width, input.height);
  const initialFindings = validateSilhouettePolygon({ points, cleanup });
  let prototypeFit: SilhouettePrototypeFitEvidence | undefined;
  if (
    options.prototypeFit === "auto" &&
    silhouetteFindingsAllowPrototypeFit(initialFindings)
  ) {
    const aspectPreservingPoints = canonicalizeAspectPreserving(
      simplified,
      input.width,
      input.height,
    );
    const fitted = fitPolygonToPrototype(
      aspectPreservingPoints,
      initialFindings,
    );
    if (fitted) {
      points = [...fitted.points];
      prototypeFit = fitted.evidence;
    }
  }
  const findings = validateSilhouettePolygon({ points, cleanup });
  if (findings.length > 0)
    return {
      status: "rejected",
      silhouette: null,
      findings,
      cleanup,
    };

  const polygonIdentity = {
    schemaVersion: "1.0.0-phase1h-b1-polygon",
    coordinateSystem: {
      width: SILHOUETTE_NORMALIZED_SIZE,
      height: SILHOUETTE_NORMALIZED_SIZE,
      origin: "top-left",
      winding: "clockwise-screen-coordinates",
    },
    points,
  } as const;
  return {
    status: "accepted",
    findings: [],
    silhouette: {
      schemaVersion: "1.0.0-phase1h-b1-wing-silhouette",
      coordinateSystem: polygonIdentity.coordinateSystem,
      points,
      polygonSha256: stableHash(polygonIdentity),
      sourceMaskSha256: input.sourceMaskSha256,
      vectorizerVersion: SILHOUETTE_VECTORIZER_VERSION,
      validatorVersion: SILHOUETTE_VALIDATOR_VERSION,
      cleanup,
      ...(prototypeFit ? { prototypeFit } : {}),
      validationFindings: [],
    },
  };
}
