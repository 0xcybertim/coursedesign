"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONCEPT_STYLES,
  LOWER_ELEMENT_PREFERENCES,
  SPONSOR_AREA_PREFERENCES,
  createGenerationRequest,
  findSubjectConflict,
  generationBriefRows,
  type ConceptConstraints,
  type ConceptMediaType,
  type ConceptProviderProvenance,
  type GeneratedConcept,
  type GenerationFailureKind,
  type GenerationRequestKind,
  type ImmutableGenerationRequest,
} from "@/domain/generation";
import { hashArtworkBytes } from "@/domain/artwork";
import {
  getArtworkBlob,
  storeContentAddressedBlob,
} from "@/lib/browser/artifact-store";
import { ConceptGallery } from "./ConceptGallery";
import { PhotoInput, type PreparedPhoto } from "./PhotoInput";
import { useLocalConceptWorkspace } from "./useLocalConceptWorkspace";

type GenerationStatus =
  | "idle"
  | "preparing reference"
  | "sending"
  | "generating"
  | "storing results"
  | "cancelled"
  | "failed";

interface ApiSuccess {
  readonly ok: true;
  readonly requestId: string;
  readonly images: readonly {
    readonly mediaType: ConceptMediaType;
    readonly base64: string;
  }[];
  readonly provenance: ConceptProviderProvenance;
}

interface ApiFailure {
  readonly ok: false;
  readonly error: {
    readonly kind: GenerationFailureKind;
    readonly message: string;
    readonly recoverable: boolean;
  };
}

function localId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bytesFromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function blobBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        String(reader.result).slice(String(reader.result).indexOf(",") + 1),
      );
    reader.onerror = () =>
      reject(reader.error ?? new Error("Blob read failed."));
    reader.readAsDataURL(blob);
  });
}

function requestConsent(now: string, hasPhoto: boolean) {
  return hasPhoto
    ? {
        rightsConfirmedAt: now,
        openAiDisclosureConfirmedAt: now,
        noIdentifiablePeopleConfirmedAt: now,
        noLogoConfirmedAt: now,
        singleSubjectConfirmedAt: now,
      }
    : null;
}

