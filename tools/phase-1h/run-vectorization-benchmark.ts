import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  SILHOUETTE_VALIDATOR_VERSION,
  SILHOUETTE_VECTORIZER_VERSION,
} from "../../src/domain/silhouette/types.ts";
import { vectorizeSilhouetteMask } from "../../src/domain/silhouette/vectorize.ts";
import { decodePng, maskValues } from "./png.ts";

interface BenchmarkFixture {
  readonly id: string;
  readonly category: "clean" | "empty" | "multi_subject" | "badly_occluded";
  readonly expectedOutcome: "accept" | "reject";
  readonly groundTruth: { readonly path: string; readonly sha256: string };
}

interface ProviderResult {
  readonly fixtureId: string;
  readonly providerOutcome: "completed" | "failed";
  readonly output: null | { readonly sha256: string };
}

const manifest = JSON.parse(
  readFileSync("docs/phase-1h/benchmark-manifest.json", "utf8"),
) as { readonly fixtures: readonly BenchmarkFixture[] };

if (manifest.fixtures.length !== 29)
  throw new Error("Phase 1H-B1 requires the exact approved 29-fixture corpus.");

const providerEvidence = JSON.parse(
  readFileSync("docs/phase-1h/remove-bg-live-benchmark-results.json", "utf8"),
) as { readonly results: readonly ProviderResult[] };
const providerResults = new Map(
  providerEvidence.results.map((result) => [result.fixtureId, result]),
);

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const records = manifest.fixtures.map((fixture) => {
  const providerPath = `docs/phase-1h/remove-bg-live-masks/${fixture.id}.png`;
  const providerResult = providerResults.get(fixture.id);
  if (!providerResult)
    throw new Error(`Missing Phase 1H-A result for ${fixture.id}.`);
  const hasProviderMask = providerResult.providerOutcome === "completed";
  if (hasProviderMask !== existsSync(providerPath))
    throw new Error(
      `Provider evidence and saved mask disagree for ${fixture.id}.`,
    );
  if (!hasProviderMask && fixture.category !== "empty")
    throw new Error(
      `Only provider-rejected empty fixtures may use ground truth.`,
    );
  const sourcePath = hasProviderMask ? providerPath : fixture.groundTruth.path;
  const sourceKind = hasProviderMask
    ? "approved-remove-bg-mask"
    : "local-ground-truth-for-provider-empty-rejection";
  const bytes = readFileSync(sourcePath);
  const sourceMaskSha256 = sha256(bytes);
  const expectedSha256 = hasProviderMask
    ? providerResult.output?.sha256
    : fixture.groundTruth.sha256;
  if (!expectedSha256 || sourceMaskSha256 !== expectedSha256)
    throw new Error(`Source-mask hash mismatch for ${fixture.id}.`);
  const image = decodePng(bytes);
  const input = {
    width: image.width,
    height: image.height,
    values: maskValues(image),
    sourceMaskSha256,
  };
  const result = vectorizeSilhouetteMask(input);
  const repeat = vectorizeSilhouetteMask(input);
  if (JSON.stringify(repeat) !== JSON.stringify(result))
    throw new Error(`Non-deterministic vectorization for ${fixture.id}.`);
  return {
    fixtureId: fixture.id,
    category: fixture.category,
    providerMaskExpectation: fixture.expectedOutcome,
    sourceKind,
    sourcePath,
    sourceMaskSha256: input.sourceMaskSha256,
    sourcePngData: bytes.toString("base64"),
    result,
  };
});

const accepted = records.filter(({ result }) => result.status === "accepted");
const rejected = records.filter(({ result }) => result.status === "rejected");
if (
  records.filter(({ sourceKind }) => sourceKind === "approved-remove-bg-mask")
    .length !== 26
)
  throw new Error("Expected exactly 26 approved remove.bg masks.");
