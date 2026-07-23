import {
  CONCEPT_FAMILIES,
  CONCEPT_STYLES,
  LOWER_ELEMENT_PREFERENCES,
  PHOTO_SUBJECT_KINDS,
  SPONSOR_AREA_PREFERENCES,
  assembleGenerationBrief,
  findSubjectConflict,
  type ConceptConstraints,
  type GenerationConsent,
  type GenerationFailureKind,
  type PhotoDerivative,
} from "@/domain/generation";

export const CONCEPT_REQUEST_MAX_BYTES = 12 * 1024 * 1024;
export const CONCEPT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const CONCEPT_PROMPT_MAX_CHARACTERS = 2_000;
export const CONCEPT_PROVIDER_TIMEOUT_MS = 120_000;

export interface EncodedProviderImage {
  readonly contentHash: string;
  readonly mediaType: "image/png" | "image/jpeg" | "image/webp";
  readonly filename: string;
  readonly base64: string;
}

export interface ConceptApiRequest {
  readonly sessionId: string;
  readonly requestId: string;
  readonly action: "generate" | "refine";
  readonly prompt: string;
  readonly constraints: ConceptConstraints;
  readonly photoDerivative: PhotoDerivative | null;
  readonly photoConsent: GenerationConsent | null;
  readonly referencePhoto: EncodedProviderImage | null;
  readonly sourceConcept: EncodedProviderImage | null;
}

