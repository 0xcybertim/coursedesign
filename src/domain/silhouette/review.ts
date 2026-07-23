import benchmarkEvidence from "../../../docs/phase-1h/vectorization-benchmark-results.json" with { type: "json" };
import { stableHash } from "../design/stable-hash.ts";
import type {
  SilhouetteCleanupEvidence,
  SilhouetteFinding,
  SilhouetteVectorizationResult,
  WingSilhouette,
} from "./types.ts";

export const SILHOUETTE_REVIEW_SCHEMA_VERSION = "1.0.0-phase1h-b2" as const;
export const LOCAL_SILHOUETTE_REVIEW_KEY =
  "course-design.local-silhouette-review.v1" as const;

export type SilhouetteFixtureCategory =
  | "clean"
  | "empty"
  | "multi_subject"
  | "badly_occluded";

export interface SilhouetteReviewFixture {
  readonly fixtureId: string;
  readonly category: SilhouetteFixtureCategory;
  readonly providerMaskExpectation: "accept" | "reject";
  readonly sourceKind:
    | "approved-remove-bg-mask"
    | "local-ground-truth-for-provider-empty-rejection";
  readonly sourcePath: string;
  readonly sourceMaskSha256: string;
  readonly result: SilhouetteVectorizationResult;
  readonly resultIdentitySha256: string;
}

interface RawEvidence {
  readonly schemaVersion: string;
  readonly vectorizerVersion: string;
  readonly validatorVersion: string;
  readonly executionBoundary: {
    readonly externalProviderCallsMade: number;
    readonly retriesMade: number;
    readonly networkRequired: boolean;
  };
  readonly results: readonly {
    readonly fixtureId: string;
    readonly category: SilhouetteFixtureCategory;
    readonly providerMaskExpectation: "accept" | "reject";
    readonly sourceKind: SilhouetteReviewFixture["sourceKind"];
    readonly sourcePath: string;
    readonly sourceMaskSha256: string;
    readonly result:
      | {
          readonly status: "accepted";
          readonly findings: readonly [];
          readonly silhouette: WingSilhouette;
        }
      | {
          readonly status: "rejected";
          readonly silhouette: null;
          readonly findings: readonly SilhouetteFinding[];
          readonly cleanup: SilhouetteCleanupEvidence;
        };
  }[];
}

const raw = benchmarkEvidence as unknown as RawEvidence;

function resultIdentity(
  fixture: Omit<SilhouetteReviewFixture, "resultIdentitySha256">,
) {
  return stableHash({
    schemaVersion: "1.0.0-phase1h-b2-result-identity",
    fixtureId: fixture.fixtureId,
    sourceMaskSha256: fixture.sourceMaskSha256,
    status: fixture.result.status,
    polygonSha256:
      fixture.result.status === "accepted"
        ? fixture.result.silhouette.polygonSha256
        : null,
    findingCodes: fixture.result.findings.map((finding) => finding.code),
  });
}

const FIXTURES: readonly SilhouetteReviewFixture[] = raw.results.map(
  (result) => {
    const fixture = {
      fixtureId: result.fixtureId,
      category: result.category,
      providerMaskExpectation: result.providerMaskExpectation,
      sourceKind: result.sourceKind,
      sourcePath: result.sourcePath,
      sourceMaskSha256: result.sourceMaskSha256,
      result: result.result as SilhouetteVectorizationResult,
    } as const;
    return { ...fixture, resultIdentitySha256: resultIdentity(fixture) };
  },
);

export const SILHOUETTE_REVIEW_EVIDENCE_SHA256 = stableHash({
  schemaVersion: SILHOUETTE_REVIEW_SCHEMA_VERSION,
  benchmarkSchemaVersion: raw.schemaVersion,
  vectorizerVersion: raw.vectorizerVersion,
  validatorVersion: raw.validatorVersion,
  executionBoundary: raw.executionBoundary,
  fixtures: FIXTURES.map((fixture) => ({
    fixtureId: fixture.fixtureId,
    resultIdentitySha256: fixture.resultIdentitySha256,
  })),
});