const findingCounts = Object.fromEntries(
  [
    ...new Set(
      rejected.flatMap(({ result }) => result.findings.map(({ code }) => code)),
    ),
  ]
    .sort()
    .map((code) => [
      code,
      rejected.filter(({ result }) =>
        result.findings.some((finding) => finding.code === code),
      ).length,
    ]),
);

const evidence = {
  schemaVersion: "1.0.0-phase1h-b1-vectorization-benchmark",
  vectorizerVersion: SILHOUETTE_VECTORIZER_VERSION,
  validatorVersion: SILHOUETTE_VALIDATOR_VERSION,
  executionBoundary: {
    externalProviderCallsMade: 0,
    retriesMade: 0,
    networkRequired: false,
    sourceCorpus:
      "26 approved local remove.bg masks plus 3 repository ground-truth empty masks whose provider requests returned HTTP 400",
  },
  summary: {
    fixtures: records.length,
    accepted: accepted.length,
    rejected: rejected.length,
    acceptedClean: accepted.filter(({ category }) => category === "clean")
      .length,
    rejectedClean: rejected.filter(({ category }) => category === "clean")
      .length,
    rejectedNegativeCases: rejected.filter(
      ({ category }) => category !== "clean",
    ).length,
    deterministicRepeatMatches: records.length,
    findingCounts,
  },
  results: records.map(({ sourcePngData, ...record }) => {
    if (sourcePngData.length === 0)
      throw new Error(`Missing preview bytes for ${record.fixtureId}.`);
    return record;
  }),
};

writeFileSync(
  "docs/phase-1h/vectorization-benchmark-results.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);

const cardWidth = 244;
const cardHeight = 184;
const columns = 5;
const rows = Math.ceil(records.length / columns);
const cards = records.map((record, index) => {
  const x = (index % columns) * cardWidth;
  const y = Math.floor(index / columns) * cardHeight;
  const acceptedResult =
    record.result.status === "accepted" ? record.result : null;
  const polygon = acceptedResult
    ? acceptedResult.silhouette.points
        .map((point) => `${124 + point.x * 0.0104},${42 + point.y * 0.0104}`)
        .join(" ")
    : "";
  const statusText = acceptedResult
    ? `${acceptedResult.silhouette.points.length} vertices`
    : record.result.findings.map(({ code }) => code).join(", ");
  return `<g transform="translate(${x},${y})">
    <rect x="4" y="4" width="236" height="176" rx="10" fill="#fff" stroke="#d6d3d1"/>
    <text x="14" y="24" font-size="12" font-weight="700">${escapeXml(record.fixtureId)}</text>
    <image x="14" y="36" width="104" height="104" preserveAspectRatio="none" href="data:image/png;base64,${record.sourcePngData}"/>
    <rect x="124" y="36" width="104" height="104" fill="#f5f5f4"/>
    ${acceptedResult ? `<polygon points="${polygon}" fill="#2563eb" fill-opacity="0.82" stroke="#1e3a8a" stroke-width="1"/>` : `<text x="176" y="88" text-anchor="middle" font-size="28" fill="#b91c1c">×</text>`}
    <text x="14" y="158" font-size="10" fill="${acceptedResult ? "#166534" : "#991b1b"}">${escapeXml(acceptedResult ? "accepted" : "rejected")}</text>
    <text x="14" y="171" font-size="8.5" fill="#57534e">${escapeXml(statusText)}</text>
  </g>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cardWidth}" height="${rows * cardHeight}" viewBox="0 0 ${columns * cardWidth} ${rows * cardHeight}">
  <rect width="100%" height="100%" fill="#fafaf9"/>
  ${cards.join("\n")}
</svg>\n`;
writeFileSync("docs/phase-1h/vectorization-preview.svg", svg);

console.log(
  `Phase 1H-B1: ${accepted.length} accepted, ${rejected.length} rejected, ${records.length} deterministic repeats matched, 0 external calls.`,
);
