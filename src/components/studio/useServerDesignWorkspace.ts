"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  LOCAL_WORKSPACE_SCHEMA_VERSION,
  duplicateLocalRevision,
  findLocalRevision,
  referencedRenderableArtworkHashes,
  updateLocalDraft,
  type ArtworkConfiguration,
  type LocalDesignWorkspace,
  type ObstacleDesignRevision,
  type ObstacleIntent,
} from "@/domain/design";
import type {
  DesignRecord,
  DesignRevisionPage,
  PersistenceFailure,
} from "@/persistence";
import { getArtworkBlob } from "@/lib/browser/artifact-store";
import {
  persistenceApi,
  uploadCanonicalArtwork,
} from "@/lib/browser/persistence-api";

import type { SaveRevisionResult } from "./useLocalDesignWorkspace";

const INITIAL_WORKSPACE: LocalDesignWorkspace = {
  schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
  designId: "local-spj-04",
  draft: {
    schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
    draftId: "server-draft-loading",
    designId: "local-spj-04",
    draftVersion: 1,
    basedOnRevisionId: null,
    intent: {
      schemaVersion: "1.0.0-phase1a",
      frameColor: "blue",
      poleTreatment: "two_color_alternating_segments",
      lowerElement: "gate",
      artwork: "fixed_panel_artwork",
    },
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  revisions: [],
};

interface ConflictState {
  readonly attempted: LocalDesignWorkspace;
  readonly latest: DesignRecord;
}

function localId(prefix: "draft" | "revision"): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useServerDesignWorkspace(
  requestedRevisionId?: string,
  enabled = true,
) {
  const [workspace, setWorkspace] =
    useState<LocalDesignWorkspace>(INITIAL_WORKSPACE);
  const workspaceRef = useRef(workspace);
  const lockVersionRef = useRef(1);
  const saveQueue = useRef(Promise.resolve());
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState("Loading server workspace…");
  const [saveState, setSaveState] = useState<
    "checking" | "restored" | "saved" | "revision_saved" | "unavailable"
  >("checking");
  const [viewingRevisionId, setViewingRevisionId] = useState<string | null>(
    null,
  );
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  function replaceWorkspace(next: LocalDesignWorkspace) {
    workspaceRef.current = next;
    setWorkspace(next);
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.all([
      persistenceApi<DesignRecord>("/api/designs/local-spj-04"),
      persistenceApi<DesignRevisionPage>(
        "/api/designs/local-spj-04/revisions?limit=100",
      ),
    ]).then(([design, revisions]) => {
      if (cancelled) return;
      if (!design.ok) {
        setStatus(design.error.message);
        setSaveState("unavailable");
        setHydrated(true);
        return;
      }
      if (!revisions.ok) {
        setStatus(revisions.error.message);
        setSaveState("unavailable");
        setHydrated(true);
        return;
      }
      const obstacleRevisions = revisions.value.revisions.filter(
        (revision): revision is ObstacleDesignRevision =>
          revision.designId === "local-spj-04",
      );
      const next: LocalDesignWorkspace = {
        schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
        designId: "local-spj-04",
        draft: design.value.draft,
        revisions: obstacleRevisions,
      };
      lockVersionRef.current = design.value.lockVersion;
      replaceWorkspace(next);
      if (
        requestedRevisionId &&
        obstacleRevisions.some(
          (revision) => revision.revisionId === requestedRevisionId,
        )
      ) {
        setViewingRevisionId(requestedRevisionId);
      }
      setStatus("Draft restored from server workspace");
      setSaveState("restored");
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, requestedRevisionId]);

  const viewingRevision = useMemo<ObstacleDesignRevision | null>(() => {
    if (!viewingRevisionId) return null;
    const found = findLocalRevision(workspace, viewingRevisionId);
    return found.ok ? found.value : null;
  }, [viewingRevisionId, workspace]);

  function persistDraft(attempted: LocalDesignWorkspace) {
    setStatus("Saving draft to server workspace…");
    saveQueue.current = saveQueue.current.then(async () => {
      const expectedLockVersion = lockVersionRef.current;
      const saved = await persistenceApi<DesignRecord>(
        "/api/designs/local-spj-04",
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedLockVersion,
            draft: attempted.draft,
          }),
        },
      );
      if (saved.ok) {
        lockVersionRef.current = saved.value.lockVersion;
        if (
          workspaceRef.current.draft.draftVersion ===
          attempted.draft.draftVersion
        ) {
          replaceWorkspace({
            ...workspaceRef.current,
            draft: saved.value.draft,
          });
        }
        setConflict(null);
        setSaveState("saved");
        setStatus("Draft saved to server workspace");
        return;
      }
      if (saved.error.kind === "stale_version") {
        const stale = saved as PersistenceFailure<DesignRecord>;
        if (stale.error.kind === "stale_version") {
          lockVersionRef.current = stale.error.actualLockVersion;
          setConflict({ attempted, latest: stale.error.latest });
          setStatus(
            "Conflict: this design changed elsewhere. Your attempted edit is preserved.",
          );
          setSaveState("unavailable");
          return;
        }
      }
      setStatus(saved.error.message);
      setSaveState("unavailable");
    });
  }

  function updateIntent(intent: ObstacleIntent) {
    if (!hydrated || viewingRevision) return;
    const updated = updateLocalDraft(
      workspaceRef.current,
      intent,
      new Date().toISOString(),
    );
    if (!updated.ok) return;
    setArtifactError(null);
    replaceWorkspace(updated.value);
    persistDraft(updated.value);
  }

  async function saveRevision(): Promise<SaveRevisionResult> {
    await saveQueue.current;
    if (!hydrated || viewingRevision || conflict) {
      return {
        ok: false,
        error: {
          kind: "invalid_workspace",
          message: conflict
            ? "Resolve the visible server conflict before saving a revision."
            : "The server draft must finish loading before it can be saved.",
        },
      };
    }
    const configuration =
      workspaceRef.current.draft.intent.artworkConfiguration;
    const hashes = configuration
      ? referencedRenderableArtworkHashes(configuration)
      : [];
    if (configuration) {
      const placements = [configuration.left, configuration.right];
      for (const hash of hashes) {
        const placement = placements.find(
          (candidate) => candidate.renderContentHash === hash,
        );
        const blob = await getArtworkBlob(hash);
        if (!placement || !blob.ok) {
          const message = blob.ok
            ? "Canonical artwork dimensions are unavailable."
            : blob.error.message;
          setArtifactError(message);
          return {
            ok: false,
            error: { kind: "artifact_verification_required", message },
          };
        }
        const upload = await uploadCanonicalArtwork({
          contentHash: hash,
          blob: blob.value,
          pixelWidth: placement.pixelWidth,
          pixelHeight: placement.pixelHeight,
        });
        if (!upload.ok) {
          setArtifactError(upload.error.message);
          return {
            ok: false,
            error: {
              kind: "artifact_verification_required",
              message: upload.error.message,
            },
          };
        }
      }
    }
    const saved = await persistenceApi<{
      readonly design: DesignRecord;
      readonly revision: ObstacleDesignRevision;
    }>("/api/designs/local-spj-04/revisions", {
      method: "POST",
      body: JSON.stringify({
        expectedLockVersion: lockVersionRef.current,
        idempotencyKey: localId("revision"),
        referencedRenderableArtworkHashes: hashes,
      }),
    });
    if (!saved.ok) {
      setArtifactError(saved.error.message);
      return {
        ok: false,
        error: {
          kind:
            saved.error.kind === "asset_unavailable"
              ? "artifact_verification_required"
              : "invalid_revision",
          message: saved.error.message,
        },
      };
    }
    replaceWorkspace({
      ...workspaceRef.current,
      revisions: [...workspaceRef.current.revisions, saved.value.revision],
    });
    setArtifactError(null);
    setSaveState("revision_saved");
    setStatus(
      `Revision ${String(saved.value.revision.ordinal).padStart(2, "0")} saved to server workspace`,
    );
    return { ok: true, revision: saved.value.revision };
  }

  function confirmArtwork(configuration: ArtworkConfiguration | null) {
    updateIntent({
      ...workspaceRef.current.draft.intent,
      artwork: configuration ? "custom_artwork" : "fixed_panel_artwork",
      ...(configuration ? { artworkConfiguration: configuration } : {}),
    });
  }

  function reloadLatest() {
    if (!conflict) return;
    const next = {
      ...workspaceRef.current,
      draft: conflict.latest.draft,
    };
    lockVersionRef.current = conflict.latest.lockVersion;
    replaceWorkspace(next);
    setConflict(null);
    setSaveState("restored");
    setStatus("Latest server draft loaded. Your prior attempt was not saved.");
  }

  function retryAttempted() {
    if (!conflict) return;
    const attempted = conflict.attempted;
    setConflict(null);
    replaceWorkspace(attempted);
    persistDraft(attempted);
  }

  function duplicateRevision() {
    if (!viewingRevision) return;
    const duplicated = duplicateLocalRevision(
      workspaceRef.current,
      viewingRevision.revisionId,
      { draftId: localId("draft"), now: new Date().toISOString() },
    );
    if (!duplicated.ok) return;
    replaceWorkspace(duplicated.value);
    setViewingRevisionId(null);
    persistDraft(duplicated.value);
  }

  return {
    workspace,
    hydrated,
    saveState,
    status,
    artifactError,
    conflict,
    viewingRevision,
    updateIntent,
    saveRevision,
    confirmArtwork,
    openRevision: (revisionId: string) => setViewingRevisionId(revisionId),
    returnToDraft: () => setViewingRevisionId(null),
    duplicateRevision,
    reloadLatest,
    retryAttempted,
  };
}
