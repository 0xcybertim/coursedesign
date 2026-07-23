"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { ProfileWingRenderManifest } from "@/domain/design";
import { ProfileWingTwoD } from "./ProfileWingTwoD";

const ProfileWingThreeScene = dynamic(() => import("./ProfileWingThreeScene"), {
  ssr: false,
});

type Capability = "waiting" | "loading" | "ready" | "failed";

export function ProfileWingThreeStage({
  manifest,
  reducedMotion,
  forceFailure,
}: {
  readonly manifest: ProfileWingRenderManifest;
  readonly reducedMotion: boolean;
  readonly forceFailure: boolean;
}) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [capability, setCapability] = useState<Capability>("waiting");
  const [activeView, setActiveView] = useState<"2.5d" | "3d">("2.5d");
  const [status, setStatus] = useState(
    "Exact 2.5D ready · checking 3D capability",
  );

  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        setCapability("loading");
        setStatus("Exact 2.5D ready · loading shared-geometry 3D");
        setShouldLoad(true);
      },
      reducedMotion ? 0 : 350,
    );
    return () => window.clearTimeout(timeout);
  }, [reducedMotion]);

  const handleReady = useCallback(() => {
    setCapability("ready");
    setStatus("Exact 2.5D ready · matching 3D extrusion ready");
  }, []);
  const handleFailure = useCallback((message: string) => {
    setCapability("failed");
    setActiveView("2.5d");
    setStatus(message);
  }, []);

  return (
    <div
      className="profile-wing-visual-stage"
      data-geometry-sha256={manifest.geometrySha256}
      data-parity={
        manifest.projectionParity.exactSharedGeometry ? "exact" : "invalid"
      }
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <div
        className={`profile-wing-view-layer ${activeView === "2.5d" ? "is-active" : ""}`}
        aria-hidden={activeView !== "2.5d"}
      >
        <ProfileWingTwoD manifest={manifest} />
      </div>
      {shouldLoad ? (
        <div
          className={`profile-wing-view-layer profile-wing-three-layer ${
            activeView === "3d" && capability === "ready" ? "is-active" : ""
          }`}
          aria-hidden={activeView !== "3d"}
        >
          <ProfileWingThreeScene
            manifest={manifest}
            reducedMotion={reducedMotion}
            forceFailure={forceFailure}
            onReady={handleReady}
            onFailure={handleFailure}
          />
        </div>
      ) : null}
      <div className="profile-wing-view-controls" aria-label="Product view">
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
        className={`profile-wing-capability capability-${capability}`}
        data-testid="profile-wing-capability"
        aria-live="polite"
      >
        <span aria-hidden="true" /> {status}
      </p>
    </div>
  );
}