export type SilhouetteDecisionAction =
  | "accepted_for_future_prototyping"
  | "retained_without_conversion";

interface DecisionWithoutHash {
  readonly schemaVersion: typeof SILHOUETTE_REVIEW_SCHEMA_VERSION;
  readonly decisionId: string;
  readonly fixtureId: string;
  readonly action: SilhouetteDecisionAction;
  readonly evidenceSha256: typeof SILHOUETTE_REVIEW_EVIDENCE_SHA256;
  readonly resultIdentitySha256: string;
  readonly sourceMaskSha256: string;
  readonly createdAt: string;
}

export interface SilhouetteDecisionEvent extends DecisionWithoutHash {
  readonly decisionHash: string;
}

export interface LocalSilhouetteReview {
  readonly schemaVersion: typeof SILHOUETTE_REVIEW_SCHEMA_VERSION;
  readonly evidenceSha256: typeof SILHOUETTE_REVIEW_EVIDENCE_SHA256;
  readonly decisions: readonly SilhouetteDecisionEvent[];
  readonly updatedAt: string;
}

export type SilhouetteReviewFailureKind =
  | "unknown_fixture"
  | "ineligible_decision"
  | "duplicate_decision_id"
  | "tampered_review"
  | "unsupported_review";

export type SilhouetteReviewResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: SilhouetteReviewFailureKind;
        readonly message: string;
      };
    };

function failure(
  kind: SilhouetteReviewFailureKind,
  message: string,
): SilhouetteReviewResult<never> {
  return { ok: false, error: { kind, message } };
}

export function silhouetteReviewFixtures() {
  return FIXTURES;
}

export function createEmptySilhouetteReview(
  now = "1970-01-01T00:00:00.000Z",
): LocalSilhouetteReview {
  return {
    schemaVersion: SILHOUETTE_REVIEW_SCHEMA_VERSION,
    evidenceSha256: SILHOUETTE_REVIEW_EVIDENCE_SHA256,
    decisions: [],
    updatedAt: now,
  };
}

function hashDecision(value: DecisionWithoutHash) {
  return stableHash(value);
}

function validateDecisionEvent(value: unknown): SilhouetteReviewResult<{
  readonly decision: SilhouetteDecisionEvent;
  readonly fixture: SilhouetteReviewFixture;
}> {
  if (!value || typeof value !== "object")
    return failure("tampered_review", "A review decision is not an object.");
  const decision = value as SilhouetteDecisionEvent;
  const fixture = FIXTURES.find(
    (item) => item.fixtureId === decision.fixtureId,
  );
  if (
    !fixture ||
    decision.schemaVersion !== SILHOUETTE_REVIEW_SCHEMA_VERSION ||
    typeof decision.decisionId !== "string" ||
    decision.decisionId.length === 0 ||
    (decision.action !== "accepted_for_future_prototyping" &&
      decision.action !== "retained_without_conversion") ||
    (decision.action === "accepted_for_future_prototyping" &&
      fixture.result.status !== "accepted") ||
    decision.evidenceSha256 !== SILHOUETTE_REVIEW_EVIDENCE_SHA256 ||
    decision.resultIdentitySha256 !== fixture.resultIdentitySha256 ||
    decision.sourceMaskSha256 !== fixture.sourceMaskSha256 ||
    typeof decision.createdAt !== "string"
  )
    return failure("tampered_review", "A review decision is invalid.");
  const { decisionHash, ...base } = decision;
  if (decisionHash !== hashDecision(base))
    return failure("tampered_review", "A review decision hash is invalid.");
  return { ok: true, value: { decision, fixture } };
}

