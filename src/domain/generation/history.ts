import { stableHash, stableSerialize } from "@/domain/design/stable-hash";
import {
  CONCEPT_FAMILIES,
  CONCEPT_STYLES,
  GENERATION_SCHEMA_VERSION,
  LOWER_ELEMENT_PREFERENCES,
  PHOTO_PROCESSING_VERSION,
  PHOTO_SUBJECT_KINDS,
  SPONSOR_AREA_PREFERENCES,
  type ConceptConstraints,
  type ConceptMediaType,
  type ConceptProviderProvenance,
  type GeneratedConcept,
  type GenerationConsent,
  type GenerationFailureKind,
  type GenerationRequestKind,
  type GenerationResult,
  type ImmutableConceptBatch,
  type ImmutableGenerationRequest,
  type LocalConceptWorkspace,
  type PhotoDerivative,
} from "./types";

export const LOCAL_CONCEPT_WORKSPACE_KEY =
  "course-design.local-concepts.v1" as const;

type RequestWithoutHash = Omit<ImmutableGenerationRequest, "requestHash">;
type ConceptWithoutHash = Omit<GeneratedConcept, "conceptHash">;
type BatchWithoutHash = Omit<ImmutableConceptBatch, "batchHash">;

function failure(
  kind: GenerationFailureKind,
  message: string,
): GenerationResult<never> {
  return { ok: false, error: { kind, message, recoverable: true } };
}

