import type { SilhouetteVectorizationResult } from "../silhouette/types";

export const PROFILE_WING_CREATION_SCHEMA_VERSION =
  "1.0.0-profile-wing-creation" as const;
export const LOCAL_PROFILE_WING_CREATION_KEY =
  "course-design.local-profile-wing-creation.v1" as const;

export type ProfileWingCreationSourceKind = "user_upload" | "generated_concept";

export type ProfileWingCreationSourceMediaType = "image/png" | "image/jpeg";

export interface ProfileWingCreationSource {
  readonly sourceId: string;
  readonly sourceKind: ProfileWingCreationSourceKind;
  readonly sourceLabel: string;
  readonly originalFilename: string;
  readonly contentHash: string;
  readonly mediaType: ProfileWingCreationSourceMediaType;
  readonly byteLength: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface ProfileWingMaskProvenance {
  readonly provider: "remove-bg" | "deterministic-test";
  readonly adapterVersion: string;
  readonly providerRequestId: string | null;
  readonly requestedAt: string;
  readonly automaticRetries: 0;
  readonly requestCount: 1;
  readonly outputMediaType: "image/png";
  readonly privacyNote:
    | "remove-bg-api-immediate-deletion"
    | "local-deterministic-no-upload";
}

export interface ProfileWingCreationCandidate {
  readonly schemaVersion: typeof PROFILE_WING_CREATION_SCHEMA_VERSION;
  readonly candidateId: string;
  readonly candidateHash: string;
  readonly source: ProfileWingCreationSource;
  readonly maskContentHash: string;
  readonly maskByteLength: number;
  readonly maskWidth: number;
  readonly maskHeight: number;
  readonly provenance: ProfileWingMaskProvenance;
  readonly vectorization: SilhouetteVectorizationResult;
  readonly createdAt: string;
}

export type ProfileWingCreationDecisionAction =
  | "accepted_for_future_prototyping"
  | "retained_without_conversion";

export interface ProfileWingCreationDecision {
  readonly schemaVersion: typeof PROFILE_WING_CREATION_SCHEMA_VERSION;
  readonly decisionId: string;
  readonly decisionHash: string;
  readonly candidateId: string;
  readonly candidateHash: string;
  readonly sourceId: string;
  readonly sourceContentHash: string;
  readonly maskContentHash: string;
  readonly polygonSha256: string | null;
  readonly action: ProfileWingCreationDecisionAction;
  readonly createdAt: string;
}

export interface LocalProfileWingCreationWorkspace {
  readonly schemaVersion: typeof PROFILE_WING_CREATION_SCHEMA_VERSION;
  readonly candidates: readonly ProfileWingCreationCandidate[];
  readonly decisions: readonly ProfileWingCreationDecision[];
  readonly currentCandidateId: string | null;
  readonly updatedAt: string;
}

export type ProfileWingCreationFailureKind =
  | "invalid_workspace"
  | "unsupported_workspace"
  | "duplicate_candidate_id"
  | "duplicate_decision_id"
  | "unknown_candidate"
  | "invalid_candidate"
  | "invalid_decision"
  | "ineligible_decision";

export type ProfileWingCreationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: ProfileWingCreationFailureKind;
        readonly message: string;
      };
    };