export function acceptedSilhouetteFixtureForDecision(
  decision: unknown,
): SilhouetteReviewResult<{
  readonly decision: SilhouetteDecisionEvent;
  readonly fixture: SilhouetteReviewFixture & {
    readonly result: Extract<
      SilhouetteVectorizationResult,
      { readonly status: "accepted" }
    >;
  };
}> {
  const validated = validateDecisionEvent(decision);
  if (!validated.ok) return validated;
  if (
    validated.value.decision.action !== "accepted_for_future_prototyping" ||
    validated.value.fixture.result.status !== "accepted"
  )
    return failure(
      "ineligible_decision",
      "The latest review decision does not permit prototype derivation.",
    );
  return {
    ok: true,
    value: validated.value as {
      readonly decision: SilhouetteDecisionEvent;
      readonly fixture: SilhouetteReviewFixture & {
        readonly result: Extract<
          SilhouetteVectorizationResult,
          { readonly status: "accepted" }
        >;
      };
    },
  };
}

export function appendSilhouetteDecision(
  review: LocalSilhouetteReview,
  input: {
    readonly decisionId: string;
    readonly fixtureId: string;
    readonly action: SilhouetteDecisionAction;
    readonly createdAt: string;
  },
): SilhouetteReviewResult<LocalSilhouetteReview> {
  const fixture = FIXTURES.find((item) => item.fixtureId === input.fixtureId);
  if (!fixture)
    return failure("unknown_fixture", "The reviewed fixture is unknown.");
  if (
    input.action === "accepted_for_future_prototyping" &&
    fixture.result.status !== "accepted"
  )
    return failure(
      "ineligible_decision",
      "A rejected vectorization result cannot be accepted for prototyping.",
    );
  if (review.decisions.some((item) => item.decisionId === input.decisionId))
    return failure("duplicate_decision_id", "Decision ID already exists.");
  const base: DecisionWithoutHash = {
    schemaVersion: SILHOUETTE_REVIEW_SCHEMA_VERSION,
    decisionId: input.decisionId,
    fixtureId: input.fixtureId,
    action: input.action,
    evidenceSha256: SILHOUETTE_REVIEW_EVIDENCE_SHA256,
    resultIdentitySha256: fixture.resultIdentitySha256,
    sourceMaskSha256: fixture.sourceMaskSha256,
    createdAt: input.createdAt,
  };
  const decision = { ...base, decisionHash: hashDecision(base) };
  return {
    ok: true,
    value: {
      ...review,
      decisions: [...review.decisions, decision],
      updatedAt: input.createdAt,
    },
  };
}

export function currentSilhouetteDecisions(review: LocalSilhouetteReview) {
  const current = new Map<string, SilhouetteDecisionEvent>();
  for (const decision of review.decisions)
    current.set(decision.fixtureId, decision);
  return current;
}

export function serializeLocalSilhouetteReview(review: LocalSilhouetteReview) {
  return JSON.stringify(review);
}

export function parseLocalSilhouetteReview(
  serialized: string,
): SilhouetteReviewResult<LocalSilhouetteReview> {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return failure("tampered_review", "Review metadata is not valid JSON.");
  }
  if (!value || typeof value !== "object")
    return failure("tampered_review", "Review metadata is not an object.");
  const candidate = value as Partial<LocalSilhouetteReview>;
  if (candidate.schemaVersion !== SILHOUETTE_REVIEW_SCHEMA_VERSION)
    return failure("unsupported_review", "Review schema is unsupported.");
  if (candidate.evidenceSha256 !== SILHOUETTE_REVIEW_EVIDENCE_SHA256)
    return failure("tampered_review", "Review evidence identity is invalid.");
  if (!Array.isArray(candidate.decisions))
    return failure("tampered_review", "Review decisions are missing.");
  const decisionIds = new Set<string>();
  for (const decision of candidate.decisions) {
    if (decisionIds.has(decision.decisionId))
      return failure("tampered_review", "A review decision ID is duplicated.");
    const validated = validateDecisionEvent(decision);
    if (!validated.ok) return validated;
    decisionIds.add(decision.decisionId);
  }
  if (typeof candidate.updatedAt !== "string")
    return failure("tampered_review", "Review update time is invalid.");
  return { ok: true, value: candidate as LocalSilhouetteReview };
}
