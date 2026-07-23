"use client";

import { useEffect, useState } from "react";
import {
  isProfileWingRevision,
  type LocalDesignRevision,
} from "@/domain/design";
import { verifyArtworkConfiguration } from "@/lib/browser/artifact-store";

export function useRevisionArtworkAvailability(
  revisions: readonly LocalDesignRevision[],
) {
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
        const result = await verifyArtworkConfiguration(artwork);
        if (!result.ok) unavailable.add(revision.revisionId);
      }
      if (!cancelled) setUnavailableRevisionIds(unavailable);
    })();
    return () => {
      cancelled = true;
    };
  }, [revisions]);

  return unavailableRevisionIds;
}
