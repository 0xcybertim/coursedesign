import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXTURE_HEIGHT,
  FIXTURE_WIDTH,
  renderSubjectMaskFixture,
  subjectMaskFixtures,
} from "./fixtures.ts";
import { encodeRgbaPng, maskToPng } from "./png.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputDirectory = resolve(root, "tests/fixtures/phase-1h/input");
const truthDirectory = resolve(root, "tests/fixtures/phase-1h/ground-truth");

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

await mkdir(inputDirectory, { recursive: true });
await mkdir(truthDirectory, { recursive: true });

const fixtures = [];
for (const definition of subjectMaskFixtures) {
  const rendered = renderSubjectMaskFixture(definition);
  const inputBytes = encodeRgbaPng(rendered.input);
  const truthBytes = maskToPng(
    FIXTURE_WIDTH,
    FIXTURE_HEIGHT,
    rendered.groundTruthMask,
  );
  const inputPath = `tests/fixtures/phase-1h/input/${definition.id}.png`;
  const truthPath = `tests/fixtures/phase-1h/ground-truth/${definition.id}.png`;
  await writeFile(resolve(root, inputPath), inputBytes);
  await writeFile(resolve(root, truthPath), truthBytes);
  fixtures.push({
    ...definition,
    rightsBasis:
      "repository-local procedural fixture generated solely for testing",
    input: {
      path: inputPath,
      mediaType: "image/png",
      pixelWidth: FIXTURE_WIDTH,
      pixelHeight: FIXTURE_HEIGHT,
      byteLength: inputBytes.byteLength,
      sha256: sha256(inputBytes),
    },
    groundTruth: {
      path: truthPath,
      mediaType: "image/png",
      byteLength: truthBytes.byteLength,
      sha256: sha256(truthBytes),
    },
  });
}

const counts = Object.fromEntries(
  ["clean", "empty", "multi_subject", "badly_occluded"].map((category) => [
    category,
    fixtures.filter((fixture) => fixture.category === category).length,
  ]),
);
const manifest = {
  schemaVersion: "1.0.0-phase1h-a-fixtures",
  generatedAt: "deterministic; timestamps intentionally omitted",
  generator: "tools/phase-1h/generate-fixtures.ts",
  fixturePolicy:
    "Every input and ground-truth image is generated locally from repository code. No scraped, user, provider-generated, or sensitive image is included.",
  counts: {
    ...counts,
    total: fixtures.length,
  },
  fixtures,
};
await writeFile(
  resolve(root, "docs/phase-1h/benchmark-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(manifest.counts)}\n`);
