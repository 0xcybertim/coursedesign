"use client";

import { useEffect, useRef, useState } from "react";
import {
  LOCAL_CONCEPT_WORKSPACE_KEY,
  acceptConceptForPhase1H,
  appendCompletedConceptBatch,
  appendGenerationRequest,
  appendRequestOutcome,
  createEmptyConceptWorkspace,
  parseLocalConceptWorkspace,
  selectConcept,
  serializeLocalConceptWorkspace,
  type ConceptProviderProvenance,
  type GenerationFailureKind,
  type ImmutableGenerationRequest,
  type LocalConceptWorkspace,
  type ConceptMediaType,
} from "@/domain/generation";

function localId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useLocalConceptWorkspace() {
  const [workspace, setWorkspace] = useState(() =>
    createEmptyConceptWorkspace(),
  );
  const workspaceRef = useRef(workspace);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState(
    "Checking browser-local concept history…",
  );
  const [integrityError, setIntegrityError] = useState<string | null>(null);

  function publish(next: LocalConceptWorkspace, status: string) {
    workspaceRef.current = next;
    setWorkspace(next);
    try {
      window.localStorage.setItem(
        LOCAL_CONCEPT_WORKSPACE_KEY,
        serializeLocalConceptWorkspace(next),
      );
      setPersistenceStatus(status);
    } catch {
      setPersistenceStatus(
        "Browser metadata storage is unavailable · history lasts for this tab only",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const now = new Date().toISOString();
      try {
        const stored = window.localStorage.getItem(LOCAL_CONCEPT_WORKSPACE_KEY);
        if (stored) {
          const parsed = parseLocalConceptWorkspace(stored);
          if (parsed.ok) {
            workspaceRef.current = parsed.value;
            setWorkspace(parsed.value);
            setPersistenceStatus("Concept history restored on this device");
          } else {
            const fresh = createEmptyConceptWorkspace(now);
            workspaceRef.current = fresh;
            setWorkspace(fresh);
            setIntegrityError(`${parsed.error.kind}: ${parsed.error.message}`);
            window.localStorage.setItem(
              LOCAL_CONCEPT_WORKSPACE_KEY,
              serializeLocalConceptWorkspace(fresh),
            );
            setPersistenceStatus(
              "Untrusted local history rejected · fresh workspace started",
            );
          }
        } else {
          const fresh = createEmptyConceptWorkspace(now);
          workspaceRef.current = fresh;
          setWorkspace(fresh);
          window.localStorage.setItem(
            LOCAL_CONCEPT_WORKSPACE_KEY,
            serializeLocalConceptWorkspace(fresh),
          );
          setPersistenceStatus("Empty concept workspace saved on this device");
        }
      } catch {
        const fresh = createEmptyConceptWorkspace(now);
        workspaceRef.current = fresh;
        setWorkspace(fresh);
        setPersistenceStatus(
          "Browser metadata storage is unavailable · history lasts for this tab only",
        );
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function addRequest(request: ImmutableGenerationRequest) {
    const result = appendGenerationRequest(workspaceRef.current, request);
    if (!result.ok) return result;
    publish(result.value, "Generation request recorded locally");
    return result;
  }

  function completeBatch(input: {
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
  }) {
    const batched = appendCompletedConceptBatch(workspaceRef.current, input);
    if (!batched.ok) return batched;
    const completed = appendRequestOutcome(batched.value, {
      outcomeId: localId("outcome"),
      requestId: input.requestId,
      status: "completed",
      createdAt: input.createdAt,
    });
    if (!completed.ok) return completed;
    publish(completed.value, "Four-concept batch stored on this device");
    return completed;
  }

  function recordFailure(
    requestId: string,
    kind: GenerationFailureKind,
    now: string,
  ) {
    const result = appendRequestOutcome(workspaceRef.current, {
      outcomeId: localId("outcome"),
      requestId,
      status: kind === "cancellation" ? "cancelled" : "failed",
      failureKind: kind,
      createdAt: now,
    });
    if (result.ok)
      publish(
        result.value,
        kind === "cancellation"
          ? "Cancelled request recorded locally"
          : "Failed request recorded locally",
      );
    return result;
  }

  function chooseConcept(conceptId: string) {
    const result = selectConcept(workspaceRef.current, {
      eventId: localId("selection"),
      conceptId,
      now: new Date().toISOString(),
    });
    if (result.ok) publish(result.value, "Selected concept recorded locally");
    return result;
  }

  function acceptConcept(conceptId: string) {
    const result = acceptConceptForPhase1H(workspaceRef.current, {
      eventId: localId("acceptance"),
      conceptId,
      now: new Date().toISOString(),
    });
    if (result.ok)
      publish(
        result.value,
        "Concept handoff recorded · no product revision was created",
      );
    return result;
  }

  return {
    workspace,
    workspaceRef,
    hydrated,
    persistenceStatus,
    integrityError,
    addRequest,
    completeBatch,
    recordFailure,
    chooseConcept,
    acceptConcept,
  };
}
