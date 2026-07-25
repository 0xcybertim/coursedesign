"use client";

import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";

import { useLocalDesignWorkspace } from "./useLocalDesignWorkspace";
import { useServerDesignWorkspace } from "./useServerDesignWorkspace";

export function useDesignWorkspace(requestedRevisionId?: string) {
  const mode = usePersistenceMode();
  const browser = useLocalDesignWorkspace(
    mode === "browser" ? requestedRevisionId : undefined,
    mode === "browser",
  );
  const server = useServerDesignWorkspace(
    mode === "server" ? requestedRevisionId : undefined,
    mode === "server",
  );
  return mode === "server" ? server : browser;
}
