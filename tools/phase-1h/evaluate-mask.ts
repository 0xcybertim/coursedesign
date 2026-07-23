import { decodePng, maskValues } from "./png.ts";

export const SUBJECT_MASK_EVALUATION_VERSION = "1.1.0-phase1h-a" as const;

export const SUBJECT_MASK_THRESHOLDS = {
  binaryThreshold: 128,
  minimumForegroundFraction: 0.01,
  maximumForegroundFraction: 0.8,
  minimumGroundTruthCoverage: 0.9,
  maximumBackgroundLeakage: 0.05,
  minimumIntersectionOverUnion: 0.85,
  significantComponentFraction: 0.002,
  maximumSignificantComponents: 1,
  maximumBorderForegroundPixels: 0,
  maximumProviderUncertainty: 0.6,
} as const;

export interface SubjectMaskMetrics {
  readonly width: number;
  readonly height: number;
  readonly foregroundPixels: number;
  readonly foregroundFraction: number;
  readonly connectedComponents: number;
  readonly significantComponents: number;
  readonly largestComponentPixels: number;
  readonly subjectCoverage: number | null;
  readonly backgroundLeakage: number | null;
  readonly intersectionOverUnion: number | null;
  readonly borderForegroundPixels: number;
  readonly obviousClipping: boolean;
  readonly providerUncertainty: number | null;
}

export interface SubjectMaskEvaluation {
  readonly acceptedForDeterministicVectorization: boolean;
  readonly reasons: readonly string[];
  readonly metrics: SubjectMaskMetrics;
}

function binaryMask(values: Uint8Array) {
  return Uint8Array.from(values, (value) =>
    value >= SUBJECT_MASK_THRESHOLDS.binaryThreshold ? 1 : 0,
  );
}

function components(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.byteLength);
  const queue = new Int32Array(mask.byteLength);
  const sizes: number[] = [];
  for (let start = 0; start < mask.byteLength; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let size = 0;
    while (head < tail) {
      const pixel = queue[head++]!;
      size += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (mask[neighbor] && !visited[neighbor]) {
            visited[neighbor] = 1;
            queue[tail++] = neighbor;
          }
        }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return sizes;
}

export function evaluateSubjectMask(options: {
  readonly maskPng: Uint8Array;
  readonly groundTruthPng: Uint8Array;
  readonly providerUncertainty: number | null;
  readonly requireProviderUncertainty?: boolean;
}): SubjectMaskEvaluation {
  const output = decodePng(options.maskPng);
  const truth = decodePng(options.groundTruthPng);
  if (output.width !== truth.width || output.height !== truth.height)
    throw new Error("Provider mask dimensions do not match the fixture.");
  const mask = binaryMask(maskValues(output));
  const truthMask = binaryMask(maskValues(truth));
  const componentSizes = components(mask, output.width, output.height);
  const significantMinimum = Math.ceil(
    mask.byteLength * SUBJECT_MASK_THRESHOLDS.significantComponentFraction,
  );
  const foregroundPixels = mask.reduce((sum, value) => sum + value, 0);
  const truthPixels = truthMask.reduce((sum, value) => sum + value, 0);
  let intersection = 0;
  let outsideTruth = 0;
  let union = 0;
  let borderForegroundPixels = 0;
  for (let pixel = 0; pixel < mask.byteLength; pixel += 1) {
    const outputForeground = mask[pixel] === 1;
    const truthForeground = truthMask[pixel] === 1;
    if (outputForeground && truthForeground) intersection += 1;
    if (outputForeground && !truthForeground) outsideTruth += 1;
    if (outputForeground || truthForeground) union += 1;
    if (outputForeground) {
      const x = pixel % output.width;
      const y = Math.floor(pixel / output.width);
      if (
        x === 0 ||
        y === 0 ||
        x === output.width - 1 ||
        y === output.height - 1
      )
        borderForegroundPixels += 1;
    }
  }
  const foregroundFraction = foregroundPixels / mask.byteLength;
  const subjectCoverage = truthPixels ? intersection / truthPixels : null;
  const backgroundLeakage = foregroundPixels
    ? outsideTruth / foregroundPixels
    : null;
  const intersectionOverUnion = union ? intersection / union : null;
  const metrics: SubjectMaskMetrics = {
    width: output.width,
    height: output.height,
    foregroundPixels,
    foregroundFraction,
    connectedComponents: componentSizes.length,
    significantComponents: componentSizes.filter(
      (size) => size >= significantMinimum,
    ).length,
    largestComponentPixels: componentSizes[0] ?? 0,
    subjectCoverage,
    backgroundLeakage,
    intersectionOverUnion,
    borderForegroundPixels,
    obviousClipping: borderForegroundPixels > 0,
    providerUncertainty: options.providerUncertainty,
  };
  const reasons: string[] = [];
  if (foregroundFraction < SUBJECT_MASK_THRESHOLDS.minimumForegroundFraction)
    reasons.push("foreground_too_small_or_empty");
  if (foregroundFraction > SUBJECT_MASK_THRESHOLDS.maximumForegroundFraction)
    reasons.push("foreground_covers_too_much_canvas");
  if (
    metrics.significantComponents !==
    SUBJECT_MASK_THRESHOLDS.maximumSignificantComponents
  )
    reasons.push("not_exactly_one_significant_component");
  if (
    subjectCoverage === null ||
    subjectCoverage < SUBJECT_MASK_THRESHOLDS.minimumGroundTruthCoverage
  )
    reasons.push("subject_coverage_below_threshold");
  if (
    backgroundLeakage === null ||
    backgroundLeakage > SUBJECT_MASK_THRESHOLDS.maximumBackgroundLeakage
  )
    reasons.push("background_leakage_above_threshold");
  if (
    intersectionOverUnion === null ||
    intersectionOverUnion < SUBJECT_MASK_THRESHOLDS.minimumIntersectionOverUnion
  )
    reasons.push("intersection_over_union_below_threshold");
  if (
    borderForegroundPixels >
    SUBJECT_MASK_THRESHOLDS.maximumBorderForegroundPixels
  )
    reasons.push("mask_touches_canvas_border");
  if (
    options.requireProviderUncertainty !== false &&
    (options.providerUncertainty === null ||
      options.providerUncertainty < 0 ||
      options.providerUncertainty >=
        SUBJECT_MASK_THRESHOLDS.maximumProviderUncertainty)
  )
    reasons.push("provider_uncertainty_missing_or_high");
  return {
    acceptedForDeterministicVectorization: reasons.length === 0,
    reasons,
    metrics,
  };
}