export function ConceptStudioClient(props: {
  readonly providerMode: "openai" | "deterministic";
}) {
  const local = useLocalConceptWorkspace();
  const [creativeDirection, setCreativeDirection] = useState(
    "Symmetrical wings with bold edge markings and an upward sweep.",
  );
  const [constraints, setConstraints] = useState<ConceptConstraints>({
    family: "profile-wing-vertical-v1",
    silhouetteSubject: "butterfly",
    poleCount: 4,
    colors: "navy, gold, blue and white",
    lowerElementPreference: "none",
    sponsorArea: "subtle",
    style: "graphic",
  });
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoConsentReady, setPhotoConsentReady] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<ApiFailure["error"] | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [refineConceptId, setRefineConceptId] = useState<string | null>(null);
  const [refineRevealToken, setRefineRevealToken] = useState(0);
  const [refinementPrompt, setRefinementPrompt] = useState(
    "Make the gold edge details larger.",
  );
  const [boundaryMessage, setBoundaryMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRequests = useRef(new Set<string>());
  const generateTriggerRef = useRef<HTMLButtonElement>(null);
  const refinementPanelRef = useRef<HTMLElement>(null);
  const refinementPromptRef = useRef<HTMLTextAreaElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      let value = window.sessionStorage.getItem(
        "course-design.phase1g-session",
      );
      if (!value) {
        value = localId("browser-session");
        window.sessionStorage.setItem("course-design.phase1g-session", value);
      }
      setSessionId(value);
    });
  }, []);

  useEffect(() => {
    if (!refineConceptId) return;
    refinementPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    refinementPromptRef.current?.focus({ preventScroll: true });
  }, [refineConceptId, refineRevealToken]);

  const active = activeRequestId !== null;
  const selectedConcept = useMemo(
    () =>
      local.workspace.concepts.find(
        (item) => item.conceptId === local.workspace.selectedConceptId,
      ) ?? null,
    [local.workspace.concepts, local.workspace.selectedConceptId],
  );
  const latestBatch = local.workspace.batches.at(-1) ?? null;
  const subjectConflict = useMemo(
    () => findSubjectConflict(creativeDirection, constraints.silhouetteSubject),
    [creativeDirection, constraints.silhouetteSubject],
  );
  const briefRows = useMemo(
    () =>
      generationBriefRows({
        creativeDirection,
        constraints,
        hasReferencePhoto: Boolean(photo),
      }),
    [creativeDirection, constraints, photo],
  );

  async function encodedArtifact(
    contentHash: string,
    filename: string,
    mediaType: "image/png" | "image/jpeg" | "image/webp",
  ) {
    const stored = await getArtworkBlob(contentHash);
    if (!stored.ok)
      throw Object.assign(new Error(stored.error.message), {
        kind: "missing_artifact" as const,
      });
    return {
      contentHash,
      filename,
      mediaType,
      base64: await blobBase64(stored.value),
    };
  }

  function makeRequest(
    kind: GenerationRequestKind,
    selected: GeneratedConcept | null,
  ): ImmutableGenerationRequest | null {
    const now = new Date().toISOString();
    const requestId = localId("concept-request");
    if (kind !== "initial" && !latestBatch) return null;
    return createGenerationRequest({
      requestId,
      kind,
      rootRequestId:
        kind === "initial"
          ? requestId
          : (latestBatch?.rootRequestId ?? requestId),
      parentBatchId: kind === "initial" ? null : latestBatch?.batchId,
      parentConceptId: kind === "refine" ? selected?.conceptId : null,
      prompt: kind === "refine" ? refinementPrompt : creativeDirection,
      constraints,
      photoDerivative: kind === "refine" ? null : photo?.derivative,
      consent: kind === "refine" ? null : requestConsent(now, Boolean(photo)),
      createdAt: now,
    });
  }

  async function submit(
    kind: GenerationRequestKind,
    selected: GeneratedConcept | null,
  ) {
    if (!sessionId || active) return;
    const currentDirection =
      kind === "refine" ? refinementPrompt : creativeDirection;
    const currentConflict = findSubjectConflict(
      currentDirection,
      constraints.silhouetteSubject,
    );
    if (currentConflict) {
      setError({
        kind: "invalid_request",
        message: `Creative direction mentions ${currentConflict.directionSubject}, but the silhouette subject is ${currentConflict.structuredSubjectLabel}. Resolve the conflict before submission.`,
        recoverable: true,
      });
      return;
    }
    if (photo && !photoConsentReady) {
      setError({
        kind: "policy_failure",
        message:
          "Complete all five reference-photo confirmations before submission.",
        recoverable: true,
      });
      return;
    }
    const request = makeRequest(kind, selected);
    if (!request) return;
    const added = local.addRequest(request);
    if (!added.ok) {
      setError(added.error);
      return;
    }
    setError(null);
    setBoundaryMessage(null);
    setActiveRequestId(request.requestId);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setStatus(photo && kind !== "refine" ? "preparing reference" : "sending");
      const referencePhoto =
        photo && kind !== "refine"
          ? await encodedArtifact(
              photo.derivative.contentHash,
              "phase-1g-reference.jpg",
              "image/jpeg",
            )
          : null;
      let sourceConcept = null;
      if (kind === "refine" && selected) {
        if (selected.mediaType === "image/svg+xml") {
          // The deterministic provider accepts its own local test artifact. Real OpenAI
          // output is always a supported raster type.
          const stored = await getArtworkBlob(selected.contentHash);
          if (!stored.ok)
            throw Object.assign(new Error(stored.error.message), {
              kind: "missing_artifact" as const,
            });
          sourceConcept = {
            contentHash: selected.contentHash,
            filename: "selected-concept.png",
            mediaType: "image/png" as const,
            base64: await blobBase64(stored.value),
          };
        } else {
          sourceConcept = await encodedArtifact(
            selected.contentHash,
            `selected-concept.${selected.mediaType.split("/")[1]}`,
            selected.mediaType,
          );
        }
      }
      setStatus("sending");
      const responsePromise = fetch("/api/generation/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          requestId: request.requestId,
          action: kind === "refine" ? "refine" : "generate",
          prompt: request.prompt,
          constraints,
          photoDerivative: request.photoDerivative,
          photoConsent: request.consent,
          referencePhoto,
          sourceConcept,
        }),
      });
      setStatus("generating");
      const response = await responsePromise;
      const payload = (await response.json()) as ApiSuccess | ApiFailure;
      if (!payload.ok)
        throw Object.assign(new Error(payload.error.message), payload.error);
      if (
        payload.requestId !== request.requestId ||
        payload.images.length !== 4
      )
        throw Object.assign(
          new Error("The provider response batch was malformed."),
          {
            kind: "malformed_response" as const,
          },
        );
      if (
        controller.signal.aborted ||
        cancelledRequests.current.has(request.requestId)
      )
        return;
      setStatus("storing results");
      const conceptRecords = [];
      for (const [index, image] of payload.images.entries()) {
        const bytes = bytesFromBase64(image.base64);
        const contentHash = hashArtworkBytes(bytes);
        const blob = new Blob([bytes], { type: image.mediaType });
        const stored = await storeContentAddressedBlob({ contentHash, blob });
        if (!stored.ok)
          throw Object.assign(new Error(stored.error.message), {
            kind: "storage_failure" as const,
          });
        conceptRecords.push({
          conceptId: localId(`concept-${index + 1}`),
          contentHash,
          byteLength: blob.size,
          mediaType: image.mediaType,
        });
      }
      if (
        controller.signal.aborted ||
        cancelledRequests.current.has(request.requestId)
      )
        return;
      const completed = local.completeBatch({
        batchId: localId("concept-batch"),
        requestId: request.requestId,
        provenance: payload.provenance,
        concepts: conceptRecords,
        createdAt: new Date().toISOString(),
      });
      if (!completed.ok)
        throw Object.assign(
          new Error(completed.error.message),
          completed.error,
        );
      setRefineConceptId(null);
      setStatus("idle");
    } catch (caught) {
      const wasCancelled =
        controller.signal.aborted ||
        cancelledRequests.current.has(request.requestId);
      const kind = wasCancelled
        ? "cancellation"
        : caught && typeof caught === "object" && "kind" in caught
          ? (String(caught.kind) as GenerationFailureKind)
          : "unknown_provider_failure";
      if (
        !local.workspaceRef.current.outcomes.some(
          (item) => item.requestId === request.requestId,
        )
      )
        local.recordFailure(request.requestId, kind, new Date().toISOString());
      if (kind !== "cancellation") {
        setError({
          kind,
          message:
            caught instanceof Error
              ? caught.message
              : "Concept generation failed. Nothing was retried automatically.",
          recoverable: true,
        });
        setStatus("failed");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setActiveRequestId(null);
    }
  }

  function cancel() {
    if (!activeRequestId) return;
    cancelledRequests.current.add(activeRequestId);
    abortRef.current?.abort();
    if (
      !local.workspaceRef.current.outcomes.some(
        (item) => item.requestId === activeRequestId,
      )
    )
      local.recordFailure(
        activeRequestId,
        "cancellation",
        new Date().toISOString(),
      );
    setStatus("cancelled");
    setError({
      kind: "cancellation",
      message:
        props.providerMode === "openai"
          ? "Generation was cancelled locally and late output will be discarded. Provider cost may already have been incurred."
          : "The simulator request was cancelled locally and late fixture output will be discarded. No live provider call or cost was involved.",
      recoverable: true,
    });
    requestAnimationFrame(() => generateTriggerRef.current?.focus());
  }

  function buildSelected() {
    if (!selectedConcept) return;
    const accepted = local.acceptConcept(selectedConcept.conceptId);
    if (accepted.ok)
      setBoundaryMessage(
        "Selection recorded. The Phase 1H-B2 review uses only its approved benchmark fixtures; this concept was not uploaded, masked, vectorized, or connected to that evidence. No obstacle geometry, product revision, course quantity, quote, or supplier-approved design was created.",
      );
  }

  return (
    <main className="concept-studio-shell">
      <header className="concept-studio-header">
        <div
          className="working-brand"
          aria-label="JUMPFORM working mockup wordmark"
        >
          <span>JUMPFORM</span>
          <small>working wordmark</small>
        </div>
        <div className="studio-identity">
          <strong>Concept studio · Phase 1G</strong>
          <span>Developer-only · browser-local history</span>
        </div>
        <span className="prototype-status">Concepts · not production</span>
      </header>

      <section className="concept-hero" aria-labelledby="concept-title">
        <div>
          <p className="eyebrow">Imagine first · validate later</p>
          <h1 id="concept-title">Create a jump concept.</h1>
          <p>
            Generate visual jump concepts, then build an accepted concept as a
            controlled, non-sellable prototype obstacle. Generated images are
            not geometry, specifications, quotes, or supplier-approved designs.
            Simulator fixtures only prove workflow behavior.
          </p>
        </div>
        <div className="concept-boundary-panel">
          <strong>
            {props.providerMode === "openai"
              ? "Live OpenAI Image provider"
              : "Workflow simulator"}
          </strong>
          {props.providerMode === "openai" ? (
            <p>
              This mode sends the assembled brief to OpenAI for real image
              generation. It uses server-only credentials, no automatic retries,
              and stateless Image API generation or editing. Inputs are not
              logged by this app.
            </p>
          ) : (
            <>
              <p>
                Creates zero-cost, repeatable fixture previews. Use it to test
                inputs, history, refinement, persistence, selection, and photo
                preprocessing. It does not make live provider calls or
                demonstrate AI image quality.
              </p>
              <div className="concept-tester-guide">
                <strong>Try a dog fixture</strong>
                <p>
                  Set the silhouette subject to dog, choose colors and style,
                  then add pose or markings under Creative direction. Regenerate
                  adds a sibling batch; Refine adds a child and preserves both.
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="concept-workspace">
        <section
          className="concept-form-panel"
          aria-labelledby="concept-form-title"
        >
          <div className="concept-section-heading">
            <p className="eyebrow">01 / Direction</p>
            <h2 id="concept-form-title">Set one creative brief</h2>
          </div>
          <label htmlFor="concept-prompt">Creative direction — optional</label>
          <textarea
            id="concept-prompt"
            value={creativeDirection}
            maxLength={2000}
            aria-describedby={`concept-prompt-help${subjectConflict ? " concept-subject-conflict" : ""}`}
            aria-invalid={subjectConflict ? true : undefined}
            onChange={(event) => setCreativeDirection(event.target.value)}
            disabled={active}
          />
          <p id="concept-prompt-help">
            Add details such as pose, expression, markings, or composition.
            Subject, colors, style, and obstacle structure are controlled below.
          </p>
          {subjectConflict ? (
            <div
              id="concept-subject-conflict"
              className="concept-conflict-warning"
              role="alert"
            >
              <strong>Resolve the subject conflict</strong>
              <p>
                Creative direction mentions {subjectConflict.directionSubject},
                while the structured silhouette subject is{" "}
                {subjectConflict.structuredSubjectLabel}. This bounded check
                only recognizes common test subjects.
              </p>
              <button
                type="button"
                disabled={active}
                onClick={() =>
                  setConstraints({
                    ...constraints,
                    silhouetteSubject: subjectConflict.directionSubject,
                  })
                }
              >
                Use {subjectConflict.directionSubject} as silhouette subject
              </button>
            </div>
          ) : null}

          <fieldset className="concept-constraints">
            <legend>Controlled prototype direction</legend>
            <label>
              Family
              <input
                value="Profile Wing Vertical"
                readOnly
                aria-readonly="true"
              />
            </label>
            <label>
              Silhouette subject
              <input
                value={constraints.silhouetteSubject}
                aria-invalid={subjectConflict ? true : undefined}
                aria-describedby={
                  subjectConflict ? "concept-subject-conflict" : undefined
                }
                onChange={(event) =>
                  setConstraints({
                    ...constraints,
                    silhouetteSubject: event.target.value,
                  })
                }
                disabled={active}
              />
            </label>
            <label>
              Pole count
              <input value="4 · locked" readOnly aria-readonly="true" />
            </label>
            <label>
              Colors
              <input
                value={constraints.colors}
                onChange={(event) =>
                  setConstraints({ ...constraints, colors: event.target.value })
                }
                disabled={active}
              />
            </label>
            <label>
              Lower element preference
              <select
                value={constraints.lowerElementPreference}
                onChange={(event) =>
                  setConstraints({
                    ...constraints,
                    lowerElementPreference: event.target
                      .value as ConceptConstraints["lowerElementPreference"],
                  })
                }
                disabled={active}
              >
                {LOWER_ELEMENT_PREFERENCES.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("-", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sponsor area
              <select
                value={constraints.sponsorArea}
                onChange={(event) =>
                  setConstraints({
                    ...constraints,
                    sponsorArea: event.target
                      .value as ConceptConstraints["sponsorArea"],
                  })
                }
                disabled={active}
              >
                {SPONSOR_AREA_PREFERENCES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Style
              <select
                value={constraints.style}
                onChange={(event) =>
                  setConstraints({
                    ...constraints,
                    style: event.target.value as ConceptConstraints["style"],
                  })
                }
                disabled={active}
              >
                {CONCEPT_STYLES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <PhotoInput
            providerMode={props.providerMode}
            value={photo}
            onChange={(value) => {
              setPhoto(value);
              if (!value) setPhotoConsentReady(false);
            }}
            consentReady={photoConsentReady}
            onConsentReadyChange={setPhotoConsentReady}
            onPreparingChange={(preparing) =>
              setStatus(preparing ? "preparing reference" : "idle")
            }
          />

          <section
            className="concept-brief-summary"
            aria-labelledby="generation-brief-title"
          >
            <p className="eyebrow">Exact assembled direction</p>
            <h3 id="generation-brief-title">Generation brief</h3>
            <p>
              Structured controls are authoritative. This is the combined brief
              used for the next{" "}
              {props.providerMode === "openai"
                ? "live request"
                : "fixture batch"}
              .
            </p>
            <dl>
              {briefRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="concept-submit-row">
            <button
              ref={generateTriggerRef}
              className="concept-primary-action"
              type="button"
              disabled={
                !local.hydrated ||
                !sessionId ||
                active ||
                Boolean(subjectConflict) ||
                (Boolean(photo) && !photoConsentReady)
              }
              onClick={() => void submit("initial", null)}
            >
              {props.providerMode === "openai"
                ? "Generate four concepts"
                : "Create four fixture previews"}
            </button>
            {latestBatch ? (
              <button
                type="button"
                disabled={active}
                onClick={() => void submit("regenerate", null)}
              >
                Regenerate{" "}
                {props.providerMode === "openai"
                  ? "sibling batch"
                  : "fixture batch"}
              </button>
            ) : null}
            {active ? (
              <button
                type="button"
                className="concept-cancel-action"
                onClick={cancel}
              >
                Cancel generation
              </button>
            ) : null}
          </div>
          <div
            className="concept-status"
            role="status"
            aria-live="polite"
            data-status={status}
          >
            {status === "idle"
              ? "Ready · no request running"
              : status === "generating" &&
                  props.providerMode === "deterministic"
                ? "creating deterministic fixtures"
                : status}
          </div>
          {error ? (
            <div className="concept-error" role="alert">
              <strong>{error.kind}</strong>
              <p>{error.message}</p>
            </div>
          ) : null}
          <p className="concept-persistence-status">
            {local.persistenceStatus}
          </p>
          {local.integrityError ? (
            <p role="alert">{local.integrityError}</p>
          ) : null}
        </section>

        <section
          className="concept-gallery-panel"
          aria-labelledby="concept-gallery-title"
        >
          <div className="concept-section-heading concept-gallery-heading">
            <div>
              <p className="eyebrow">02 / Explore</p>
              <h2 id="concept-gallery-title">Immutable concept history</h2>
            </div>
            <span>
              {local.workspace.batches.length} batches ·{" "}
              {local.workspace.concepts.length} concepts
            </span>
          </div>
          {refineConceptId ? (
            <section
              ref={refinementPanelRef}
              className="concept-refine-panel"
              aria-labelledby="refinement-title"
            >
              <p className="eyebrow">Refining selected fixture</p>
              <h3 id="refinement-title">Describe the change</h3>
              <p>
                The selected fixture stays in history. Your instruction creates
                a new four-result child batch.
              </p>
              <label htmlFor="refinement-prompt">What should change?</label>
              <textarea
                ref={refinementPromptRef}
                id="refinement-prompt"
                value={refinementPrompt}
                onChange={(event) => setRefinementPrompt(event.target.value)}
                disabled={active}
              />
              <button
                type="button"
                className="concept-primary-action"
                disabled={active || refinementPrompt.trim().length < 3}
                onClick={() =>
                  void submit(
                    "refine",
                    local.workspace.concepts.find(
                      (item) => item.conceptId === refineConceptId,
                    ) ?? null,
                  )
                }
              >
                {props.providerMode === "openai"
                  ? "Create four refined concepts"
                  : "Create four refined fixtures"}
              </button>
            </section>
          ) : null}
          <ConceptGallery
            workspace={local.workspace}
            onSelect={(conceptId) => {
              local.chooseConcept(conceptId);
              setBoundaryMessage(null);
            }}
            onRefine={(conceptId) => {
              local.chooseConcept(conceptId);
              setRefineConceptId(conceptId);
              setRefineRevealToken((current) => current + 1);
              setBoundaryMessage(null);
            }}
            disabled={active}
          />
          <div className="concept-build-boundary">
            <div>
              <p className="eyebrow">03 / Explicit boundary</p>
              <h2>Build this concept</h2>
              <p>
                Records the selected concept for a future selected-concept
                silhouette run only. The current Phase 1H-B2 review contains
                benchmark fixtures, not this concept. This action cannot create
                or mutate SPJ-04, an obstacle revision, course quantities, or
                production truth.
              </p>
            </div>
            <button
              type="button"
              disabled={!selectedConcept || active}
              onClick={buildSelected}
            >
              Build this concept
            </button>
          </div>
          {boundaryMessage ? (
            <p className="concept-boundary-message" role="status">
              {boundaryMessage}
            </p>
          ) : null}
        </section>
      </div>

      <footer className="concept-footer">
        <span>
          Developer-only · same-browser persistence · no public endpoint
        </span>
        <div>
          <Link href="/studio/silhouettes/review">
            Review Phase 1H benchmark silhouettes
          </Link>
          <Link href="/studio/obstacles/spj-04">
            Open exact SPJ-04 artwork workflow
          </Link>
        </div>
      </footer>
    </main>
  );
}
