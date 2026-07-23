import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SILHOUETTE_NORMALIZED_SIZE,
  polygonHasSelfIntersection,
  signedPolygonArea,
  validateSilhouettePolygon,
  vectorizeSilhouetteMask,
  type RasterMaskInput,
  type SilhouetteCleanupEvidence,
} from "../../src/domain/silhouette/index.ts";
import { decodePng, maskValues } from "../../tools/phase-1h/png.ts";

interface BenchmarkFixture {
  readonly id: string;
  readonly category: "clean" | "empty" | "multi_subject" | "badly_occluded";
  readonly groundTruth: { readonly path: string; readonly sha256: string };
}

const manifest = JSON.parse(
  readFileSync("docs/phase-1h/benchmark-manifest.json", "utf8"),
) as { readonly fixtures: readonly BenchmarkFixture[] };

function hash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function corpusInput(fixture: BenchmarkFixture): RasterMaskInput {
  const livePath = `docs/phase-1h/remove-bg-live-masks/${fixture.id}.png`;
  if (!existsSync(livePath) && fixture.category !== "empty")
    throw new Error(`Missing approved provider mask for ${fixture.id}.`);
  const path = existsSync(livePath) ? livePath : fixture.groundTruth.path;
  const bytes = readFileSync(path);
  if (fixture.category === "empty")
    expect(hash(bytes), fixture.id).toBe(fixture.groundTruth.sha256);
  const image = decodePng(bytes);
  return {
    width: image.width,
    height: image.height,
    values: maskValues(image),
    sourceMaskSha256: hash(bytes),
  };
}

function raster(
  width: number,
  height: number,
  foreground: (x: number, y: number) => boolean,
): RasterMaskInput {
  const values = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (foreground(x, y)) values[y * width + x] = 255;
  return { width, height, values, sourceMaskSha256: "synthetic-test-mask" };
}

const cleanup: SilhouetteCleanupEvidence = {
  sourceWidth: 100,
  sourceHeight: 100,
  binaryThreshold: 128,
  removedIslandCount: 0,
  removedIslandPixels: 0,
  significantComponentCount: 1,
  retainedForegroundPixels: 3_600,
  retainedForegroundFraction: 0.36,
  enclosedHoleCount: 0,
  maximumCoreRadiusPixels: 30,
};

