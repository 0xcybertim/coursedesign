"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LOCAL_PROFILE_WING_CREATION_KEY,
  appendProfileWingCandidate,
  appendProfileWingDecision,
  createEmptyProfileWingCreationWorkspace,
  createProfileWingCandidate,
  currentProfileWingCreationDecision,
  parseLocalProfileWingCreationWorkspace,
  serializeLocalProfileWingCreationWorkspace,
  type LocalProfileWingCreationWorkspace,
  type ProfileWingCreationCandidate,
  type ProfileWingCreationDecisionAction,
} from "@/domain/profile-wing-creation";

function localId(prefix: "candidate" | "decision") {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useLocalProfileWingCreation() {
  const [workspace, setWorkspace] = useState(() =>
    createEmptyProfileWingCreationWorkspace(),
  );
  const workspaceRef = useRef(workspace);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState(
    "Checking browser-local Profile Wing creation history…",
  );
  const [integrityError, setIntegrityError] = useState<string | null>(null);

  function publish(next: LocalProfileWingCreationWorkspace, message: string) {
    workspaceRef.current = next;
    setWorkspace(next);
    try {
      localStorage.setItem(
        LOCAL_PROFILE_WING_CREATION_KEY,
        serializeLocalProfileWingCreationWorkspace(next),
      );
      setStatus(message);
    } catch {
      setStatus(
        "Browser metadata storage is unavailable · creation history lasts for this tab only",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const now = new Date().toISOString();
      try {
        const stored = localStorage.getItem(LOCAL_PROFILE_WING_CREATION_KEY);
        if (!stored) {
          const fresh = createEmptyProfileWingCreationWorkspace(now);
          publish(fresh, "Empty Profile Wing creation history saved locally");
        } else {
          const parsed = parseLocalProfileWingCreationWorkspace(stored);
          if (parsed.ok) {
            workspaceRef.current = parsed.value;
            setWorkspace(parsed.value);
            setStatus("Profile Wing creation history restored on this device");
          } else {
            const fresh = createEmptyProfileWingCreationWorkspace(now);
            workspaceRef.current = fresh;
            setWorkspace(fresh);
            setIntegrityError(`${parsed.error.kind}: ${parsed.error.message}`);
            setStatus(
              "Untrusted Profile Wing creation history rejected · no candidate restored",
            );
          }
        }
      } catch {
        const fresh = createEmptyProfileWingCreationWorkspace(now);
        workspaceRef.current = fresh;
        setWorkspace(fresh);
        setStatus(
          "Browser metadata storage is unavailable · creation history lasts for this tab only",
        );
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function addCandidate(
    candidate: Omit<
      ProfileWingCreationCandidate,
      "schemaVersion" | "candidateId" | "candidateHash"
    >,
  ) {
    const created = createProfileWingCandidate({
      ...candidate,
      candidateId: localId("candidate"),
    });
    const appended = appendProfileWingCandidate(workspaceRef.current, created);
    if (appended.ok)
      publish(
        appended.value,
        "Mask and deterministic vectorization evidence saved locally",
      );
    return appended.ok ? { ok: true as const, value: created } : appended;
  }

  function decide(
    candidateId: string,
    action: ProfileWingCreationDecisionAction,
  ) {
    const result = appendProfileWingDecision(workspaceRef.current, {
      decisionId: localId("decision"),
      candidateId,
      action,
      createdAt: new Date().toISOString(),
    });
    if (result.ok)
      publish(
        result.value.workspace,
        action === "accepted_for_future_prototyping"
          ? "User silhouette accepted for deterministic prototyping"
          : "Source and mask retained without creating product geometry",
      );
    return result;
  }

  const currentCandidate = useMemo(
    () =>
      workspace.candidates.find(
        (candidate) => candidate.candidateId === workspace.currentCandidateId,
      ) ?? null,
    [workspace],
  );
  const currentDecision = useMemo(
    () =>
      currentCandidate
        ? currentProfileWingCreationDecision(
            workspace,
            currentCandidate.candidateId,
          )
        : null,
    [currentCandidate, workspace],
  );

  return {
    workspace,
    workspaceRef,
    hydrated,
    status,
    integrityError,
    currentCandidate,
    currentDecision,
    addCandidate,
    decide,
  };
}
