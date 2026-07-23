import { stableHash } from "../design/stable-hash";
import type { SilhouetteVectorizationResult } from "../silhouette/types";
import {
  PROFILE_WING_CREATION_SCHEMA_VERSION,
  type LocalProfileWingCreationWorkspace,
  type ProfileWingCreationCandidate,
  type ProfileWingCreationDecision,
  type ProfileWingCreationDecisionAction,
  type ProfileWingCreationFailureKind,
  type ProfileWingCreationResult,
  type ProfileWingCreationSource,
  type ProfileWingMaskProvenance,
} from "./types";

function failure(
  kind: ProfileWingCreationFailureKind,
  message: string,
): ProfileWingCreationResult<never> {
  return { ok: false, error: { kind, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function candidateIdentity(
  candidate: Omit<ProfileWingCreationCandidate, "candidateHash">,
) {
  return candidate;
}

function decisionIdentity(
  decision: Omit<ProfileWingCreationDecision, "decisionHash">,
) {
  return decision;
}

function validSource(value: unknown): value is ProfileWingCreationSource {
  if (!isRecord(value)) return false;
  return (
    typeof value.sourceId === "string" &&
    /^[a-z0-9][a-z0-9-]{7,95}$/.test(value.sourceId) &&
    (value.sourceKind === "user_upload" ||
      value.sourceKind === "generated_concept") &&
    typeof value.sourceLabel === "string" &&
    value.sourceLabel.trim().length > 0 &&
    value.sourceLabel.length <= 160 &&
    typeof value.originalFilename === "string" &&
    value.originalFilename.length > 0 &&
    value.originalFilename.length <= 160 &&
    validHash(value.contentHash) &&
    (value.mediaType === "image/png" || value.mediaType === "image/jpeg") &&
    Number.isInteger(value.byteLength) &&
    Number(value.byteLength) > 0 &&
    Number(value.byteLength) <= 10 * 1024 * 1024 &&
    Number.isInteger(value.pixelWidth) &&
    Number(value.pixelWidth) > 0 &&
    Number(value.pixelWidth) <= 2048 &&
    Number.isInteger(value.pixelHeight) &&
    Number(value.pixelHeight) > 0 &&
    Number(value.pixelHeight) <= 2048
  );
}

function validProvenance(value: unknown): value is ProfileWingMaskProvenance {
  if (!isRecord(value)) return false;
  return (
    (value.provider === "remove-bg" ||
      value.provider === "deterministic-test") &&
    typeof value.adapterVersion === "string" &&
    value.adapterVersion.length > 0 &&
    (value.providerRequestId === null ||
      typeof value.providerRequestId === "string") &&
    validDate(value.requestedAt) &&
    value.automaticRetries === 0 &&
    value.requestCount === 1 &&
    value.outputMediaType === "image/png" &&
    (value.privacyNote === "remove-bg-api-immediate-deletion" ||
      value.privacyNote === "local-deterministic-no-upload")
  );
}

function validVectorization(
  value: unknown,
): value is SilhouetteVectorizationResult {
  if (!isRecord(value) || !Array.isArray(value.findings)) return false;
  if (value.status === "accepted") {
    if (!isRecord(value.silhouette)) return false;
    const silhouette = value.silhouette;
    return (
      validHash(silhouette.polygonSha256) &&
      validHash(silhouette.sourceMaskSha256) &&
      Array.isArray(silhouette.points) &&
      silhouette.points.length >= 3 &&
      silhouette.points.length <= 256 &&
      silhouette.points.every(
        (point) =>
          isRecord(point) &&
          Number.isInteger(point.x) &&
          Number.isInteger(point.y),
      )
    );
  }
  return (
    value.status === "rejected" &&
    value.silhouette === null &&
    value.findings.length > 0 &&
    isRecord(value.cleanup)
  );
}

function validateCandidate(
  value: unknown,
): ProfileWingCreationResult<ProfileWingCreationCandidate> {
  if (!isRecord(value))
    return failure("invalid_candidate", "A creation candidate is malformed.");
  const candidate = value as unknown as ProfileWingCreationCandidate;
  const { candidateHash, ...identity } = candidate;
  if (
    candidate.schemaVersion !== PROFILE_WING_CREATION_SCHEMA_VERSION ||
    typeof candidate.candidateId !== "string" ||
    candidate.candidateId.length < 8 ||
    !validHash(candidateHash) ||
    !validSource(candidate.source) ||
    !validHash(candidate.maskContentHash) ||
    !Number.isInteger(candidate.maskByteLength) ||
    candidate.maskByteLength <= 0 ||
    candidate.maskByteLength > 12 * 1024 * 1024 ||
    !Number.isInteger(candidate.maskWidth) ||
    candidate.maskWidth <= 0 ||
    !Number.isInteger(candidate.maskHeight) ||
    candidate.maskHeight <= 0 ||
    !validProvenance(candidate.provenance) ||
    !validVectorization(candidate.vectorization) ||
    !validDate(candidate.createdAt) ||
    stableHash(candidateIdentity(identity)) !== candidateHash
  )
    return failure(
      "invalid_candidate",
      "A creation candidate failed its immutable identity checks.",
    );
  if (
    candidate.vectorization.status === "accepted" &&
    candidate.vectorization.silhouette.sourceMaskSha256 !==
      candidate.maskContentHash
  )
    return failure(
      "invalid_candidate",
      "The vectorized polygon does not pin the returned mask bytes.",
    );
  return { ok: true, value: candidate };
}

function validateDecision(
  value: unknown,
  candidates: readonly ProfileWingCreationCandidate[],
): ProfileWingCreationResult<ProfileWingCreationDecision> {
  if (!isRecord(value))
    return failure("invalid_decision", "A creation decision is malformed.");
  const decision = value as unknown as ProfileWingCreationDecision;
  const candidate = candidates.find(
    (item) => item.candidateId === decision.candidateId,
  );
  const { decisionHash, ...identity } = decision;
  if (
    decision.schemaVersion !== PROFILE_WING_CREATION_SCHEMA_VERSION ||
    typeof decision.decisionId !== "string" ||
    decision.decisionId.length < 8 ||
    !validHash(decisionHash) ||
    !candidate ||
    decision.candidateHash !== candidate.candidateHash ||
    decision.sourceId !== candidate.source.sourceId ||
    decision.sourceContentHash !== candidate.source.contentHash ||
    decision.maskContentHash !== candidate.maskContentHash ||
    (decision.action !== "accepted_for_future_prototyping" &&
      decision.action !== "retained_without_conversion") ||
    !validDate(decision.createdAt) ||
    stableHash(decisionIdentity(identity)) !== decisionHash
  )
    return failure(
      "invalid_decision",
      "A creation decision failed its immutable identity checks.",
    );
  const expectedPolygon =
    candidate.vectorization.status === "accepted"
      ? candidate.vectorization.silhouette.polygonSha256
      : null;
  if (decision.polygonSha256 !== expectedPolygon)
    return failure(
      "invalid_decision",
      "A creation decision does not pin the current polygon result.",
    );
  if (
    decision.action === "accepted_for_future_prototyping" &&
    candidate.vectorization.status !== "accepted"
  )
    return failure(
      "ineligible_decision",
      "A rejected user silhouette cannot be accepted for prototyping.",
    );
  return { ok: true, value: decision };
}

export function createEmptyProfileWingCreationWorkspace(
  now = "1970-01-01T00:00:00.000Z",
): LocalProfileWingCreationWorkspace {
  return {
    schemaVersion: PROFILE_WING_CREATION_SCHEMA_VERSION,
    candidates: [],
    decisions: [],
    currentCandidateId: null,
    updatedAt: now,
  };
}

export function createProfileWingCandidate(input: {
  readonly candidateId: string;
  readonly source: ProfileWingCreationSource;
  readonly maskContentHash: string;
  readonly maskByteLength: number;
  readonly maskWidth: number;
  readonly maskHeight: number;
  readonly provenance: ProfileWingMaskProvenance;
  readonly vectorization: SilhouetteVectorizationResult;
  readonly createdAt: string;
}): ProfileWingCreationCandidate {
  const identity = {
    schemaVersion: PROFILE_WING_CREATION_SCHEMA_VERSION,
    ...input,
  } as const;
  return { ...identity, candidateHash: stableHash(identity) };
}

export function appendProfileWingCandidate(
  workspace: LocalProfileWingCreationWorkspace,
  candidate: ProfileWingCreationCandidate,
): ProfileWingCreationResult<LocalProfileWingCreationWorkspace> {
  const validated = validateCandidate(candidate);
  if (!validated.ok) return validated;
  if (
    workspace.candidates.some(
      (item) => item.candidateId === candidate.candidateId,
    )
  )
    return failure(
      "duplicate_candidate_id",
      "Creation candidate identifiers must be unique.",
    );
  return {
    ok: true,
    value: {
      ...workspace,
      candidates: [...workspace.candidates, candidate],
      currentCandidateId: candidate.candidateId,
      updatedAt: candidate.createdAt,
    },
  };
}

export function appendProfileWingDecision(
  workspace: LocalProfileWingCreationWorkspace,
  input: {
    readonly decisionId: string;
    readonly candidateId: string;
    readonly action: ProfileWingCreationDecisionAction;
    readonly createdAt: string;
  },
): ProfileWingCreationResult<{
  readonly workspace: LocalProfileWingCreationWorkspace;
  readonly decision: ProfileWingCreationDecision;
  readonly candidate: ProfileWingCreationCandidate;
}> {
  if (
    workspace.decisions.some(
      (decision) => decision.decisionId === input.decisionId,
    )
  )
    return failure(
      "duplicate_decision_id",
      "Creation decision identifiers must be unique.",
    );
  const candidate = workspace.candidates.find(
    (item) => item.candidateId === input.candidateId,
  );
  if (!candidate)
    return failure(
      "unknown_candidate",
      "The reviewed creation candidate is unavailable.",
    );
  const base = {
    schemaVersion: PROFILE_WING_CREATION_SCHEMA_VERSION,
    decisionId: input.decisionId,
    candidateId: candidate.candidateId,
    candidateHash: candidate.candidateHash,
    sourceId: candidate.source.sourceId,
    sourceContentHash: candidate.source.contentHash,
    maskContentHash: candidate.maskContentHash,
    polygonSha256:
      candidate.vectorization.status === "accepted"
        ? candidate.vectorization.silhouette.polygonSha256
        : null,
    action: input.action,
    createdAt: input.createdAt,
  } as const;
  const decision: ProfileWingCreationDecision = {
    ...base,
    decisionHash: stableHash(base),
  };
  const validated = validateDecision(decision, workspace.candidates);
  if (!validated.ok) return validated;
  return {
    ok: true,
    value: {
      workspace: {
        ...workspace,
        decisions: [...workspace.decisions, decision],
        currentCandidateId: candidate.candidateId,
        updatedAt: input.createdAt,
      },
      decision,
      candidate,
    },
  };
}

export function currentProfileWingCreationDecision(
  workspace: LocalProfileWingCreationWorkspace,
  candidateId: string,
) {
  return (
    [...workspace.decisions]
      .reverse()
      .find((decision) => decision.candidateId === candidateId) ?? null
  );
}

export function validateAcceptedProfileWingCreation(input: {
  readonly candidate: ProfileWingCreationCandidate;
  readonly decision: ProfileWingCreationDecision;
}): ProfileWingCreationResult<{
  readonly candidate: ProfileWingCreationCandidate & {
    readonly vectorization: Extract<
      SilhouetteVectorizationResult,
      { readonly status: "accepted" }
    >;
  };
  readonly decision: ProfileWingCreationDecision & {
    readonly action: "accepted_for_future_prototyping";
  };
}> {
  const candidate = validateCandidate(input.candidate);
  if (!candidate.ok) return candidate;
  const decision = validateDecision(input.decision, [candidate.value]);
  if (!decision.ok) return decision;
  if (
    candidate.value.vectorization.status !== "accepted" ||
    decision.value.action !== "accepted_for_future_prototyping"
  )
    return failure(
      "ineligible_decision",
      "The current user-image decision does not permit profile generation.",
    );
  return {
    ok: true,
    value: {
      candidate: candidate.value as ProfileWingCreationCandidate & {
        readonly vectorization: Extract<
          SilhouetteVectorizationResult,
          { readonly status: "accepted" }
        >;
      },
      decision: decision.value as ProfileWingCreationDecision & {
        readonly action: "accepted_for_future_prototyping";
      },
    },
  };
}

export function parseLocalProfileWingCreationWorkspace(
  serialized: string,
): ProfileWingCreationResult<LocalProfileWingCreationWorkspace> {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return failure(
      "invalid_workspace",
      "The local Profile Wing creation history is not valid JSON.",
    );
  }
  if (!isRecord(value))
    return failure(
      "invalid_workspace",
      "The local Profile Wing creation history is malformed.",
    );
  if (value.schemaVersion !== PROFILE_WING_CREATION_SCHEMA_VERSION)
    return failure(
      "unsupported_workspace",
      "The local Profile Wing creation history uses an unsupported schema.",
    );
  if (
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.decisions) ||
    (value.currentCandidateId !== null &&
      typeof value.currentCandidateId !== "string") ||
    !validDate(value.updatedAt)
  )
    return failure(
      "invalid_workspace",
      "The local Profile Wing creation history is malformed.",
    );
  const candidates: ProfileWingCreationCandidate[] = [];
  const candidateIds = new Set<string>();
  for (const item of value.candidates) {
    const parsed = validateCandidate(item);
    if (!parsed.ok) return parsed;
    if (candidateIds.has(parsed.value.candidateId))
      return failure(
        "duplicate_candidate_id",
        "Creation candidate identifiers must be unique.",
      );
    candidateIds.add(parsed.value.candidateId);
    candidates.push(parsed.value);
  }
  const decisions: ProfileWingCreationDecision[] = [];
  const decisionIds = new Set<string>();
  for (const item of value.decisions) {
    const parsed = validateDecision(item, candidates);
    if (!parsed.ok) return parsed;
    if (decisionIds.has(parsed.value.decisionId))
      return failure(
        "duplicate_decision_id",
        "Creation decision identifiers must be unique.",
      );
    decisionIds.add(parsed.value.decisionId);
    decisions.push(parsed.value);
  }
  if (
    value.currentCandidateId !== null &&
    !candidateIds.has(value.currentCandidateId)
  )
    return failure(
      "unknown_candidate",
      "The current creation candidate is unavailable.",
    );
  return {
    ok: true,
    value: {
      schemaVersion: PROFILE_WING_CREATION_SCHEMA_VERSION,
      candidates,
      decisions,
      currentCandidateId: value.currentCandidateId,
      updatedAt: value.updatedAt,
    },
  };
}

export function serializeLocalProfileWingCreationWorkspace(
  workspace: LocalProfileWingCreationWorkspace,
) {
  return JSON.stringify(workspace);
}
