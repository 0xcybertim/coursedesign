export const GENERATION_SCHEMA_VERSION = "1.0.0-phase1g" as const;
export const PHOTO_PROCESSING_VERSION = "1.0.0-phase1g-photo" as const;

export const CONCEPT_FAMILIES = ["profile-wing-vertical-v1"] as const;
export const CONCEPT_STYLES = [
  "graphic",
  "sculptural",
  "heritage",
  "playful",
] as const;
export const LOWER_ELEMENT_PREFERENCES = [
  "none",
  "decorative-panel",
  "gate",
  "filler",
] as const;
export const SPONSOR_AREA_PREFERENCES = [
  "none",
  "subtle",
  "prominent",
] as const;
export const PHOTO_SUBJECT_KINDS = [
  "animal",
  "object",
  "building",
  "owned-artwork",
] as const;

export type ConceptFamily = (typeof CONCEPT_FAMILIES)[number];
export type ConceptStyle = (typeof CONCEPT_STYLES)[number];
export type LowerElementPreference = (typeof LOWER_ELEMENT_PREFERENCES)[number];
export type SponsorAreaPreference = (typeof SPONSOR_AREA_PREFERENCES)[number];
export type PhotoSubjectKind = (typeof PHOTO_SUBJECT_KINDS)[number];
export type GenerationRequestKind = "initial" | "regenerate" | "refine";
export type ConceptMediaType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/svg+xml";

export interface ConceptConstraints {
  readonly family: ConceptFamily;
  readonly silhouetteSubject: string;
  readonly poleCount: 4;
  readonly colors: string;
  readonly lowerElementPreference: LowerElementPreference;
  readonly sponsorArea: SponsorAreaPreference;
  readonly style: ConceptStyle;
}

export interface PhotoDerivative {
  readonly contentHash: string;
  readonly mediaType: "image/jpeg";
  readonly byteLength: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly processingVersion: typeof PHOTO_PROCESSING_VERSION;
  readonly originalFilename: string;
  readonly subjectKind: PhotoSubjectKind;
}

export interface GenerationConsent {
  readonly rightsConfirmedAt: string;
  readonly openAiDisclosureConfirmedAt: string;
  readonly noIdentifiablePeopleConfirmedAt: string;
  readonly noLogoConfirmedAt: string;
  readonly singleSubjectConfirmedAt: string;
}

export interface ImmutableGenerationRequest {
  readonly schemaVersion: typeof GENERATION_SCHEMA_VERSION;
  readonly requestId: string;
  readonly requestHash: string;
  readonly kind: GenerationRequestKind;
  readonly rootRequestId: string;
  readonly parentBatchId: string | null;
  readonly parentConceptId: string | null;
  readonly prompt: string;
  readonly constraints: ConceptConstraints;
  readonly photoMode: "none" | "match_subject";
  readonly photoDerivative: PhotoDerivative | null;
  readonly consent: GenerationConsent | null;
  readonly createdAt: string;
}

export interface ConceptProviderProvenance {
  readonly provider: "openai" | "deterministic-test";
  readonly configuredModel: string;
  readonly adapterVersion: string;
  readonly providerRequestId: string | null;
  readonly seed: number | null;
  readonly revisedPrompt: string | null;
}

export interface GeneratedConcept {
  readonly conceptId: string;
  readonly conceptHash: string;
  readonly requestId: string;
  readonly batchId: string;
  readonly parentConceptId: string | null;
  readonly ordinal: 1 | 2 | 3 | 4;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly mediaType: ConceptMediaType;
  readonly status: "concept_only";
  readonly createdAt: string;
}

export interface ImmutableConceptBatch {
  readonly schemaVersion: typeof GENERATION_SCHEMA_VERSION;
  readonly batchId: string;
  readonly batchHash: string;
  readonly requestId: string;
  readonly rootRequestId: string;
  readonly relation: GenerationRequestKind;
  readonly parentBatchId: string | null;
  readonly parentConceptId: string | null;
  readonly conceptIds: readonly [string, string, string, string];
  readonly provenance: ConceptProviderProvenance;
  readonly createdAt: string;
  readonly status: "completed";
}

export interface ConceptSelectionEvent {
  readonly eventId: string;
  readonly conceptId: string;
  readonly action: "selected" | "accepted_for_phase_1h";
  readonly createdAt: string;
}

export interface GenerationRequestOutcome {
  readonly outcomeId: string;
  readonly requestId: string;
  readonly status: "completed" | "failed" | "cancelled";
  readonly failureKind: GenerationFailureKind | null;
  readonly createdAt: string;
}

export interface LocalConceptWorkspace {
  readonly schemaVersion: typeof GENERATION_SCHEMA_VERSION;
  readonly requests: readonly ImmutableGenerationRequest[];
  readonly batches: readonly ImmutableConceptBatch[];
  readonly concepts: readonly GeneratedConcept[];
  readonly outcomes: readonly GenerationRequestOutcome[];
  readonly selectionEvents: readonly ConceptSelectionEvent[];
  readonly selectedConceptId: string | null;
  readonly acceptedConceptId: string | null;
  readonly updatedAt: string;
}

export type GenerationFailureKind =
  | "disabled_route"
  | "invalid_request"
  | "policy_failure"
  | "active_request"
  | "provider_rejection"
  | "rate_limit"
  | "timeout"
  | "cancellation"
  | "malformed_response"
  | "storage_failure"
  | "missing_artifact"
  | "tampered_history"
  | "unsupported_history"
  | "unknown_provider_failure";

export interface GenerationFailure {
  readonly ok: false;
  readonly error: {
    readonly kind: GenerationFailureKind;
    readonly message: string;
    readonly recoverable: boolean;
  };
}

export interface GenerationSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export type GenerationResult<T> = GenerationSuccess<T> | GenerationFailure;
