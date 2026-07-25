"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deriveWorkspaceSummary,
  type WorkspaceSources,
  type WorkspaceSummary,
} from "@/domain/workspace";
import { readLocalWorkspaceSources } from "@/lib/browser/read-local-workspace";

interface LocalWorkspaceSummaryState {
  readonly hydrated: boolean;
  readonly sources: WorkspaceSources | null;
  readonly summary: WorkspaceSummary | null;
}

const INITIAL: LocalWorkspaceSummaryState = {
  hydrated: false,
  sources: null,
  summary: null,
};

export function useLocalWorkspaceSummary(enabled = true) {
  const [state, setState] = useState<LocalWorkspaceSummaryState>(INITIAL);

  const refresh = useCallback(() => {
    if (!enabled) return;
    const sources = readLocalWorkspaceSources(window.localStorage);
    setState({
      hydrated: true,
      sources,
      summary: deriveWorkspaceSummary(sources),
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) refresh();
    });
    const handleStorage = () => refresh();
    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
    };
  }, [enabled, refresh]);

  return { ...state, refresh };
}
