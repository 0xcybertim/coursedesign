"use client";

import { useEffect, useState } from "react";
import {
  isProfileWingRevision,
  type LocalDesignRevision,
} from "@/domain/design";
import { verifyArtworkConfiguration } from "@/lib/browser/artifact-store";
import { getServerRenderableArtwork } from "@/lib/browser/persistence-api";
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";
import { referencedRenderableArtworkHashes } from "@/domain/artwork";

export function useRevisionArtworkAvailability(
  revisions: readonly LocalDesignRevision[],
) {
  const persistenceMode = usePersistenceMode();
  const [unavailableRevisionIds, setUnavailableRevisionIds] = useState<
    ReadonlySet<string>
  >(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const unavailable = new Set<string>();
      for (const revision of revisions) {
        if (isProfileWingRevision(revision)) continue;
        const artwork = revision.snapshot.configuration.artworkConfiguration;
        if (!artwork) continue;
        if (persistenceMode === "server") {
          const results = await Promise.all(
            referencedRenderableArtworkHashes(artwork).map((hash) =>
              getServerRenderableArtwork(hash),
            ),
          );
          if (results.some((result) => !result.ok)) {
            unavailable.add(revision.revisionId);
          }
        } else {
          const result = await verifyArtworkConfiguration(artwork);
          if (!result.ok) unavailable.add(revision.revisionId);
        }
      }
      if (!cancelled) setUnavailableRevisionIds(unavailable);
    })();
    return () => {
      cancelled = true;
    };
  }, [persistenceMode, revisions]);

  return unavailableRevisionIds;
}
