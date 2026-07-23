"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createLocalDesignWorkspace,
  createLocalDesignLibrary,
  duplicateLocalRevision,
  findLocalRevision,
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  LOCAL_WORKSPACE_STORAGE_KEY,
  migrateLocalDesignLibrary,
  saveLocalRevision,
  serializeLocalDesignLibrary,
  updateLocalDraft,
  type LocalDesignLibrary,
  type LocalDesignWorkspace,
  type ObstacleDesignRevision,
  type ObstacleIntent,
} from "@/domain/design";
import { type ArtworkConfiguration } from "@/domain/artwork";
import { verifyArtworkConfiguration } from "@/lib/browser/artifact-store";

type LocalSaveState =
  | "checking"
  | "restored"
  | "saved"
  | "revision_saved"
  | "duplicated"
  | "recovered"
  | "unavailable";

const INITIAL_WORKSPACE = createLocalDesignWorkspace({
  draftId: "draft-awaiting-local-restore",
  now: "1970-01-01T00:00:00.000Z",
});
const INITIAL_LIBRARY = createLocalDesignLibrary({
  draftId: "draft-awaiting-local-restore",
  now: "1970-01-01T00:00:00.000Z",
});

function localId(prefix: "draft" | "revision"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now(): string {
  return new Date().toISOString();
}

function statusLabel(state: LocalSaveState, revisionOrdinal?: number): string {
  switch (state) {
    case "checking":
      return "Checking this-device draft…";
    case "restored":
      return "Draft restored on this device";
    case "revision_saved":
      return `Revision ${String(revisionOrdinal ?? 0).padStart(2, "0")} saved on this device`;
    case "duplicated":
      return "Revision duplicated into a new local draft";
    case "recovered":
      return "Stored draft was invalid · fresh local draft started";
    case "unavailable":
      return "Browser storage unavailable · changes last for this tab only";
    default:
      return "Draft saved on this device";
  }
}

export function useLocalDesignWorkspace() {
  const [workspace, setWorkspace] =
    useState<LocalDesignWorkspace>(INITIAL_WORKSPACE);
  const [library, setLibrary] = useState<LocalDesignLibrary>(INITIAL_LIBRARY);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<LocalSaveState>("checking");
  const [status, setStatus] = useState(statusLabel("checking"));
  const [viewingRevisionId, setViewingRevisionId] = useState<string | null>(
    null,
  );
  const [artifactError, setArtifactError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      let nextWorkspace: LocalDesignWorkspace;
      let nextState: LocalSaveState;

      try {
        const migrated = migrateLocalDesignLibrary({
          librarySerialized: window.localStorage.getItem(
            LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
          ),
          legacyWorkspaceSerialized: window.localStorage.getItem(
            LOCAL_WORKSPACE_STORAGE_KEY,
          ),
          now: now(),
          draftId: localId("draft"),
        });
        let nextLibrary: LocalDesignLibrary;
        if (migrated.ok) {
          nextLibrary = migrated.value.library;
          nextWorkspace = nextLibrary.spj04Workspace;
          nextState = migrated.value.source === "fresh" ? "saved" : "restored";
        } else {
          nextLibrary = createLocalDesignLibrary({
            draftId: localId("draft"),
            now: now(),
          });
          nextWorkspace = nextLibrary.spj04Workspace;
          nextState = "recovered";
        }
        setLibrary(nextLibrary);
        window.localStorage.setItem(
          LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
          serializeLocalDesignLibrary(nextLibrary),
        );
      } catch {
        const nextLibrary = createLocalDesignLibrary({
          draftId: localId("draft"),
          now: now(),
        });
        setLibrary(nextLibrary);
        nextWorkspace = nextLibrary.spj04Workspace;
        nextState = "unavailable";
      }

      setWorkspace(nextWorkspace);
      setSaveState(nextState);
      setStatus(statusLabel(nextState));
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const viewingRevision = useMemo<ObstacleDesignRevision | null>(() => {
    if (viewingRevisionId === null) return null;
    const found = findLocalRevision(workspace, viewingRevisionId);
    return found.ok ? found.value : null;
  }, [viewingRevisionId, workspace]);

  function commit(
    nextWorkspace: LocalDesignWorkspace,
    nextState: LocalSaveState,
    revisionOrdinal?: number,
  ) {
    setWorkspace(nextWorkspace);
    const nextLibrary = { ...library, spj04Workspace: nextWorkspace };
    setLibrary(nextLibrary);
    try {
      window.localStorage.setItem(
        LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
        serializeLocalDesignLibrary(nextLibrary),
      );
      setSaveState(nextState);
      setStatus(statusLabel(nextState, revisionOrdinal));
    } catch {
      setSaveState("unavailable");
      setStatus(statusLabel("unavailable"));
    }
  }

  function updateIntent(intent: ObstacleIntent) {
    if (!hydrated || viewingRevision !== null) return;
    const updated = updateLocalDraft(workspace, intent, now());
    if (updated.ok) {
      setArtifactError(null);
      commit(updated.value, "saved");
    }
  }

  async function saveRevision() {
    if (!hydrated || viewingRevision !== null) return;
    let verifiedArtifactHashes: ReadonlySet<string> | undefined;
    const artworkConfiguration = workspace.draft.intent.artworkConfiguration;
    if (artworkConfiguration) {
      const verified = await verifyArtworkConfiguration(artworkConfiguration);
      if (!verified.ok) {
        setArtifactError(`${verified.error.kind}: ${verified.error.message}`);
        return;
      }
      verifiedArtifactHashes = new Set(verified.value);
    }
    const saved = saveLocalRevision(workspace, {
      revisionId: localId("revision"),
      now: now(),
      verifiedArtifactHashes,
    });
    if (!saved.ok) {
      setArtifactError(`${saved.error.kind}: ${saved.error.message}`);
      return;
    }
    setArtifactError(null);
    commit(saved.value, "revision_saved", saved.value.revisions.length);
  }

  function confirmArtwork(configuration: ArtworkConfiguration | null) {
    updateIntent({
      ...workspace.draft.intent,
      artwork: configuration ? "custom_artwork" : "fixed_panel_artwork",
      ...(configuration ? { artworkConfiguration: configuration } : {}),
    });
  }

  function openRevision(revisionId: string) {
    const found = findLocalRevision(workspace, revisionId);
    if (found.ok) setViewingRevisionId(revisionId);
  }

  function returnToDraft() {
    setViewingRevisionId(null);
  }

  function duplicateRevision() {
    if (viewingRevision === null) return;
    const duplicated = duplicateLocalRevision(
      workspace,
      viewingRevision.revisionId,
      { draftId: localId("draft"), now: now() },
    );
    if (!duplicated.ok) return;
    commit(duplicated.value, "duplicated");
    setViewingRevisionId(null);
  }

  return {
    workspace,
    hydrated,
    saveState,
    status,
    artifactError,
    viewingRevision,
    updateIntent,
    saveRevision,
    confirmArtwork,
    openRevision,
    returnToDraft,
    duplicateRevision,
  };
}
