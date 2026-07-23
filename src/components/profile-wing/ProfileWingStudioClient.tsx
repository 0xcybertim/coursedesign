"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { deriveProfileWingPrototype } from "@/domain/design";
import { silhouetteReviewFixtures } from "@/domain/silhouette";
import { useLocalSilhouetteReview } from "@/components/silhouette/useLocalSilhouetteReview";
import { useLocalDesignLibrary } from "@/components/design/useLocalDesignLibrary";
import { ProfileWingThreeStage } from "./ProfileWingThreeStage";

function shortHash(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export function ProfileWingStudioClient({
  requestedFixtureId,
  forceThreeFailure = false,
}: {
  readonly requestedFixtureId?: string;
  readonly forceThreeFailure?: boolean;
}) {
  const local = useLocalSilhouetteReview();
  const designLibrary = useLocalDesignLibrary();
  const [saveMessage, setSaveMessage] = useState("");
  const { current, review } = local;
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const acceptedFixtureIds = useMemo(
    () =>
      silhouetteReviewFixtures()
        .filter(
          (fixture) =>
            current.get(fixture.fixtureId)?.action ===
            "accepted_for_future_prototyping",
        )
        .map((fixture) => fixture.fixtureId),
    [current],
  );
  const fixtureId =
    (requestedFixtureId && acceptedFixtureIds.includes(requestedFixtureId)
      ? requestedFixtureId
      : acceptedFixtureIds[0]) ?? null;
  const derived = useMemo(
    () =>
      fixtureId
        ? deriveProfileWingPrototype({
            review,
            fixtureId,
          })
        : null,
    [fixtureId, review],
  );

  if (!local.hydrated) {
    return (
      <main className="profile-wing-shell profile-wing-loading">
        <p>Checking browser-local silhouette decisions…</p>
      </main>
    );
  }

  if (!fixtureId || !derived?.ok) {
    return (
      <main className="profile-wing-shell profile-wing-blocked">
        <div className="profile-wing-blocked-card">
          <p className="eyebrow">Phase 1H-C2 blocked honestly</p>
          <h1>No currently accepted silhouette is available.</h1>
          <p>
            The generated prototype requires a current, hash-verified B2
            decision. Historical acceptance is not enough if a later decision
            retained the fixture without conversion.
          </p>
          <Link href="/studio/silhouettes/review">Open silhouette review</Link>
          <small>{local.persistenceStatus}</small>
        </div>
      </main>
    );
  }

  const prototype = derived.value;
  const savedRevisions = designLibrary.revisions.filter(
    (revision) =>
      revision.designId === `local-profile-wing-${prototype.source.fixtureId}`,
  );

  function saveGeneratedRevision() {
    const saved = designLibrary.saveGeneratedProfile(prototype);
    setSaveMessage(
      saved.ok
        ? "Immutable generated-prototype revision saved. Existing course placements were not changed."
        : `${saved.error.kind}: ${saved.error.message}`,
    );
  }

  return (
    <main className="profile-wing-shell">
      <header className="profile-wing-header">
        <div className="working-brand">
          <span>JUMPFORM</span>
          <small>working wordmark</small>
        </div>
        <div className="profile-wing-identity">
          <strong>Profile Wing Vertical · Phase 1H-C2</strong>
          <span>Read-only renderer parity proof</span>
        </div>
        <Link href="/studio/silhouettes/review">Silhouette review</Link>
      </header>

      <section className="profile-wing-hero">
        <div>
          <p className="eyebrow">Generated from an accepted local silhouette</p>
          <h1>One polygon. Two faithful views.</h1>
          <p>
            The 2.5D plate and 3D extrusion consume the same canonical geometry
            hash. Supports and dimensions remain deterministic prototype
            assumptions—not supplier geometry.
          </p>
        </div>
        <aside>
          <span className="prototype-status">Non-sellable prototype</span>
          <strong>{prototype.source.fixtureId}</strong>
          <code title={prototype.renderManifest.geometrySha256}>
            GEO {shortHash(prototype.renderManifest.geometrySha256)}
          </code>
          <small>{local.persistenceStatus}</small>
        </aside>
      </section>

      <section className="profile-wing-preview" aria-label="Renderer parity">
        <ProfileWingThreeStage
          manifest={prototype.renderManifest}
          reducedMotion={reducedMotion}
          forceFailure={forceThreeFailure}
        />
      </section>

      <section className="profile-wing-evidence">
        <div>
          <p className="eyebrow">Source chain</p>
          <h2>Accepted review → deterministic prototype</h2>
          <dl>
            <div>
              <dt>B2 decision</dt>
              <dd title={prototype.source.decisionHash}>
                {shortHash(prototype.source.decisionHash)}
              </dd>
            </div>
            <div>
              <dt>Source polygon</dt>
              <dd title={prototype.source.sourcePolygonSha256}>
                {shortHash(prototype.source.sourcePolygonSha256)}
              </dd>
            </div>
            <div>
              <dt>Shared geometry</dt>
              <dd title={prototype.renderManifest.geometrySha256}>
                {shortHash(prototype.renderManifest.geometrySha256)}
              </dd>
            </div>
            <div>
              <dt>Prototype</dt>
              <dd title={prototype.prototypeSha256}>
                {shortHash(prototype.prototypeSha256)}
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <p className="eyebrow">Fixed inferred envelope</p>
          <h2>
            {prototype.envelopeMm.width.toLocaleString()} ×{" "}
            {prototype.envelopeMm.depth.toLocaleString()} ×{" "}
            {prototype.envelopeMm.height.toLocaleString()} mm
          </h2>
          <ul>
            {prototype.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="profile-wing-revisions"
        aria-labelledby="profile-wing-revisions-title"
      >
        <div>
          <p className="eyebrow">Shared local design library v2</p>
          <h2 id="profile-wing-revisions-title">
            Save this generated prototype immutably.
          </h2>
          <p>
            Saving pins the accepted decision, canonical polygon, renderer
            geometry, inferred footprint, generic counts, and explicit
            non-production provenance. It never changes an older revision or
            repins a course placement.
          </p>
          <button
            type="button"
            onClick={saveGeneratedRevision}
            disabled={!designLibrary.hydrated || !designLibrary.library}
          >
            Save immutable generated revision
          </button>
          <Link
            className="profile-wing-course-link"
            href="/studio/courses/local-course-1"
          >
            Open course studio
          </Link>
          <p
            className="profile-wing-library-status"
            data-testid="profile-wing-library-status"
            aria-live="polite"
          >
            {saveMessage || designLibrary.status}
          </p>
          {designLibrary.integrityError ? (
            <p role="alert">{designLibrary.integrityError}</p>
          ) : null}
        </div>
        <div>
          <span>{savedRevisions.length} saved revisions for this design</span>
          {savedRevisions.length === 0 ? (
            <p>No generated profile revision has been saved yet.</p>
          ) : (
            <ol>
              {savedRevisions.map((revision) => (
                <li key={revision.revisionId}>
                  <strong>
                    Revision {String(revision.ordinal).padStart(2, "0")}
                  </strong>
                  <span>{revision.name}</span>
                  <code title={revision.configurationHash}>
                    {shortHash(revision.configurationHash)}
                  </code>
                  <small>Generated · inferred · not supplier-confirmed</small>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </main>
  );
}