function unique(values: readonly string[]) {
  return new Set(values).size === values.length;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createEmptyConceptWorkspace(
  now = "1970-01-01T00:00:00.000Z",
): LocalConceptWorkspace {
  return {
    schemaVersion: GENERATION_SCHEMA_VERSION,
    requests: [],
    batches: [],
    concepts: [],
    outcomes: [],
    selectionEvents: [],
    selectedConceptId: null,
    acceptedConceptId: null,
    updatedAt: now,
  };
}

export function appendRequestOutcome(
  workspace: LocalConceptWorkspace,
  input: {
    readonly outcomeId: string;
    readonly requestId: string;
    readonly status: "completed" | "failed" | "cancelled";
    readonly failureKind?: GenerationFailureKind | null;
    readonly createdAt: string;
  },
): GenerationResult<LocalConceptWorkspace> {
  if (!workspace.requests.some((item) => item.requestId === input.requestId))
    return failure("invalid_request", "Generation outcome request is missing.");
  if (
    workspace.outcomes.some(
      (item) =>
        item.outcomeId === input.outcomeId ||
        item.requestId === input.requestId,
    )
  )
    return failure(
      "invalid_request",
      "Generation request already has an outcome.",
    );
  const failureKind = input.failureKind ?? null;
  if (
    (input.status === "completed" && failureKind !== null) ||
    (input.status !== "completed" && failureKind === null)
  )
    return failure(
      "invalid_request",
      "Generation outcome status is inconsistent.",
    );
  return {
    ok: true,
    value: {
      ...workspace,
      outcomes: [
        ...workspace.outcomes,
        {
          outcomeId: input.outcomeId,
          requestId: input.requestId,
          status: input.status,
          failureKind,
          createdAt: input.createdAt,
        },
      ],
      updatedAt: input.createdAt,
    },
  };
}

export function hashGenerationRequest(value: RequestWithoutHash): string {
  return stableHash(value);
}

export function hashGeneratedConcept(value: ConceptWithoutHash): string {
  return stableHash(value);
}

export function hashConceptBatch(value: BatchWithoutHash): string {
  return stableHash(value);
}

export function createGenerationRequest(input: {
  readonly requestId: string;
  readonly kind: GenerationRequestKind;
  readonly rootRequestId?: string;
  readonly parentBatchId?: string | null;
  readonly parentConceptId?: string | null;
  readonly prompt: string;
  readonly constraints: ConceptConstraints;
  readonly photoDerivative?: PhotoDerivative | null;
  readonly consent?: GenerationConsent | null;
  readonly createdAt: string;
}): ImmutableGenerationRequest {
  const base: RequestWithoutHash = {
    schemaVersion: GENERATION_SCHEMA_VERSION,
    requestId: input.requestId,
    kind: input.kind,
    rootRequestId: input.rootRequestId ?? input.requestId,
    parentBatchId: input.parentBatchId ?? null,
    parentConceptId: input.parentConceptId ?? null,
    prompt: input.prompt.trim(),
    constraints: input.constraints,
    photoMode: input.photoDerivative ? "match_subject" : "none",
    photoDerivative: input.photoDerivative ?? null,
    consent: input.photoDerivative ? (input.consent ?? null) : null,
    createdAt: input.createdAt,
  };
  return { ...base, requestHash: hashGenerationRequest(base) };
}

export function appendGenerationRequest(
  workspace: LocalConceptWorkspace,
  request: ImmutableGenerationRequest,
): GenerationResult<LocalConceptWorkspace> {
  if (workspace.requests.some((item) => item.requestId === request.requestId))
    return failure("invalid_request", "Generation request ID already exists.");
  if (request.kind === "initial") {
    if (
      request.rootRequestId !== request.requestId ||
      request.parentBatchId !== null ||
      request.parentConceptId !== null
    )
      return failure("invalid_request", "Initial request ancestry is invalid.");
  } else {
    if (
      !workspace.requests.some(
        (item) => item.requestId === request.rootRequestId,
      ) ||
      !workspace.batches.some((item) => item.batchId === request.parentBatchId)
    )
      return failure(
        "invalid_request",
        "Generation request parent is missing.",
      );
    if (
      request.kind === "refine" &&
      !workspace.concepts.some(
        (item) => item.conceptId === request.parentConceptId,
      )
    )
      return failure(
        "invalid_request",
        "Refinement concept parent is missing.",
      );
    if (request.kind === "regenerate" && request.parentConceptId !== null)
      return failure(
        "invalid_request",
        "A regeneration must remain a sibling batch, not a concept child.",
      );
  }
  const { requestHash, ...base } = request;
  if (requestHash !== hashGenerationRequest(base))
    return failure("tampered_history", "Generation request hash is invalid.");
  return {
    ok: true,
    value: {
      ...workspace,
      requests: [...workspace.requests, request],
      updatedAt: request.createdAt,
    },
  };
}

export function appendCompletedConceptBatch(
  workspace: LocalConceptWorkspace,
  input: {
    readonly batchId: string;
    readonly requestId: string;
    readonly provenance: ConceptProviderProvenance;
    readonly concepts: readonly {
      readonly conceptId: string;
      readonly contentHash: string;
      readonly byteLength: number;
      readonly mediaType: ConceptMediaType;
    }[];
    readonly createdAt: string;
  },
): GenerationResult<LocalConceptWorkspace> {
  const request = workspace.requests.find(
    (item) => item.requestId === input.requestId,
  );
  if (!request)
    return failure(
      "invalid_request",
      "The completed batch request is missing.",
    );
  if (input.concepts.length !== 4)
    return failure(
      "malformed_response",
      "A complete concept batch must contain exactly four results.",
    );
  if (
    workspace.batches.some((item) => item.batchId === input.batchId) ||
    !unique(input.concepts.map((item) => item.conceptId)) ||
    input.concepts.some((item) =>
      workspace.concepts.some(
        (existing) => existing.conceptId === item.conceptId,
      ),
    )
  )
    return failure("invalid_request", "Concept or batch IDs are not unique.");

  const concepts = input.concepts.map((item, index) => {
    const base: ConceptWithoutHash = {
      ...item,
      requestId: request.requestId,
      batchId: input.batchId,
      parentConceptId: request.parentConceptId,
      ordinal: (index + 1) as 1 | 2 | 3 | 4,
      status: "concept_only",
      createdAt: input.createdAt,
    };
    return { ...base, conceptHash: hashGeneratedConcept(base) };
  }) as unknown as readonly [
    GeneratedConcept,
    GeneratedConcept,
    GeneratedConcept,
    GeneratedConcept,
  ];
  const batchBase: BatchWithoutHash = {
    schemaVersion: GENERATION_SCHEMA_VERSION,
    batchId: input.batchId,
    requestId: request.requestId,
    rootRequestId: request.rootRequestId,
    relation: request.kind,
    parentBatchId: request.parentBatchId,
    parentConceptId: request.parentConceptId,
    conceptIds: concepts.map((item) => item.conceptId) as [
      string,
      string,
      string,
      string,
    ],
    provenance: input.provenance,
    createdAt: input.createdAt,
    status: "completed",
  };
  const batch: ImmutableConceptBatch = {
    ...batchBase,
    batchHash: hashConceptBatch(batchBase),
  };
  return {
    ok: true,
    value: {
      ...workspace,
      batches: [...workspace.batches, batch],
      concepts: [...workspace.concepts, ...concepts],
      updatedAt: input.createdAt,
    },
  };
}

export function selectConcept(
  workspace: LocalConceptWorkspace,
  input: {
    readonly eventId: string;
    readonly conceptId: string;
    readonly now: string;
  },
): GenerationResult<LocalConceptWorkspace> {
  if (!workspace.concepts.some((item) => item.conceptId === input.conceptId))
    return failure(
      "missing_artifact",
      "The selected concept is not in history.",
    );
  return {
    ok: true,
    value: {
      ...workspace,
      selectedConceptId: input.conceptId,
      selectionEvents: [
        ...workspace.selectionEvents,
        {
          eventId: input.eventId,
          conceptId: input.conceptId,
          action: "selected",
          createdAt: input.now,
        },
      ],
      updatedAt: input.now,
    },
  };
}

export function acceptConceptForPhase1H(
  workspace: LocalConceptWorkspace,
  input: {
    readonly eventId: string;
    readonly conceptId: string;
    readonly now: string;
  },
): GenerationResult<LocalConceptWorkspace> {
  if (workspace.selectedConceptId !== input.conceptId)
    return failure(
      "invalid_request",
      "Select the concept before recording the Phase 1H handoff.",
    );
  return {
    ok: true,
    value: {
      ...workspace,
      acceptedConceptId: input.conceptId,
      selectionEvents: [
        ...workspace.selectionEvents,
        {
          eventId: input.eventId,
          conceptId: input.conceptId,
          action: "accepted_for_phase_1h",
          createdAt: input.now,
        },
      ],
      updatedAt: input.now,
    },
  };
}

function validConstraints(value: unknown): value is ConceptConstraints {
  if (!isRecord(value)) return false;
  return (
    CONCEPT_FAMILIES.includes(value.family as never) &&
    typeof value.silhouetteSubject === "string" &&
    value.silhouetteSubject.length > 0 &&
    value.poleCount === 4 &&
    typeof value.colors === "string" &&
    LOWER_ELEMENT_PREFERENCES.includes(value.lowerElementPreference as never) &&
    SPONSOR_AREA_PREFERENCES.includes(value.sponsorArea as never) &&
    CONCEPT_STYLES.includes(value.style as never)
  );
}

function validPhoto(value: unknown): value is PhotoDerivative {
  if (!isRecord(value)) return false;
  return (
    typeof value.contentHash === "string" &&
    /^[a-f0-9]{64}$/.test(value.contentHash) &&
    value.mediaType === "image/jpeg" &&
    typeof value.byteLength === "number" &&
    typeof value.pixelWidth === "number" &&
    typeof value.pixelHeight === "number" &&
    value.processingVersion === PHOTO_PROCESSING_VERSION &&
    typeof value.originalFilename === "string" &&
    PHOTO_SUBJECT_KINDS.includes(value.subjectKind as never)
  );
}

function validateWorkspace(
  value: unknown,
): GenerationResult<LocalConceptWorkspace> {
  if (!isRecord(value) || value.schemaVersion !== GENERATION_SCHEMA_VERSION)
    return failure(
      "unsupported_history",
      "Concept history uses an unsupported schema.",
    );
  if (
    !Array.isArray(value.requests) ||
    !Array.isArray(value.batches) ||
    !Array.isArray(value.concepts) ||
    !Array.isArray(value.outcomes) ||
    !Array.isArray(value.selectionEvents) ||
    !validDate(value.updatedAt)
  )
    return failure("tampered_history", "Concept history shape is invalid.");
  const workspace = value as unknown as LocalConceptWorkspace;
  if (
    !unique(workspace.requests.map((item) => item.requestId)) ||
    !unique(workspace.batches.map((item) => item.batchId)) ||
    !unique(workspace.concepts.map((item) => item.conceptId)) ||
    !unique(workspace.outcomes.map((item) => item.outcomeId)) ||
    !unique(workspace.outcomes.map((item) => item.requestId)) ||
    !unique(workspace.selectionEvents.map((item) => item.eventId))
  )
    return failure(
      "tampered_history",
      "Concept history contains duplicate IDs.",
    );

  let rebuilt = createEmptyConceptWorkspace(
    workspace.requests[0]?.createdAt ?? workspace.updatedAt,
  );
  for (const request of workspace.requests) {
    if (
      request.schemaVersion !== GENERATION_SCHEMA_VERSION ||
      !validDate(request.createdAt) ||
      !validConstraints(request.constraints) ||
      typeof request.prompt !== "string" ||
      request.prompt.trim() !== request.prompt ||
      (request.photoDerivative !== null && !validPhoto(request.photoDerivative))
    )
      return failure("tampered_history", "A generation request is invalid.");
    const appended = appendGenerationRequest(rebuilt, request);
    if (!appended.ok) return appended;
    rebuilt = appended.value;

    const batch = workspace.batches.find(
      (item) => item.requestId === request.requestId,
    );
    if (!batch) continue;
    const batchConcepts = batch.conceptIds.map((conceptId) =>
      workspace.concepts.find((item) => item.conceptId === conceptId),
    );
    if (
      batchConcepts.some((item) => !item) ||
      batchConcepts.some((item) => {
        if (!item) return true;
        const { conceptHash, ...base } = item;
        return conceptHash !== hashGeneratedConcept(base);
      })
    )
      return failure(
        "tampered_history",
        "Concept bytes metadata was tampered.",
      );
    const { batchHash, ...batchBase } = batch;
    if (
      batchHash !== hashConceptBatch(batchBase) ||
      batchConcepts.some((item) => item?.batchId !== batch.batchId)
    )
      return failure("tampered_history", "A concept batch hash is invalid.");
    const appendedBatch = appendCompletedConceptBatch(rebuilt, {
      batchId: batch.batchId,
      requestId: request.requestId,
      provenance: batch.provenance,
      concepts: batchConcepts.map((item) => ({
        conceptId: item!.conceptId,
        contentHash: item!.contentHash,
        byteLength: item!.byteLength,
        mediaType: item!.mediaType,
      })),
      createdAt: batch.createdAt,
    });
    if (!appendedBatch.ok) return appendedBatch;
    rebuilt = appendedBatch.value;
  }
  if (
    rebuilt.batches.length !== workspace.batches.length ||
    rebuilt.concepts.length !== workspace.concepts.length
  )
    return failure(
      "tampered_history",
      "Concept history contains orphaned batches or concepts.",
    );
  if (
    workspace.selectionEvents.some(
      (event) =>
        !validDate(event.createdAt) ||
        !workspace.concepts.some(
          (concept) => concept.conceptId === event.conceptId,
        ) ||
        !["selected", "accepted_for_phase_1h"].includes(event.action),
    ) ||
    (workspace.selectedConceptId !== null &&
      !workspace.concepts.some(
        (item) => item.conceptId === workspace.selectedConceptId,
      )) ||
    (workspace.acceptedConceptId !== null &&
      !workspace.concepts.some(
        (item) => item.conceptId === workspace.acceptedConceptId,
      ))
  )
    return failure("tampered_history", "Concept selection history is invalid.");
  if (
    workspace.outcomes.some(
      (outcome) =>
        !validDate(outcome.createdAt) ||
        !workspace.requests.some(
          (request) => request.requestId === outcome.requestId,
        ) ||
        !["completed", "failed", "cancelled"].includes(outcome.status) ||
        (outcome.status === "completed" && outcome.failureKind !== null) ||
        (outcome.status !== "completed" && outcome.failureKind === null),
    )
  )
    return failure(
      "tampered_history",
      "Generation outcome history is invalid.",
    );
  return { ok: true, value: workspace };
}

export function parseLocalConceptWorkspace(
  serialized: string,
): GenerationResult<LocalConceptWorkspace> {
  try {
    return validateWorkspace(JSON.parse(serialized));
  } catch {
    return failure("tampered_history", "Concept history is not valid JSON.");
  }
}

export function serializeLocalConceptWorkspace(
  workspace: LocalConceptWorkspace,
): string {
  return stableSerialize(workspace);
}

export function referencedConceptArtifactHashes(
  workspace: LocalConceptWorkspace,
): readonly string[] {
  return [
    ...new Set([
      ...workspace.concepts.map((item) => item.contentHash),
      ...workspace.requests.flatMap((item) =>
        item.photoDerivative ? [item.photoDerivative.contentHash] : [],
      ),
    ]),
  ].sort();
}
