import { describe, expect, it } from "vitest";
import {
  acceptConceptForPhase1H,
  appendCompletedConceptBatch,
  appendGenerationRequest,
  appendRequestOutcome,
  createEmptyConceptWorkspace,
  createGenerationRequest,
  parseLocalConceptWorkspace,
  referencedConceptArtifactHashes,
  selectConcept,
  serializeLocalConceptWorkspace,
  type ConceptConstraints,
  type LocalConceptWorkspace,
} from "@/domain/generation";

const constraints: ConceptConstraints = {
  family: "profile-wing-vertical-v1",
  silhouetteSubject: "butterfly",
  poleCount: 4,
  colors: "navy and gold",
  lowerElementPreference: "none",
  sponsorArea: "subtle",
  style: "graphic",
};

function request(
  kind: "initial" | "regenerate" | "refine",
  options: {
    id: string;
    root?: string;
    parentBatch?: string;
    parentConcept?: string;
  },
) {
  return createGenerationRequest({
    requestId: options.id,
    kind,
    rootRequestId: options.root,
    parentBatchId: options.parentBatch,
    parentConceptId: options.parentConcept,
    prompt: kind === "refine" ? "Larger gold edge details" : "Butterfly jump",
    constraints,
    createdAt: `2026-07-15T20:0${kind === "initial" ? 0 : kind === "regenerate" ? 1 : 2}:00.000Z`,
  });
}

function appendBatch(
  workspace: LocalConceptWorkspace,
  requestId: string,
  batchId: string,
) {
  return appendCompletedConceptBatch(workspace, {
    requestId,
    batchId,
    createdAt: "2026-07-15T20:05:00.000Z",
    provenance: {
      provider: "deterministic-test",
      configuredModel: "deterministic-concept-v1",
      adapterVersion: "1.0.0-phase1g",
      providerRequestId: `provider-${batchId}`,
      seed: 1,
      revisedPrompt: null,
    },
    concepts: [1, 2, 3, 4].map((ordinal) => ({
      conceptId: `${batchId}-concept-${ordinal}`,
      contentHash: String(ordinal).repeat(64),
      byteLength: 100 + ordinal,
      mediaType: "image/png" as const,
    })),
  });
}

