"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  SILHOUETTE_REVIEW_EVIDENCE_SHA256,
  silhouetteReviewFixtures,
  type SilhouetteDecisionAction,
  type SilhouetteReviewFixture,
} from "@/domain/silhouette";
import { useLocalSilhouetteReview } from "./useLocalSilhouetteReview";

type ReviewFilter = "all" | "convertible" | "must_retain" | "decided";

const CATEGORY_LABELS: Record<SilhouetteReviewFixture["category"], string> = {
  clean: "Clean",
  empty: "Empty",
  multi_subject: "Multi-subject",
  badly_occluded: "Badly occluded",
};

function shortHash(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function actionLabel(action: SilhouetteDecisionAction) {
  return action === "accepted_for_future_prototyping"
    ? "Accepted for future prototyping"
    : "Retained without conversion";
}

export function SilhouetteReviewClient() {
  const fixtures = useMemo(() => silhouetteReviewFixtures(), []);
  const local = useLocalSilhouetteReview();
  const [selectedId, setSelectedId] = useState(fixtures[0]!.fixtureId);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [status, setStatus] = useState("");
  const selected =
    fixtures.find((fixture) => fixture.fixtureId === selectedId) ??
    fixtures[0]!;
  const selectedDecision = local.current.get(selected.fixtureId) ?? null;
  const selectedHistory = local.review.decisions.filter(
    (decision) => decision.fixtureId === selected.fixtureId,
  );
  const convertible = fixtures.filter(
    (fixture) => fixture.result.status === "accepted",
  ).length;
  const filtered = fixtures.filter((fixture) => {
    if (filter === "convertible") return fixture.result.status === "accepted";
    if (filter === "must_retain") return fixture.result.status === "rejected";
    if (filter === "decided") return local.current.has(fixture.fixtureId);
    return true;
  });
  const cleanup =
    selected.result.status === "accepted"
      ? selected.result.silhouette.cleanup
      : selected.result.cleanup;

  function decide(action: SilhouetteDecisionAction) {
    const result = local.decide(selected.fixtureId, action);
    if (!result.ok) {
      setStatus(`${result.error.kind}: ${result.error.message}`);
      return;
    }
    setStatus(
      `${actionLabel(action)}. This records a review decision only; no product geometry or revision was created.`,
    );
  }

  return (
    <main className="silhouette-review-shell">
      <header className="silhouette-review-header">
        <strong className="lab-context-label">Developer Lab</strong>
        <div className="silhouette-review-identity">
          <strong>Silhouette review · Phase 1H-B2</strong>
          <span>Browser-local decisions · immutable B1 evidence</span>
        </div>
        <div className="silhouette-review-header-actions">
          <Link href="/lab/profile-wing-renderer">Renderer proof</Link>
          <Link href="/lab">Lab index</Link>
        </div>
      </header>

      <section
        className="silhouette-review-hero"
        aria-labelledby="review-title"
      >
        <div>
          <p className="eyebrow">Human gate before product geometry</p>
          <h1 id="review-title">Review the silhouette, not an obstacle.</h1>
          <p>
            Compare each approved local mask with its canonical polygon or typed
            rejection. A decision here only marks evidence for possible future
            prototyping. It does not create wings, poles, a product revision,
            course quantities, a quote, or supplier approval.
          </p>
        </div>
        <aside className="silhouette-boundary-card">
          <span className="prototype-status">Non-authoritative evidence</span>
          <strong>Zero provider calls</strong>
          <p>
            29 repository fixtures · {convertible} convertible ·{" "}
            {fixtures.length - convertible} must remain unconverted.
          </p>
          <code title={SILHOUETTE_REVIEW_EVIDENCE_SHA256}>
            EVIDENCE {shortHash(SILHOUETTE_REVIEW_EVIDENCE_SHA256)}
          </code>
        </aside>
      </section>

      {local.integrityError ? (
        <div className="silhouette-integrity-alert" role="alert">
          <strong>Untrusted browser-local review was rejected.</strong>
          <span>{local.integrityError}</span>
        </div>
      ) : null}

      <section className="silhouette-progress" aria-label="Review progress">
        <div>
          <strong>{local.current.size}</strong>
          <span>of 29 decided</span>
        </div>
        <div>
          <strong>
            {
              [...local.current.values()].filter(
                (item) => item.action === "accepted_for_future_prototyping",
              ).length
            }
          </strong>
          <span>accepted for future prototyping</span>
        </div>
        <div>
          <strong>
            {
              [...local.current.values()].filter(
                (item) => item.action === "retained_without_conversion",
              ).length
            }
          </strong>
          <span>retained without conversion</span>
        </div>
        <p data-testid="silhouette-persistence-status">
          {local.hydrated ? local.persistenceStatus : "Hydrating review…"}
        </p>
      </section>

      <p
        className={`silhouette-decision-status${status ? " is-visible" : ""}`}
        role="status"
        aria-live="polite"
        tabIndex={-1}
      >
        {status}
      </p>

      <div className="silhouette-review-workspace">
        <aside
          className="silhouette-fixture-browser"
          aria-label="Fixture browser"
        >
          <div className="silhouette-filter-row" aria-label="Filter fixtures">
            {(
              [
                ["all", "All 29"],
                ["convertible", "Convertible 18"],
                ["must_retain", "Must retain 11"],
                ["decided", `Decided ${local.current.size}`],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="silhouette-fixture-list">
            {filtered.length === 0 ? (
              <p>No fixtures match this filter.</p>
            ) : null}
            {filtered.map((fixture) => {
              const decision = local.current.get(fixture.fixtureId);
              return (
                <button
                  type="button"
                  key={fixture.fixtureId}
                  className="silhouette-fixture-row"
                  aria-pressed={fixture.fixtureId === selected.fixtureId}
                  onClick={() => {
                    setSelectedId(fixture.fixtureId);
                    setStatus("");
                  }}
                >
                  {/* Repository-generated benchmark mask from a fixed allowlist. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/phase-1h/masks/${fixture.fixtureId}`}
                    alt=""
                    width="52"
                    height="52"
                  />
                  <span>
                    <strong>{fixture.fixtureId}</strong>
                    <small>{CATEGORY_LABELS[fixture.category]}</small>
                  </span>
                  <i data-status={fixture.result.status}>
                    {decision
                      ? decision.action === "accepted_for_future_prototyping"
                        ? "Accepted"
                        : "Retained"
                      : fixture.result.status === "accepted"
                        ? "Review"
                        : "Rejected"}
                  </i>
                </button>
              );
            })}
          </div>
        </aside>

        <article className="silhouette-inspector" aria-live="polite">
          <header className="silhouette-inspector-heading">
            <div>
              <p className="eyebrow">
                {CATEGORY_LABELS[selected.category]} fixture
              </p>
              <h2>{selected.fixtureId}</h2>
            </div>
            <span data-status={selected.result.status}>
              {selected.result.status === "accepted"
                ? "B1 polygon valid"
                : "B1 conversion rejected"}
            </span>
          </header>

          <div
            className="silhouette-compare"
            aria-label="Mask and vector comparison"
          >
            <figure>
              <div className="silhouette-source-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/phase-1h/masks/${selected.fixtureId}`}
                  alt={`Approved local source mask for ${selected.fixtureId}`}
                />
              </div>
              <figcaption>Approved local mask</figcaption>
            </figure>
            <figure>
              <div className="silhouette-vector-frame">
                {selected.result.status === "accepted" ? (
                  <svg
                    viewBox="0 0 10000 10000"
                    role="img"
                    aria-label={`Canonical ${selected.fixtureId} polygon with ${selected.result.silhouette.points.length} vertices`}
                  >
                    <polygon
                      points={selected.result.silhouette.points
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                    />
                  </svg>
                ) : (
                  <div
                    className="silhouette-rejection-mark"
                    aria-label="No polygon returned"
                  >
                    <strong>×</strong>
                    <span>No partial geometry</span>
                  </div>
                )}
              </div>
              <figcaption>
                {selected.result.status === "accepted"
                  ? "Canonical B1 polygon"
                  : "Explicit rejection"}
              </figcaption>
            </figure>
          </div>

          {selected.result.status === "rejected" ? (
            <section
              className="silhouette-findings"
              aria-labelledby="findings-title"
            >
              <p className="eyebrow">Typed findings</p>
              <h3 id="findings-title">Why conversion stopped</h3>
              <ul>
                {selected.result.findings.map((finding) => (
                  <li key={finding.code}>
                    <code>{finding.code}</code>
                    <span>{finding.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            className="silhouette-evidence-grid"
            aria-label="Deterministic evidence"
          >
            <div>
              <span>Source mask SHA-256</span>
              <code title={selected.sourceMaskSha256}>
                {shortHash(selected.sourceMaskSha256)}
              </code>
            </div>
            <div>
              <span>Result identity SHA-256</span>
              <code title={selected.resultIdentitySha256}>
                {shortHash(selected.resultIdentitySha256)}
              </code>
            </div>
            <div>
              <span>Vectorizer / validator</span>
              <code>
                {selected.result.status === "accepted"
                  ? `${selected.result.silhouette.vectorizerVersion} / ${selected.result.silhouette.validatorVersion}`
                  : "1.0.0-phase1h-b1 / 1.0.0-phase1h-b1"}
              </code>
            </div>
            <div>
              <span>Cleanup</span>
              <code>
                {cleanup.significantComponentCount} subject ·{" "}
                {cleanup.enclosedHoleCount} holes · {cleanup.removedIslandCount}{" "}
                islands removed
              </code>
            </div>
          </section>

          <section
            className="silhouette-decision-panel"
            aria-labelledby="decision-title"
          >
            <div>
              <p className="eyebrow">Explicit human decision</p>
              <h3 id="decision-title">Choose what this evidence permits.</h3>
              <p>
                A new choice appends an immutable decision event. It never
                changes the mask or polygon and never creates product geometry.
              </p>
            </div>
            {selectedDecision ? (
              <p className="silhouette-current-decision">
                Current: <strong>{actionLabel(selectedDecision.action)}</strong>
              </p>
            ) : null}
            <div className="silhouette-decision-actions">
              <button
                type="button"
                onClick={() => decide("accepted_for_future_prototyping")}
                disabled={selected.result.status !== "accepted"}
                title={
                  selected.result.status !== "accepted"
                    ? "Rejected B1 evidence cannot be accepted."
                    : undefined
                }
              >
                {selected.result.status === "accepted"
                  ? "Accept for future prototyping"
                  : "Cannot accept rejected result"}
              </button>
              <button
                type="button"
                onClick={() => decide("retained_without_conversion")}
              >
                Retain without conversion
              </button>
            </div>
            {selectedHistory.length > 0 ? (
              <details className="silhouette-decision-history">
                <summary>Decision history · {selectedHistory.length}</summary>
                <ol>
                  {[...selectedHistory].reverse().map((decision) => (
                    <li key={decision.decisionId}>
                      <strong>{actionLabel(decision.action)}</strong>
                      <time dateTime={decision.createdAt}>
                        {new Date(decision.createdAt).toLocaleString("en-GB")}
                      </time>
                      <code title={decision.decisionHash}>
                        {shortHash(decision.decisionHash)}
                      </code>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </section>
        </article>
      </div>

      <section
        className="silhouette-exclusions"
        aria-labelledby="exclusions-title"
      >
        <p className="eyebrow">Hard boundary</p>
        <h2 id="exclusions-title">Still not a product specification.</h2>
        <p>
          These decisions are local review metadata only. They provide no
          supplier dimensions, materials, connections, structural validation,
          fabrication approval, safety certification, price, or orderability.
        </p>
      </section>
    </main>
  );
}
