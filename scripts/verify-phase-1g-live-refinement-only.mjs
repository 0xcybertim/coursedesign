import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI, { toFile } from "openai";

const sourcePath =
  process.env.PHASE_1G_REFINEMENT_SOURCE ??
  "/tmp/coursedesign-phase1g-live-refinement/source-dog-fixture.png";
const outputDirectory =
  process.env.PHASE_1G_REFINEMENT_OUTPUT_DIR ??
  "/tmp/coursedesign-phase1g-live-refinement";
const evidencePath = path.resolve(
  "docs/phase-1g/live-refinement-followup.json",
);
const model = process.env.PHASE_1G_OPENAI_MODEL ?? "gpt-image-2-2026-04-21";

async function existingEvidence() {
  try {
    return JSON.parse(await readFile(evidencePath, "utf8"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return null;
    throw error;
  }
}

const previous = await existingEvidence();
if (previous?.calls?.refinement?.attempted)
  throw new Error(
    "The authorized follow-up refinement has already been attempted. Refusing to repeat paid work.",
  );

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey)
  throw new Error(
    "OPENAI_API_KEY is missing. No live refinement was attempted.",
  );

const sourceBytes = await readFile(sourcePath);
assert.ok(
  sourceBytes[0] === 0x89 &&
    sourceBytes[1] === 0x50 &&
    sourceBytes[2] === 0x4e &&
    sourceBytes[3] === 0x47,
  "The bounded refinement source must be a PNG image.",
);

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const evidence = {
  schemaVersion: "1.0.0-phase1g-live-refinement-followup",
  provider: "openai",
  expectedConfiguredModel: model,
  maxRetries: 0,
  paidRequestsAuthorized: 1,
  inputEvidencePolicy:
    "No prompt text, image bytes, base64, filenames, credentials, or revised prompts are recorded in this evidence file.",
  source: {
    contentHash: hash(sourceBytes),
    byteLength: sourceBytes.byteLength,
    mediaType: "image/png",
    kind: "local-deterministic-dog-fixture",
  },
  calls: {
    generation: { attempted: false },
    refinement: {
      attempted: true,
      attemptedAt: new Date().toISOString(),
    },
  },
  technicalRequestPassed: false,
  creativeQualityPassed: null,
  passed: false,
};

async function saveEvidence() {
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

await saveEvidence();

const client = new OpenAI({ apiKey, maxRetries: 0 });

try {
  const response = await client.images
    .edit(
      {
        model,
        image: await toFile(sourceBytes, "dog-fixture.png", {
          type: "image/png",
        }),
        prompt:
          "Refine this show-jumping obstacle concept. Make the dog silhouette larger, make the ears clearer, and preserve the four-pole composition, rust/cream/navy palette, gate, and sponsor area. Return an unvalidated concept image only; do not add dimensions, prices, safety marks, manufacturing claims, people, logos, or supplier approval.",
        n: 4,
        quality: "low",
        size: "1024x1024",
        output_format: "jpeg",
        output_compression: 88,
        background: "opaque",
      },
      { maxRetries: 0 },
    )
    .withResponse();

  const images = response.data.data ?? [];
  assert.equal(images.length, 4, "OpenAI did not return exactly four images.");
  const decoded = images.map((image) => {
    assert.ok(image.b64_json, "OpenAI returned an image without base64 bytes.");
    const bytes = Buffer.from(image.b64_json, "base64");
    assert.ok(
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
      "OpenAI returned bytes that are not JPEG data.",
    );
    return bytes;
  });

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    decoded.map((bytes, index) =>
      writeFile(path.join(outputDirectory, `refined-${index + 1}.jpg`), bytes),
    ),
  );

  evidence.calls.refinement = {
    ...evidence.calls.refinement,
    outcome: "completed",
    count: decoded.length,
    mediaTypes: ["image/jpeg"],
    byteLengths: decoded.map((bytes) => bytes.byteLength),
    contentHashes: decoded.map(hash),
    provenance: {
      provider: "openai",
      configuredModel: model,
      providerRequestId: response.request_id ?? null,
    },
  };
  evidence.technicalRequestPassed = true;
  evidence.completedAt = new Date().toISOString();
  await saveEvidence();

  process.stdout.write(
    `${JSON.stringify({
      technicalRequestPassed: true,
      creativeQualityReviewRequired: true,
      provider: evidence.provider,
      model,
      generationCallsMade: 0,
      refinementCallsMade: 1,
      refinementImages: decoded.length,
      evidencePath: path.relative(process.cwd(), evidencePath),
      temporaryOutputDirectory: outputDirectory,
    })}\n`,
  );
} catch (error) {
  evidence.calls.refinement = {
    ...evidence.calls.refinement,
    outcome: "failed",
    httpStatus:
      error && typeof error === "object" && "status" in error
        ? error.status
        : null,
    failureKind:
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : error instanceof assert.AssertionError
          ? "malformed_response"
          : "unknown_provider_failure",
  };
  await saveEvidence();
  throw error;
}
