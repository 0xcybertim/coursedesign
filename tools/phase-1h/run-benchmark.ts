import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLiveBenchmarkAuthorization } from "./authorization.ts";
import { validateRemoveBgLiveBenchmarkAuthorization } from "./remove-bg-authorization.ts";
import {
  evaluateSubjectMask,
  SUBJECT_MASK_EVALUATION_VERSION,
  SUBJECT_MASK_THRESHOLDS,
} from "./evaluate-mask.ts";
import {
  createPhotoroomSubjectMaskProvider,
  PHOTOROOM_COST_PER_REQUEST_USD,
  PHOTOROOM_MAX_RETRIES,
  PHOTOROOM_PROVIDER_ADAPTER_VERSION,
  type SubjectMaskProviderResult,
} from "./photoroom-provider.ts";
import {
  createRemoveBgSubjectMaskProvider,
  REMOVE_BG_MAX_RETRIES,
  REMOVE_BG_MAXIMUM_COST_USD,
  REMOVE_BG_PROVIDER_ADAPTER_VERSION,
} from "./remove-bg-provider.ts";

interface ManifestFixture {
  readonly id: string;
  readonly category: "clean" | "empty" | "multi_subject" | "badly_occluded";
  readonly expectedOutcome: "accept" | "reject";
  readonly input: {
    readonly path: string;
    readonly byteLength: number;
    readonly sha256: string;
  };
  readonly groundTruth: {
    readonly path: string;
    readonly byteLength: number;
    readonly sha256: string;
  };
}

interface BenchmarkManifest {
  readonly schemaVersion: string;
  readonly counts: {
    readonly clean: number;
    readonly empty: number;
    readonly multi_subject: number;
    readonly badly_occluded: number;
    readonly total: number;
  };
  readonly fixtures: readonly ManifestFixture[];
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(root, "docs/phase-1h/benchmark-manifest.json");
const live = process.argv.includes("--live");
const selectedLiveProvider = argumentValue("--provider") ?? "photoroom";
if (
  selectedLiveProvider !== "photoroom" &&
  selectedLiveProvider !== "remove-bg"
)
  throw new Error("Live provider must be photoroom or remove-bg.");
const removeBgLive = live && selectedLiveProvider === "remove-bg";
const providerApiKey = live
  ? removeBgLive
    ? (process.env.REMOVE_BG_API_KEY ?? "")
    : (process.env.PHOTOROOM_API_KEY ?? "")
  : "";
const sandboxMode =
  live &&
  selectedLiveProvider === "photoroom" &&
  providerApiKey.startsWith("sandbox_");
const expectedCalls = 29;
const expectedMaximumCost = removeBgLive ? REMOVE_BG_MAXIMUM_COST_USD : 0.58;

function argumentValue(name: string) {
  return process.argv
    .find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function formattedEvidence(value: unknown) {
  return `${JSON.stringify(value, null, 2).replace(
    /\[\n\s+"([a-z0-9_]+)"\n\s+\]/g,
    '["$1"]',
  )}\n`;
}

function verifyArtifact(
  bytes: Uint8Array,
  expected: { readonly byteLength: number; readonly sha256: string },
) {
  return (
    bytes.byteLength === expected.byteLength &&
    sha256(bytes) === expected.sha256
  );
}

function percentile(values: readonly number[], proportion: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * proportion) - 1)
  ]!;
}