describe("Phase 1G immutable generation history", () => {
  it("hashes requests canonically and rejects mutation", () => {
    const original = request("initial", { id: "request-initial" });
    const workspace = appendGenerationRequest(
      createEmptyConceptWorkspace(),
      original,
    );
    expect(workspace.ok).toBe(true);
    const tampered = { ...original, prompt: "Changed after hashing" };
    expect(
      appendGenerationRequest(createEmptyConceptWorkspace(), tampered),
    ).toMatchObject({ ok: false, error: { kind: "tampered_history" } });
  });

  it("requires exactly four immutable results", () => {
    const initial = request("initial", { id: "request-initial" });
    const added = appendGenerationRequest(
      createEmptyConceptWorkspace(),
      initial,
    );
    if (!added.ok) throw new Error(added.error.message);
    expect(
      appendCompletedConceptBatch(added.value, {
        requestId: initial.requestId,
        batchId: "batch-short",
        createdAt: initial.createdAt,
        provenance: {
          provider: "openai",
          configuredModel: "gpt-image-2",
          adapterVersion: "1.0.0-phase1g",
          providerRequestId: null,
          seed: null,
          revisedPrompt: null,
        },
        concepts: [],
      }),
    ).toMatchObject({ ok: false, error: { kind: "malformed_response" } });
  });

  it("preserves sibling regenerate and child refinement ancestry", () => {
    let workspace = createEmptyConceptWorkspace();
    const initial = request("initial", { id: "request-initial" });
    const addedInitial = appendGenerationRequest(workspace, initial);
    if (!addedInitial.ok) throw new Error(addedInitial.error.message);
    const firstBatch = appendBatch(
      addedInitial.value,
      initial.requestId,
      "batch-1",
    );
    if (!firstBatch.ok) throw new Error(firstBatch.error.message);
    workspace = firstBatch.value;

    const regenerate = request("regenerate", {
      id: "request-regenerate",
      root: initial.requestId,
      parentBatch: "batch-1",
    });
    const addedRegenerate = appendGenerationRequest(workspace, regenerate);
    if (!addedRegenerate.ok) throw new Error(addedRegenerate.error.message);
    const sibling = appendBatch(
      addedRegenerate.value,
      regenerate.requestId,
      "batch-2",
    );
    if (!sibling.ok) throw new Error(sibling.error.message);

    const refine = request("refine", {
      id: "request-refine",
      root: initial.requestId,
      parentBatch: "batch-2",
      parentConcept: "batch-2-concept-2",
    });
    const addedRefine = appendGenerationRequest(sibling.value, refine);
    if (!addedRefine.ok) throw new Error(addedRefine.error.message);
    const child = appendBatch(addedRefine.value, refine.requestId, "batch-3");
    if (!child.ok) throw new Error(child.error.message);

    expect(child.value.batches).toHaveLength(3);
    expect(child.value.concepts).toHaveLength(12);
    expect(child.value.batches[1]).toMatchObject({
      relation: "regenerate",
      rootRequestId: initial.requestId,
      parentBatchId: "batch-1",
      parentConceptId: null,
    });
    expect(child.value.batches[2]).toMatchObject({
      relation: "refine",
      rootRequestId: initial.requestId,
      parentBatchId: "batch-2",
      parentConceptId: "batch-2-concept-2",
    });
  });

  it("stores selection and Phase 1H acceptance separately from concept records", () => {
    const initial = request("initial", { id: "request-initial" });
    const added = appendGenerationRequest(
      createEmptyConceptWorkspace(),
      initial,
    );
    if (!added.ok) throw new Error(added.error.message);
    const batched = appendBatch(added.value, initial.requestId, "batch-1");
    if (!batched.ok) throw new Error(batched.error.message);
    const before = batched.value.concepts[0];
    const selected = selectConcept(batched.value, {
      eventId: "selection-1",
      conceptId: before.conceptId,
      now: "2026-07-15T20:10:00.000Z",
    });
    if (!selected.ok) throw new Error(selected.error.message);
    const accepted = acceptConceptForPhase1H(selected.value, {
      eventId: "acceptance-1",
      conceptId: before.conceptId,
      now: "2026-07-15T20:11:00.000Z",
    });
    if (!accepted.ok) throw new Error(accepted.error.message);
    expect(accepted.value.concepts[0]).toEqual(before);
    expect(accepted.value.acceptedConceptId).toBe(before.conceptId);
    expect(accepted.value.selectionEvents.map((event) => event.action)).toEqual(
      ["selected", "accepted_for_phase_1h"],
    );
  });

  it("round-trips valid history and rejects hash tampering or unsupported schemas", () => {
    const initial = request("initial", { id: "request-initial" });
    const added = appendGenerationRequest(
      createEmptyConceptWorkspace(),
      initial,
    );
    if (!added.ok) throw new Error(added.error.message);
    const batched = appendBatch(added.value, initial.requestId, "batch-1");
    if (!batched.ok) throw new Error(batched.error.message);
    const outcome = appendRequestOutcome(batched.value, {
      outcomeId: "outcome-1",
      requestId: initial.requestId,
      status: "completed",
      createdAt: "2026-07-15T20:06:00.000Z",
    });
    if (!outcome.ok) throw new Error(outcome.error.message);
    expect(
      parseLocalConceptWorkspace(serializeLocalConceptWorkspace(outcome.value)),
    ).toEqual({
      ok: true,
      value: outcome.value,
    });
    const tampered = JSON.parse(serializeLocalConceptWorkspace(outcome.value));
    tampered.concepts[0].contentHash = "f".repeat(64);
    expect(parseLocalConceptWorkspace(JSON.stringify(tampered))).toMatchObject({
      ok: false,
      error: { kind: "tampered_history" },
    });
    expect(
      parseLocalConceptWorkspace(
        JSON.stringify({ ...tampered, schemaVersion: "future" }),
      ),
    ).toMatchObject({ ok: false, error: { kind: "unsupported_history" } });
  });

  it("accounts for generated, selected, and photo derivative artifact references", () => {
    const initial = createGenerationRequest({
      requestId: "request-photo",
      kind: "initial",
      prompt: "Owned butterfly artwork",
      constraints,
      photoDerivative: {
        contentHash: "a".repeat(64),
        mediaType: "image/jpeg",
        byteLength: 120,
        pixelWidth: 640,
        pixelHeight: 480,
        processingVersion: "1.0.0-phase1g-photo",
        originalFilename: "butterfly.jpg",
        subjectKind: "animal",
      },
      consent: {
        rightsConfirmedAt: "2026-07-15T20:00:00.000Z",
        openAiDisclosureConfirmedAt: "2026-07-15T20:00:00.000Z",
        noIdentifiablePeopleConfirmedAt: "2026-07-15T20:00:00.000Z",
        noLogoConfirmedAt: "2026-07-15T20:00:00.000Z",
        singleSubjectConfirmedAt: "2026-07-15T20:00:00.000Z",
      },
      createdAt: "2026-07-15T20:00:00.000Z",
    });
    const added = appendGenerationRequest(
      createEmptyConceptWorkspace(),
      initial,
    );
    if (!added.ok) throw new Error(added.error.message);
    const batched = appendBatch(added.value, initial.requestId, "batch-photo");
    if (!batched.ok) throw new Error(batched.error.message);
    expect(referencedConceptArtifactHashes(batched.value)).toEqual([
      "1".repeat(64),
      "2".repeat(64),
      "3".repeat(64),
      "4".repeat(64),
      "a".repeat(64),
    ]);
  });
});