describe("Phase 1H-B1 deterministic silhouette vectorization", () => {
  it("produces the same canonical polygon and hash on every run", () => {
    const input = raster(
      100,
      100,
      (x, y) => x >= 20 && x < 80 && y >= 20 && y < 80,
    );
    const first = vectorizeSilhouetteMask(input);
    const second = vectorizeSilhouetteMask(input);
    expect(first.status).toBe("accepted");
    expect(second).toEqual(first);
    if (first.status !== "accepted") return;
    expect(first.silhouette.points).toEqual([
      { x: 2000, y: 2000 },
      { x: 8000, y: 2000 },
      { x: 8000, y: 8000 },
      { x: 2000, y: 8000 },
    ]);
    expect(first.silhouette.polygonSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("removes a tiny island without changing the retained subject contract", () => {
    const result = vectorizeSilhouetteMask(
      raster(
        100,
        100,
        (x, y) =>
          (x >= 20 && x < 80 && y >= 20 && y < 80) || (x === 2 && y === 2),
      ),
    );
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.silhouette.cleanup.removedIslandCount).toBe(1);
    expect(result.silhouette.cleanup.removedIslandPixels).toBe(1);
    expect(result.silhouette.cleanup.significantComponentCount).toBe(1);
  });

  it("auto-fits placement-only rejections without changing the source mask", () => {
    const input = raster(
      60,
      120,
      (x, y) => x >= 20 && x < 40 && y >= 0 && y < 120,
    );
    const original = vectorizeSilhouetteMask(input);
    expect(original.status).toBe("rejected");
    if (original.status !== "rejected") return;
    expect(original.findings.map((finding) => finding.code)).toEqual([
      "outside_prototype_envelope",
      "reserved_region_overlap",
    ]);

    const fitted = vectorizeSilhouetteMask(input, { prototypeFit: "auto" });
    expect(fitted.status).toBe("accepted");
    if (fitted.status !== "accepted") return;
    expect(fitted.silhouette.sourceMaskSha256).toBe(input.sourceMaskSha256);
    expect(fitted.silhouette.prototypeFit).toMatchObject({
      mode: "auto-fit",
      triggerFindingCodes: [
        "outside_prototype_envelope",
        "reserved_region_overlap",
      ],
      fittedBounds: {
        minY: 500,
        maxY: 8750,
      },
    });
    expect(
      fitted.silhouette.points.every(
        (point) =>
          point.x >= 500 &&
          point.x <= 9500 &&
          point.y >= 500 &&
          point.y <= 8750,
      ),
    ).toBe(true);
    const bounds = fitted.silhouette.prototypeFit!.fittedBounds;
    expect(
      (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY),
    ).toBeCloseTo(1 / 6, 3);
  });

  it("does not auto-fit a hard multi-subject rejection", () => {
    const input = raster(
      100,
      100,
      (x, y) =>
        (x >= 10 && x < 35 && y >= 20 && y < 70) ||
        (x >= 65 && x < 90 && y >= 20 && y < 70),
    );
    const result = vectorizeSilhouetteMask(input, { prototypeFit: "auto" });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "multiple_significant_subjects",
    ]);
  });

  it.each([
    ["empty_mask", raster(100, 100, () => false)],
    [
      "multiple_significant_subjects",
      raster(
        100,
        100,
        (x, y) =>
          (x >= 10 && x < 35 && y >= 20 && y < 70) ||
          (x >= 65 && x < 90 && y >= 20 && y < 70),
      ),
    ],
    [
      "holes_not_supported",
      raster(
        100,
        100,
        (x, y) =>
          x >= 15 &&
          x < 85 &&
          y >= 15 &&
          y < 85 &&
          !(x >= 40 && x < 60 && y >= 40 && y < 60),
      ),
    ],
    [
      "outside_prototype_envelope",
      raster(100, 100, (x, y) => x < 60 && y >= 20 && y < 80),
    ],
  ])("returns the explicit %s rejection", (code, input) => {
    const result = vectorizeSilhouetteMask(input);
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.findings.map((finding) => finding.code)).toContain(code);
  });

  it("detects an invalid self-intersecting polygon", () => {
    const points = [
      { x: 2000, y: 2000 },
      { x: 8000, y: 8000 },
      { x: 2000, y: 8000 },
      { x: 8000, y: 2000 },
    ];
    expect(polygonHasSelfIntersection(points)).toBe(true);
    expect(
      validateSilhouettePolygon({ points, cleanup }).map(
        (finding) => finding.code,
      ),
    ).toContain("self_intersection");
  });

  it("classifies the exact approved local corpus deterministically", () => {
    const results = manifest.fixtures.map((fixture) => ({
      fixture,
      result: vectorizeSilhouetteMask(corpusInput(fixture)),
    }));
    expect(results).toHaveLength(29);
    expect(
      results.filter(({ result }) => result.status === "accepted"),
    ).toHaveLength(18);
    expect(
      results
        .filter(
          ({ fixture, result }) =>
            fixture.category === "clean" && result.status === "rejected",
        )
        .map(({ fixture, result }) => ({
          id: fixture.id,
          findings:
            result.status === "rejected"
              ? result.findings.map((finding) => finding.code)
              : [],
        })),
    ).toEqual([
      { id: "clean-bicycle", findings: ["holes_not_supported"] },
      { id: "clean-teapot", findings: ["holes_not_supported"] },
    ]);

    for (const { fixture, result } of results) {
      expect(vectorizeSilhouetteMask(corpusInput(fixture))).toEqual(result);
      if (result.status !== "accepted") continue;
      expect(result.silhouette.points.length).toBeLessThanOrEqual(256);
      expect(signedPolygonArea(result.silhouette.points)).toBeGreaterThan(0);
      expect(polygonHasSelfIntersection(result.silhouette.points)).toBe(false);
      expect(
        result.silhouette.points.every(
          (point) =>
            Number.isInteger(point.x) &&
            Number.isInteger(point.y) &&
            point.x >= 0 &&
            point.y >= 0 &&
            point.x <= SILHOUETTE_NORMALIZED_SIZE &&
            point.y <= SILHOUETTE_NORMALIZED_SIZE,
        ),
      ).toBe(true);
    }
  }, 15_000);
});