if (live) {
  const approvedProvider = argumentValue("--approved-provider");
  const approvedCalls = Number(argumentValue("--approved-calls"));
  const approvedMaximumCost = Number(argumentValue("--approved-max-cost-usd"));
  const approvedPrivacy = argumentValue("--approved-privacy");
  if (
    process.env.PHASE_1H_LIVE_APPROVED !== "true" ||
    approvedProvider !== selectedLiveProvider ||
    approvedCalls !== expectedCalls ||
    approvedMaximumCost !== expectedMaximumCost ||
    approvedPrivacy !==
      (removeBgLive
        ? "synthetic-only-api-immediate-deletion"
        : "synthetic-only-no-api-training-retention-unspecified")
  )
    throw new Error(
      "Live mode requires the exact separately approved provider, privacy, 29-call, and cost gates.",
    );
  const authorizationPath = resolve(
    root,
    removeBgLive
      ? "docs/phase-1h/remove-bg-live-benchmark-authorization.json"
      : "docs/phase-1h/live-benchmark-authorization.json",
  );
  let authorization: unknown;
  try {
    authorization = JSON.parse(await readFile(authorizationPath, "utf8"));
  } catch {
    throw new Error(
      `Live mode requires ${authorizationPath}, created only after Tim's exact approval.`,
    );
  }
  if (
    !(removeBgLive
      ? validateRemoveBgLiveBenchmarkAuthorization(authorization)
      : validateLiveBenchmarkAuthorization(authorization))
  )
    throw new Error(
      "The durable live benchmark authorization does not match the exact approved provider, privacy, fixture, retry, cost, and latency contract.",
    );
}

const manifest = JSON.parse(
  await readFile(manifestPath, "utf8"),
) as BenchmarkManifest;
if (
  manifest.counts.clean !== 20 ||
  manifest.counts.empty !== 3 ||
  manifest.counts.multi_subject !== 3 ||
  manifest.counts.badly_occluded !== 3 ||
  manifest.counts.total !== expectedCalls ||
  manifest.fixtures.length !== expectedCalls
)
  throw new Error(
    "Benchmark manifest does not match the separately gated 20 + 3 + 3 + 3 contract.",
  );

const provider = live
  ? removeBgLive
    ? createRemoveBgSubjectMaskProvider({ apiKey: providerApiKey })
    : createPhotoroomSubjectMaskProvider({ apiKey: providerApiKey })
  : null;
