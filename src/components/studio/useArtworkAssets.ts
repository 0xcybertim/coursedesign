"use client";

import { useEffect, useMemo, useState } from "react";
import type { RenderManifest } from "@/domain/product/types";
import { getArtworkBlob } from "@/lib/browser/artifact-store";
import { getServerRenderableArtwork } from "@/lib/browser/persistence-api";
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";

export type ArtworkUrlMap = Readonly<Record<string, string>>;

// Three.js loads blob-backed textures asynchronously. Keep retired URLs alive for
// one decode window so a render already in flight can finish before revocation.
export const ARTWORK_OBJECT_URL_SETTLE_MS = 1_500;

export function releaseArtworkObjectUrl(url: string) {
  window.setTimeout(
    () => URL.revokeObjectURL(url),
    ARTWORK_OBJECT_URL_SETTLE_MS,
  );
}

export function useArtworkAssets(manifest: RenderManifest) {
  const persistenceMode = usePersistenceMode();
  const builtInUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    for (const slot of Object.values(manifest.artworkSlots)) {
      if (slot.builtInUrl) urls[slot.renderContentHash] = slot.builtInUrl;
    }
    return urls;
  }, [manifest.artworkSlots]);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"ready" | "resolving" | "missing">(
    "resolving",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    const customHashes = [
      ...new Set(
        Object.values(manifest.artworkSlots)
          .filter((slot) => slot.source === "content_addressed")
          .map((slot) => slot.renderContentHash),
      ),
    ];
    if (customHashes.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) {
          setResolvedUrls({});
          setStatus("ready");
          setError(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!cancelled) setStatus("resolving");
    });
    void (async () => {
      const next: Record<string, string> = {};
      for (const hash of customHashes) {
        let url: string;
        if (persistenceMode === "server") {
          const result = await getServerRenderableArtwork(hash);
          if (!result.ok) {
            if (!cancelled) {
              setResolvedUrls({});
              setStatus("missing");
              setError(`${result.error.kind}: ${result.error.message}`);
            }
            for (const objectUrl of objectUrls)
              releaseArtworkObjectUrl(objectUrl);
            return;
          }
          url = result.value.url;
        } else {
          const result = await getArtworkBlob(hash);
          if (!result.ok) {
            if (!cancelled) {
              setResolvedUrls({});
              setStatus("missing");
              setError(`${result.error.kind}: ${result.error.message}`);
            }
            for (const objectUrl of objectUrls)
              releaseArtworkObjectUrl(objectUrl);
            return;
          }
          url = URL.createObjectURL(result.value);
          objectUrls.push(url);
        }
        next[hash] = url;
      }
      if (!cancelled) {
        setResolvedUrls(next);
        setStatus("ready");
        setError(null);
      }
    })();

    return () => {
      cancelled = true;
      for (const url of objectUrls) releaseArtworkObjectUrl(url);
    };
  }, [manifest.artworkSlots, persistenceMode]);

  const urls = useMemo(
    () => ({ ...builtInUrls, ...resolvedUrls }) as ArtworkUrlMap,
    [builtInUrls, resolvedUrls],
  );

  return {
    urls,
    status,
    error,
  };
}