export interface GenerationRouteAvailability {
  readonly enabled: boolean;
  readonly provider: "openai" | "deterministic" | null;
  readonly reason:
    | "enabled"
    | "developer_flag_missing"
    | "provider_configuration_missing"
    | "provider_credential_missing"
    | "non_local_host";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function localHost(host: string | null | undefined) {
  if (!host) return true;
  const hostname = host.split(":")[0].replace(/^\[|\]$/g, "");
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export function getGenerationRouteAvailability(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  host?: string | null,
): GenerationRouteAvailability {
  if (!localHost(host))
    return { enabled: false, provider: null, reason: "non_local_host" };
  if (environment.PHASE_1G_ENABLED !== "true")
    return {
      enabled: false,
      provider: null,
      reason: "developer_flag_missing",
    };
  const provider = environment.PHASE_1G_PROVIDER;
  if (provider !== "openai" && provider !== "deterministic")
    return {
      enabled: false,
      provider: null,
      reason: "provider_configuration_missing",
    };
  const credential =
    provider === "openai"
      ? environment.OPENAI_API_KEY
      : environment.PHASE_1G_TEST_CREDENTIAL;
  if (!credential)
    return {
      enabled: false,
      provider,
      reason: "provider_credential_missing",
    };
  return { enabled: true, provider, reason: "enabled" };
}

export function getGenerationRouteAvailabilityForHosts(
  environment: Readonly<Record<string, string | undefined>>,
  hosts: readonly (string | null | undefined)[],
): GenerationRouteAvailability {
  const candidates = hosts.flatMap((host) =>
    host
      ? host
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  );
  for (const host of candidates) {
    const availability = getGenerationRouteAvailability(environment, host);
    if (availability.reason === "non_local_host") return availability;
  }
  return getGenerationRouteAvailability(environment, candidates[0]);
}

function decodedLength(base64: string) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function validImage(value: unknown): value is EncodedProviderImage {
  if (!isRecord(value)) return false;
  return (
    typeof value.contentHash === "string" &&
    /^[a-f0-9]{64}$/.test(value.contentHash) &&
    ["image/png", "image/jpeg", "image/webp"].includes(
      String(value.mediaType),
    ) &&
    typeof value.filename === "string" &&
    value.filename.length > 0 &&
    value.filename.length <= 160 &&
    typeof value.base64 === "string" &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value.base64) &&
    decodedLength(value.base64) > 0 &&
    decodedLength(value.base64) <= CONCEPT_IMAGE_MAX_BYTES
  );
}

function validConstraints(value: unknown): value is ConceptConstraints {
  if (!isRecord(value)) return false;
  return (
    CONCEPT_FAMILIES.includes(value.family as never) &&
    typeof value.silhouetteSubject === "string" &&
    value.silhouetteSubject.trim().length >= 2 &&
    value.silhouetteSubject.length <= 120 &&
    value.poleCount === 4 &&
    typeof value.colors === "string" &&
    value.colors.trim().length >= 2 &&
    value.colors.length <= 160 &&
    LOWER_ELEMENT_PREFERENCES.includes(value.lowerElementPreference as never) &&
    SPONSOR_AREA_PREFERENCES.includes(value.sponsorArea as never) &&
    CONCEPT_STYLES.includes(value.style as never)
  );
}

function validPhotoDerivative(value: unknown): value is PhotoDerivative {
  if (!isRecord(value)) return false;
  return (
    /^[a-f0-9]{64}$/.test(String(value.contentHash)) &&
    value.mediaType === "image/jpeg" &&
    typeof value.byteLength === "number" &&
    value.byteLength > 0 &&
    value.byteLength <= CONCEPT_IMAGE_MAX_BYTES &&
    typeof value.pixelWidth === "number" &&
    value.pixelWidth > 0 &&
    value.pixelWidth <= 2048 &&
    typeof value.pixelHeight === "number" &&
    value.pixelHeight > 0 &&
    value.pixelHeight <= 2048 &&
    value.processingVersion === "1.0.0-phase1g-photo" &&
    typeof value.originalFilename === "string" &&
    PHOTO_SUBJECT_KINDS.includes(value.subjectKind as never)
  );
}

function validConsent(value: unknown): value is GenerationConsent {
  if (!isRecord(value)) return false;
  return [
    value.rightsConfirmedAt,
    value.openAiDisclosureConfirmedAt,
    value.noIdentifiablePeopleConfirmedAt,
    value.noLogoConfirmedAt,
    value.singleSubjectConfirmedAt,
  ].every(
    (item) => typeof item === "string" && !Number.isNaN(Date.parse(item)),
  );
}

export function validateConceptApiRequest(value: unknown):
  | { readonly ok: true; readonly value: ConceptApiRequest }
  | {
      readonly ok: false;
      readonly kind: GenerationFailureKind;
      readonly message: string;
    } {
  if (!isRecord(value))
    return {
      ok: false,
      kind: "invalid_request",
      message: "Invalid JSON body.",
    };
  if (
    typeof value.sessionId !== "string" ||
    !/^[A-Za-z0-9_-]{12,120}$/.test(value.sessionId) ||
    typeof value.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{8,160}$/.test(value.requestId) ||
    (value.action !== "generate" && value.action !== "refine") ||
    typeof value.prompt !== "string" ||
    value.prompt.length > CONCEPT_PROMPT_MAX_CHARACTERS ||
    !validConstraints(value.constraints)
  )
    return {
      ok: false,
      kind: "invalid_request",
      message: "Prompt, session, action, or structured controls are invalid.",
    };
  if (value.action === "refine" && value.prompt.trim().length < 3)
    return {
      ok: false,
      kind: "invalid_request",
      message: "Refinement direction must contain at least three characters.",
    };
  const subjectConflict = findSubjectConflict(
    value.prompt,
    value.constraints.silhouetteSubject,
  );
  if (subjectConflict)
    return {
      ok: false,
      kind: "invalid_request",
      message: `Creative direction mentions ${subjectConflict.directionSubject}, but the authoritative silhouette subject is ${subjectConflict.structuredSubjectLabel}. Resolve the conflict before submission.`,
    };
  const photoDerivative = value.photoDerivative ?? null;
  const photoConsent = value.photoConsent ?? null;
  const referencePhoto = value.referencePhoto ?? null;
  const sourceConcept = value.sourceConcept ?? null;
  if (
    (photoDerivative !== null && !validPhotoDerivative(photoDerivative)) ||
    (referencePhoto !== null && !validImage(referencePhoto)) ||
    (sourceConcept !== null && !validImage(sourceConcept))
  )
    return {
      ok: false,
      kind: "invalid_request",
      message: "Reference image metadata or bytes are invalid.",
    };
  if (
    (photoDerivative === null) !== (referencePhoto === null) ||
    (photoDerivative !== null &&
      photoDerivative.contentHash !== referencePhoto?.contentHash)
  )
    return {
      ok: false,
      kind: "invalid_request",
      message: "Reference derivative metadata does not match its bytes.",
    };
  if (
    (photoConsent !== null && !validConsent(photoConsent)) ||
    (photoDerivative !== null && !validConsent(photoConsent))
  )
    return {
      ok: false,
      kind: "policy_failure",
      message:
        "Photo rights, processing disclosure, single-subject, no-person, and no-logo confirmations are required.",
    };
  if (
    /\b(person|people|man|woman|child|portrait|face|logo)\b/i.test(value.prompt)
  )
    return {
      ok: false,
      kind: "policy_failure",
      message:
        "Phase 1G does not support identifiable people, likeness prompts, or logo generation. Use the SPJ-04 artwork workflow for logos.",
    };
  if (value.action === "refine" && sourceConcept === null)
    return {
      ok: false,
      kind: "invalid_request",
      message: "Refinement requires the selected concept bytes.",
    };
  return {
    ok: true,
    value: {
      sessionId: value.sessionId,
      requestId: value.requestId,
      action: value.action,
      prompt: value.prompt.trim(),
      constraints: value.constraints,
      photoDerivative,
      photoConsent: photoDerivative
        ? (photoConsent as GenerationConsent)
        : null,
      referencePhoto,
      sourceConcept,
    },
  };
}

export function structuredProviderPrompt(request: ConceptApiRequest) {
  return assembleGenerationBrief({
    creativeDirection: request.prompt,
    constraints: request.constraints,
    hasReferencePhoto: Boolean(request.photoDerivative),
  });
}