const results = [];
let providerCallsMade = 0;
for (const fixture of manifest.fixtures) {
  const input = new Uint8Array(
    await readFile(resolve(root, fixture.input.path)),
  );
  const truth = new Uint8Array(
    await readFile(resolve(root, fixture.groundTruth.path)),
  );
  if (
    !verifyArtifact(input, fixture.input) ||
    !verifyArtifact(truth, fixture.groundTruth)
  )
    throw new Error(`Fixture integrity failed for ${fixture.id}.`);
  let providerResult: SubjectMaskProviderResult;
  let providerFailure: {
    readonly status: number | null;
    readonly durationMs: number | null;
  } | null = null;
  try {
    if (provider) {
      if (providerCallsMade >= expectedCalls)
        throw new Error("External-call cap reached before fixture dispatch.");
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error("Fixture timeout")),
        30_000,
      );
      try {
        providerCallsMade += 1;
        providerResult = await provider.getMask({
          fixtureId: fixture.id,
          inputPng: input,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } else {
      providerResult = {
        maskPng: truth,
        providerRequestId: null,
        uncertainty: 0,
        durationMs: 0,
        httpStatus: 200,
      };
    }
  } catch (error) {
    providerFailure = {
      status:
        error && typeof error === "object" && "providerFailureStatus" in error
          ? Number(error.providerFailureStatus)
          : null,
      durationMs:
        error && typeof error === "object" && "durationMs" in error
          ? Number(error.durationMs)
          : null,
    };
    const rejectedAsRequired = fixture.expectedOutcome === "reject";
    results.push({
      fixtureId: fixture.id,
      category: fixture.category,
      expectedOutcome: fixture.expectedOutcome,
      attempt: 1,
      providerOutcome: "failed",
      providerFailure,
      expectationMet: rejectedAsRequired,
      safeToPassIntoDeterministicVectorization: false,
      evaluation: null,
      output: null,
    });
    continue;
  }
  let evaluation;
  try {
    evaluation = evaluateSubjectMask({
      maskPng: providerResult.maskPng,
      groundTruthPng: truth,
      providerUncertainty: providerResult.uncertainty,
      requireProviderUncertainty: !removeBgLive,
    });
  } catch {
    const rejectedAsRequired = fixture.expectedOutcome === "reject";
    results.push({
      fixtureId: fixture.id,
      category: fixture.category,
      expectedOutcome: fixture.expectedOutcome,
      attempt: 1,
      providerOutcome: "malformed_mask",
      providerFailure: {
        status: providerResult.httpStatus,
        durationMs: providerResult.durationMs,
      },
      expectationMet: rejectedAsRequired,
      safeToPassIntoDeterministicVectorization: false,
      evaluation: null,
      output: {
        mediaType: "image/png",
        byteLength: providerResult.maskPng.byteLength,
        sha256: sha256(providerResult.maskPng),
      },
    });
    continue;
  }
  const expectationMet =
    fixture.expectedOutcome === "accept"
      ? evaluation.acceptedForDeterministicVectorization
      : !evaluation.acceptedForDeterministicVectorization;
  if (live) {
    const maskDirectory = resolve(
      root,
      removeBgLive
        ? "docs/phase-1h/remove-bg-live-masks"
        : "docs/phase-1h/live-masks",
    );
    await mkdir(maskDirectory, { recursive: true });
    await writeFile(
      resolve(maskDirectory, `${fixture.id}.png`),
      providerResult.maskPng,
    );
  }
  results.push({
    fixtureId: fixture.id,
    category: fixture.category,
    expectedOutcome: fixture.expectedOutcome,
    attempt: 1,
    providerOutcome: "completed",
    providerFailure: null,
    provider: {
      httpStatus: providerResult.httpStatus,
      requestId: providerResult.providerRequestId,
      uncertainty: providerResult.uncertainty,
      durationMs: providerResult.durationMs,
      creditsCharged: providerResult.creditsCharged ?? null,
      freeCallsRemaining: providerResult.freeCallsRemaining ?? null,
    },
    expectationMet,
    safeToPassIntoDeterministicVectorization:
      evaluation.acceptedForDeterministicVectorization,
    evaluation,
    output: {
      mediaType: "image/png",
      byteLength: providerResult.maskPng.byteLength,
      sha256: sha256(providerResult.maskPng),
    },
  });
}

const clean = results.filter((result) => result.category === "clean");
const negatives = results.filter((result) => result.category !== "clean");
const durations = results.flatMap((result) =>
  result.providerOutcome === "completed" && result.provider
    ? [result.provider.durationMs]
    : [],
);
const summary = {
  cleanUsable: clean.filter(
    (result) => result.safeToPassIntoDeterministicVectorization,
  ).length,
  cleanTotal: clean.length,
  negativeCasesRejected: negatives.filter((result) => result.expectationMet)
    .length,
  negativeCasesTotal: negatives.length,
  emptyRejected: results.filter(
    (result) => result.category === "empty" && result.expectationMet,
  ).length,
  multiSubjectRejected: results.filter(
    (result) => result.category === "multi_subject" && result.expectationMet,
  ).length,
  badlyOccludedRejected: results.filter(
    (result) => result.category === "badly_occluded" && result.expectationMet,
  ).length,
  latencyMs: {
    median: percentile(durations, 0.5),
    p90: percentile(durations, 0.9),
    maximum: durations.length ? Math.max(...durations) : null,
  },
};
const automatedMetricGatePassed =
  summary.cleanUsable >= 16 &&
  summary.negativeCasesRejected === summary.negativeCasesTotal;
// Photoroom documents sandbox output as watermarked. The watermark can fall
// below the binary threshold and therefore evade the geometric evaluator even
// though the saved grayscale mask is not safe vectorization input.
const technicalGatePassed =
  automatedMetricGatePassed && !sandboxMode && !removeBgLive;
const evidence = {
  schemaVersion: live
    ? removeBgLive
      ? "1.0.0-phase1h-a-remove-bg-live-benchmark"
      : "1.0.0-phase1h-a-live-benchmark"
    : "1.0.0-phase1h-a-local-validation",
  mode: live ? "live-provider" : "local-ground-truth",
  provider: live ? selectedLiveProvider : "local-ground-truth",
  adapterVersion: removeBgLive
    ? REMOVE_BG_PROVIDER_ADAPTER_VERSION
    : PHOTOROOM_PROVIDER_ADAPTER_VERSION,
  evaluationVersion: SUBJECT_MASK_EVALUATION_VERSION,
  manifestSchemaVersion: manifest.schemaVersion,
  providerCallsMade,
  maxRetries: removeBgLive ? REMOVE_BG_MAX_RETRIES : PHOTOROOM_MAX_RETRIES,
  sandboxMode,
  cost: {
    billingMode: removeBgLive
      ? "free-preview"
      : sandboxMode
        ? "sandbox-free"
        : live
          ? "regular"
          : "local",
    perRequestUsd:
      live && !sandboxMode && !removeBgLive
        ? PHOTOROOM_COST_PER_REQUEST_USD
        : 0,
    regularPricePerRequestUsd:
      live && !removeBgLive ? PHOTOROOM_COST_PER_REQUEST_USD : 0,
    maximumAuthorizedUsd: live ? expectedMaximumCost : 0,
    estimatedActualMaximumUsd:
      live && !sandboxMode && !removeBgLive
        ? Number(
            (providerCallsMade * PHOTOROOM_COST_PER_REQUEST_USD).toFixed(2),
          )
        : 0,
  },
  dataSent: live
    ? "Exactly 29 repository-generated 480 x 480 PNG fixtures; no user images, prompts, concept images, credentials, or source filenames are stored in this evidence."
    : "Nothing left the machine.",
  privacyApproval: live
    ? removeBgLive
      ? "Tim explicitly accepted synthetic-only uploads, immediate deletion after API processing, missing provider uncertainty, and mandatory visual inspection before this run."
      : "Tim explicitly accepted synthetic-only uploads, API exclusion from model training, and the publicly unspecified transient retention interval before this run."
    : "Not applicable; no external request was made.",
  providerUncertaintyRequired: live ? !removeBgLive : true,
  sandboxLimitation: sandboxMode
    ? "Photoroom documents sandbox outputs as watermarked. Automated geometry metrics are retained as plumbing evidence, but sandbox masks are not eligible to pass the vectorization-input gate."
    : null,
  thresholds: SUBJECT_MASK_THRESHOLDS,
  summary,
  automatedMetricGatePassed,
  finalDecision: {
    cleanMasksEligibleForVectorization:
      !live || sandboxMode || removeBgLive ? 0 : summary.cleanUsable,
    providerQualityProven: live && technicalGatePassed,
    reason: !live
      ? "Local ground-truth validation proves evaluator behavior only; it is not provider-quality evidence."
      : sandboxMode
        ? "Saved sandbox masks are visibly watermarked and therefore unsafe for deterministic vectorization despite passing the predeclared binary geometry metrics."
        : removeBgLive
          ? "remove.bg has no comparable uncertainty score. Automated results require mandatory visual inspection before any mask can be eligible for vectorization."
          : technicalGatePassed
            ? "The live provider output passed the predeclared technical gate."
            : "The live provider output failed the predeclared technical gate.",
  },
  technicalGatePassed,
  results,
};
const evidencePath = resolve(
  root,
  live
    ? removeBgLive
      ? "docs/phase-1h/remove-bg-live-benchmark-results.json"
      : "docs/phase-1h/live-benchmark-results.json"
    : "docs/phase-1h/local-validation.json",
);
await writeFile(evidencePath, formattedEvidence(evidence));
process.stdout.write(
  `${JSON.stringify({ evidencePath, summary, technicalGatePassed }, null, 2)}\n`,
);
process.exitCode = technicalGatePassed ? 0 : 1;
