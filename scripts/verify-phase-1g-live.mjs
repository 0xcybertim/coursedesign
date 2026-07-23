import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PHASE_1G_BASE_URL ?? "http://127.0.0.1:3000";
const evidencePath = path.resolve(
  "docs/phase-1g/live-provider-acceptance.json",
);

async function existingEvidence() {
  try {
    return JSON.parse(await readFile(evidencePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "ENOENT") return null;
    }
    throw error;
  }
}

const previous = await existingEvidence();
if (
  previous?.calls?.generation?.attempted ||
  previous?.calls?.refinement?.attempted
) {
  throw new Error(
    "Live Phase 1G acceptance has already been attempted. Refusing to repeat paid work.",
  );
}

const capability = await fetch(`${baseUrl}/api/generation/concepts`, {
  cache: "no-store",
});
assert.equal(capability.status, 200, "live API capability preflight failed");
assert.equal(capability.headers.get("cache-control"), "no-store");

const evidence = {
  schemaVersion: "1.0.0-phase1g-live",
  baseUrl,
  provider: "openai",
  expectedConfiguredModel: "gpt-image-2-2026-04-21",
  maxRetries: 0,
  inputEvidencePolicy:
    "No prompt text, image bytes, base64, filenames, credentials, or revised prompts are recorded.",
  calls: {
    generation: { attempted: false },
    refinement: { attempted: false },
  },
  passed: false,
};

async function save() {
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function imageEvidence(images) {
  return {
    count: images.length,
    mediaTypes: [...new Set(images.map((image) => image.mediaType))],
    byteLengths: images.map(
      (image) => Buffer.from(image.base64, "base64").byteLength,
    ),
    contentHashes: images.map((image) =>
      createHash("sha256")
        .update(Buffer.from(image.base64, "base64"))
        .digest("hex"),
    ),
  };
}

function provenanceEvidence(provenance) {
  return {
    provider: provenance.provider,
    configuredModel: provenance.configuredModel,
    adapterVersion: provenance.adapterVersion,
    providerRequestId: provenance.providerRequestId,
    seed: provenance.seed,
  };
}

async function post(body) {
  const response = await fetch(`${baseUrl}/api/generation/concepts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
    },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

const sessionId = `live-session-${randomUUID()}`;
const constraints = {
  family: "profile-wing-vertical-v1",
  silhouetteSubject: "butterfly",
  poleCount: 4,
  colors: "navy, gold, blue and white",
  lowerElementPreference: "none",
  sponsorArea: "subtle",
  style: "graphic",
};

evidence.calls.generation = {
  attempted: true,
  attemptedAt: new Date().toISOString(),
};
await save();

const generationRequestId = `live-generate-${randomUUID()}`;
const generation = await post({
  sessionId,
  requestId: generationRequestId,
  action: "generate",
  prompt:
    "Create a butterfly-shaped show-jumping concept with navy wings, gold edge details, and four blue-and-white poles.",
  constraints,
  photoDerivative: null,
  photoConsent: null,
  referencePhoto: null,
  sourceConcept: null,
});
if (!generation.payload.ok) {
  evidence.calls.generation = {
    ...evidence.calls.generation,
    httpStatus: generation.response.status,
    outcome: "failed",
    failureKind: generation.payload.error?.kind ?? "unknown",
  };
  await save();
  throw new Error(
    `Live generation failed with ${evidence.calls.generation.failureKind}.`,
  );
}
assert.equal(generation.payload.images.length, 4);
evidence.calls.generation = {
  ...evidence.calls.generation,
  httpStatus: generation.response.status,
  outcome: "completed",
  ...imageEvidence(generation.payload.images),
  provenance: provenanceEvidence(generation.payload.provenance),
};
await save();

const selected = generation.payload.images[0];
const selectedBytes = Buffer.from(selected.base64, "base64");
const selectedHash = createHash("sha256").update(selectedBytes).digest("hex");
evidence.calls.refinement = {
  attempted: true,
  attemptedAt: new Date().toISOString(),
  sourceContentHash: selectedHash,
};
await save();

const refinement = await post({
  sessionId,
  requestId: `live-refine-${randomUUID()}`,
  action: "refine",
  prompt:
    "Increase the gold edge details while preserving the butterfly silhouette and four-pole composition.",
  constraints,
  photoDerivative: null,
  photoConsent: null,
  referencePhoto: null,
  sourceConcept: {
    contentHash: selectedHash,
    mediaType: selected.mediaType,
    filename: "selected-concept.jpg",
    base64: selected.base64,
  },
});
if (!refinement.payload.ok) {
  evidence.calls.refinement = {
    ...evidence.calls.refinement,
    httpStatus: refinement.response.status,
    outcome: "failed",
    failureKind: refinement.payload.error?.kind ?? "unknown",
  };
  await save();
  throw new Error(
    `Live refinement failed with ${evidence.calls.refinement.failureKind}.`,
  );
}
assert.equal(refinement.payload.images.length, 4);
evidence.calls.refinement = {
  ...evidence.calls.refinement,
  httpStatus: refinement.response.status,
  outcome: "completed",
  ...imageEvidence(refinement.payload.images),
  provenance: provenanceEvidence(refinement.payload.provenance),
};
evidence.passed = true;
evidence.completedAt = new Date().toISOString();
await save();

process.stdout.write(
  `${JSON.stringify({
    passed: true,
    provider: evidence.provider,
    model: evidence.calls.generation.provenance.configuredModel,
    generationImages: evidence.calls.generation.count,
    refinementImages: evidence.calls.refinement.count,
    evidencePath: path.relative(process.cwd(), evidencePath),
  })}\n`,
);
