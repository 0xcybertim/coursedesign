"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RenderManifest } from "@/domain/product/types";
import { ObstacleTwoD } from "./ObstacleTwoD";
import { useArtworkAssets, type ArtworkUrlMap } from "./useArtworkAssets";

const ThreeScene = dynamic(() => import("./ThreeScene"), { ssr: false });

type Capability = "waiting" | "loading" | "ready" | "failed";

interface ThreeStageProps {
  manifest: RenderManifest;
  reducedMotion: boolean;
  forceFailure: boolean;
  artworkUrlOverrides?: ArtworkUrlMap;
}

export function ThreeStage({
  manifest,
  reducedMotion,
  forceFailure,
  artworkUrlOverrides,
}: ThreeStageProps) {
  const artworkAssets = useArtworkAssets(manifest);
  const artworkUrls = useMemo(
    () => ({ ...artworkAssets.urls, ...(artworkUrlOverrides ?? {}) }),
    [artworkAssets.urls, artworkUrlOverrides],
  );
  const hasEveryArtworkUrl = Object.values(manifest.artworkSlots).every(
    (slot) => Boolean(artworkUrls[slot.renderContentHash]),
  );
  const [shouldLoad, setShouldLoad] = useState(false);
  const [capability, setCapability] = useState<Capability>("waiting");
  const [activeView, setActiveView] = useState<"2.5d" | "3d">("2.5d");
  const [statusMessage, setStatusMessage] = useState(
    "2.5D ready · checking 3D capability",
  );

  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        setCapability("loading");
        setStatusMessage("2.5D ready · loading interactive 3D");
        setShouldLoad(true);
      },
      reducedMotion ? 0 : 450,
    );
    return () => window.clearTimeout(timeout);
  }, [reducedMotion]);

  const handleReady = useCallback(() => {
    setCapability("ready");
    setStatusMessage("2.5D ready · interactive 3D ready");
  }, []);

  const handleFailure = useCallback((message: string) => {
    setCapability("failed");
    setActiveView("2.5d");
    setStatusMessage(message);
  }, []);

  return (
    <div
      className="visual-stage"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-left-artifact-hash={manifest.artworkSlots.left.renderContentHash}
      data-right-artifact-hash={manifest.artworkSlots.right.renderContentHash}
      data-left-artwork-placement={JSON.stringify(
        manifest.artworkSlots.left.placement,
      )}
      data-right-artwork-placement={JSON.stringify(
        manifest.artworkSlots.right.placement,
      )}
    >
      <div
        className={`view-layer ${activeView === "2.5d" ? "is-active" : ""}`}
        aria-hidden={activeView !== "2.5d"}
      >
        <ObstacleTwoD manifest={manifest} artworkUrls={artworkUrls} />
      </div>
      {shouldLoad ? (
        <div
          className={`view-layer three-layer ${activeView === "3d" && capability === "ready" ? "is-active" : ""}`}
          aria-hidden={activeView !== "3d"}
        >
          <ThreeScene
            manifest={manifest}
            reducedMotion={reducedMotion}
            forceFailure={forceFailure}
            artworkUrls={artworkUrls}
            onReady={handleReady}
            onFailure={handleFailure}
          />
        </div>
      ) : null}

      <div className="view-controls" aria-label="Product view">
        <button
          type="button"
          className={activeView === "2.5d" ? "is-selected" : ""}
          onClick={() => setActiveView("2.5d")}
        >
          2.5D
        </button>
        <button
          type="button"
          className={activeView === "3d" ? "is-selected" : ""}
          disabled={capability !== "ready"}
          onClick={() => setActiveView("3d")}
        >
          3D
        </button>
      </div>
      <p
        className={`capability-status capability-${capability}`}
        aria-live="polite"
        data-testid="capability-status"
      >
        <span aria-hidden="true" /> {statusMessage}
      </p>
      {!hasEveryArtworkUrl ? (
        <p className="artwork-availability-error" role="alert">
          {artworkAssets.error ??
            "The exact artwork is unavailable on this device. No filename or current-draft fallback was used."}
        </p>
      ) : null}
    </div>
  );
}
