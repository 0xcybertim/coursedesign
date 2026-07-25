"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CourseQuantitySummary,
  CourseRevisionUpdateOperation,
  CourseRevisionUpdatePreview,
} from "@/domain/course";
import type { FrameColor, LowerElement } from "@/domain/product/types";
import { useLocalCourseReview } from "./useLocalCourseReview";

const FRAME_HEX: Record<FrameColor, string> = {
  white: "#f2f1ec",
  blue: "#0d43c7",
  red: "#ff5547",
  yellow: "#e8d51b",
};

const QUANTITY_LABELS = {
  obstacleInstances: "Obstacle instances",
  printedWingAssemblies: "Wing assemblies / silhouette plates",
  poles: "Poles",
  cupsOrReleaseAdapters: "Cups / release adapters",
  trackAssemblies: "Track assemblies",
  footOrBallastAssemblies: "Foot / ballast assemblies",
  flags: "Flags",
  poleEndCaps: "Pole end caps",
} as const;

const LOWER_LABELS: Record<Exclude<LowerElement, "none">, string> = {
  decorative_panel: "Decorative panels",
  gate: "Gates",
  filler: "Fillers",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatDelta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function quantityValue(
  quantities: CourseQuantitySummary,
  key: keyof typeof QUANTITY_LABELS,
) {
  return quantities[key];
}

export function CourseReviewClient() {
  const {
    review,
    sourceStatus,
    unavailableArtworkRevisionIds,
    hydrated,
    buildUpdatePreview,
    confirmUpdatePreview,
  } = useLocalCourseReview();
  const [copyStatus, setCopyStatus] = useState("Copy JSON");
  const [updatePreview, setUpdatePreview] =
    useState<CourseRevisionUpdatePreview | null>(null);
  const [updateFailure, setUpdateFailure] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const updateStatusRef = useRef<HTMLParagraphElement>(null);
  const updateDialogRef = useRef<HTMLDialogElement>(null);
  const cancelUpdateRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const json = useMemo(() => JSON.stringify(review, null, 2), [review]);

  useEffect(() => {
    const dialog = updateDialogRef.current;
    if (!updatePreview || !dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    cancelUpdateRef.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, [updatePreview]);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus("JSON copied");
    } catch {
      setCopyStatus("Copy unavailable");
    }
  }

  function openUpdatePreview(operation: CourseRevisionUpdateOperation) {
    previewTriggerRef.current = document.activeElement as HTMLElement | null;
    const result = buildUpdatePreview(operation);
    if (!result.ok) {
      setUpdateStatus(`Update preview unavailable. ${result.error.message}`);
      return;
    }
    setUpdateFailure("");
    setUpdateStatus("");
    setUpdatePreview(result.value);
  }

  function cancelUpdatePreview() {
    setUpdatePreview(null);
    setUpdateFailure("");
    setUpdateStatus(
      "Update preview cancelled. Browser-local course and review unchanged.",
    );
    queueMicrotask(() => previewTriggerRef.current?.focus());
  }

  async function confirmUpdate() {
    if (!updatePreview) return;
    const result = await confirmUpdatePreview(updatePreview);
    if (!result.ok) {
      setUpdateFailure(`${result.error.kind}: ${result.error.message}`);
      return;
    }
    const numbers = updatePreview.affectedDisplayNumbers
      .map((number) => String(number).padStart(2, "0"))
      .join(", ");
    setUpdatePreview(null);
    setUpdateFailure("");
    setUpdateStatus(
      `Course updated successfully. Obstacle ${numbers} now use${updatePreview.instanceCount === 1 ? "s" : ""} Revision ${String(updatePreview.destinationRevision.ordinal).padStart(2, "0")}. Review hash ${result.value.review.reviewHash}.`,
    );
    queueMicrotask(() => updateStatusRef.current?.focus());
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelUpdatePreview();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      updateDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <main className="review-sheet-shell">
      <header className="review-header review-navigation">
        <div className="review-header-identity">
          <strong>Course Review</strong>
          <span>Local Course 01 · exact pinned revisions</span>
        </div>
        <Link href="/courses/local-course-1">Return to editable course</Link>
      </header>

      <section className="review-intro" aria-labelledby="review-title">
        <div>
          <p className="eyebrow">Browser-local inspection artifact</p>
          <h1 id="review-title">Course Review</h1>
          <p>
            Exact pinned revisions, arena placements, planning warnings, and
            prototype equipment quantities for Local course 01.
          </p>
        </div>
        <div className="review-status-panel">
          <span className="prototype-status">Non-sellable prototype</span>
          <strong data-testid="review-source-status">{sourceStatus}</strong>
          <span
            className={`review-completeness review-completeness-${review.completeness}`}
            data-testid="review-completeness"
          >
            {review.completeness === "complete"
              ? "Complete local review"
              : "Incomplete · unsuitable for production"}
          </span>
          {unavailableArtworkRevisionIds.size > 0 ? (
            <span className="review-artwork-availability" role="status">
              {unavailableArtworkRevisionIds.size} pinned revision
              {unavailableArtworkRevisionIds.size === 1 ? "" : "s"} missing
              exact local artwork. Review hash, pinned IDs, geometry, and
              quantities are unchanged.
            </span>
          ) : null}
        </div>
      </section>

      <section className="review-hash-strip" aria-label="Course review hash">
        <div>
          <p className="eyebrow">Stable course-review hash · SHA-256</p>
          <code data-testid="review-hash">{review.reviewHash}</code>
        </div>
        <dl>
          <div>
            <dt>Course draft</dt>
            <dd>Version {review.courseDraftVersion}</dd>
          </div>
          <div>
            <dt>Arena contract</dt>
            <dd>60,000 × 40,000 mm</dd>
          </div>
          <div>
            <dt>Placements</dt>
            <dd>{review.placements.length}</dd>
          </div>
        </dl>
      </section>

      <p
        className={`revision-update-status review-navigation${updateStatus ? " is-visible" : ""}`}
        role="status"
        aria-live="polite"
        ref={updateStatusRef}
        tabIndex={-1}
      >
        {updateStatus}
      </p>

      <div className="review-body">
        <section
          className="review-arena-section"
          aria-labelledby="review-arena-title"
        >
          <div className="review-section-heading">
            <div>
              <p className="eyebrow">01 · Arena overview</p>
              <h2 id="review-arena-title">Top-down placement plan</h2>
            </div>
            <span>Read-only · coordinates from upper-left</span>
          </div>
          <div
            className="review-arena"
            role="img"
            aria-label={`Read-only top-down arena overview, 60 by 40 metres, ${review.placements.length} numbered placements`}
          >
            {review.placements.length === 0 ? (
              <div className="review-arena-empty">
                No placements in this browser-local course.
              </div>
            ) : null}
            {review.placements.map((placement) => {
              const frameColor =
                placement.pinnedRevision?.provenance === "generated"
                  ? "#e8d51b"
                  : FRAME_HEX[
                      placement.pinnedProductionSpec &&
                      "supplierConfirmed" in
                        placement.pinnedProductionSpec.machineReadable
                        ? placement.pinnedProductionSpec.machineReadable
                            .prototypeAssumptions.configuration.frameColor
                        : "white"
                    ];
              return (
                <span
                  className={`review-arena-placement${placement.pinnedRevision ? "" : " is-missing"}`}
                  key={placement.instanceId}
                  style={{
                    left: `${(placement.xMm / review.arena.width) * 100}%`,
                    top: `${(placement.yMm / review.arena.height) * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${placement.rotationDeg}deg)`,
                    background: frameColor,
                  }}
                  aria-label={`Obstacle ${placement.displayNumber}, ${formatNumber(placement.xMm)} by ${formatNumber(placement.yMm)} millimetres, ${placement.rotationDeg} degrees, pinned revision ${placement.obstacleDesignRevisionId}`}
                >
                  <b>{placement.displayNumber}</b>
                </span>
              );
            })}
          </div>
          <div className="review-arena-scale" aria-hidden="true">
            <span>0 m</span>
            <span>60 m</span>
          </div>
        </section>

        <section
          className="review-register-section"
          aria-labelledby="placement-register-title"
        >
          <div className="review-section-heading">
            <div>
              <p className="eyebrow">02 · Placement register</p>
              <h2 id="placement-register-title">Pinned revision evidence</h2>
            </div>
            <span>Sorted by display number</span>
          </div>
          <ol
            className="placement-register"
            aria-label="Course placement register sorted by display number"
            data-testid="placement-register"
          >
            {review.placements.map((placement) => (
              <li key={placement.instanceId}>
                <div className="placement-register-number">
                  {String(placement.displayNumber).padStart(2, "0")}
                </div>
                <dl>
                  <div>
                    <dt>Position</dt>
                    <dd>
                      X {formatNumber(placement.xMm)} mm · Y{" "}
                      {formatNumber(placement.yMm)} mm
                    </dd>
                  </div>
                  <div>
                    <dt>Rotation</dt>
                    <dd>{placement.rotationDeg}°</dd>
                  </div>
                  <div>
                    <dt>Pinned revision</dt>
                    <dd>
                      {placement.pinnedRevision
                        ? `${placement.pinnedRevision.name} · Revision ${String(placement.pinnedRevision.ordinal).padStart(2, "0")}`
                        : "Unavailable on this device"}
                    </dd>
                  </div>
                  <div>
                    <dt>Revision ID</dt>
                    <dd>
                      <code>{placement.obstacleDesignRevisionId}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Configuration hash</dt>
                    <dd>
                      <code>
                        {placement.pinnedRevision?.configurationHash ??
                          "Unavailable"}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>Product evidence</dt>
                    <dd>
                      {placement.pinnedRevision
                        ? `${placement.pinnedRevision.provenance} · ${placement.pinnedRevision.evidenceStatus.replaceAll("_", " ")}`
                        : "Unavailable"}
                    </dd>
                  </div>
                </dl>
                {placement.newerRevisionAvailable ? (
                  <div className="newer-revision-panel">
                    <p className="newer-revision-status">
                      Newer revision available · Revision{" "}
                      {String(
                        placement.newerRevisionAvailable.ordinal,
                      ).padStart(2, "0")}{" "}
                      ({placement.newerRevisionAvailable.revisionId}). This
                      placement remains pinned to{" "}
                      {placement.obstacleDesignRevisionId} until you preview and
                      confirm an update.
                    </p>
                    <div
                      className="revision-update-controls review-navigation"
                      aria-label={`Revision update actions for obstacle ${String(placement.displayNumber).padStart(2, "0")}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          openUpdatePreview({
                            kind: "update_one",
                            instanceId: placement.instanceId,
                            sourceRevisionId:
                              placement.obstacleDesignRevisionId,
                            destinationRevisionId:
                              placement.newerRevisionAvailable!.revisionId,
                          })
                        }
                        aria-label={`Update this placement, obstacle ${String(placement.displayNumber).padStart(2, "0")}`}
                      >
                        <strong>Update this placement</strong>
                        <span>
                          Update obstacle{" "}
                          {String(placement.displayNumber).padStart(2, "0")}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openUpdatePreview({
                            kind: "replace_all_from_revision",
                            sourceRevisionId:
                              placement.obstacleDesignRevisionId,
                            destinationRevisionId:
                              placement.newerRevisionAvailable!.revisionId,
                          })
                        }
                        aria-label={`Replace all using this revision, ${review.placements.filter((candidate) => candidate.obstacleDesignRevisionId === placement.obstacleDesignRevisionId).length} placement${review.placements.filter((candidate) => candidate.obstacleDesignRevisionId === placement.obstacleDesignRevisionId).length === 1 ? "" : "s"} pinned to Revision ${String(placement.pinnedRevision?.ordinal ?? 0).padStart(2, "0")}`}
                      >
                        <strong>Replace all using this revision</strong>
                        <span>
                          Replace{" "}
                          {
                            review.placements.filter(
                              (candidate) =>
                                candidate.obstacleDesignRevisionId ===
                                placement.obstacleDesignRevisionId,
                            ).length
                          }{" "}
                          placement
                          {review.placements.filter(
                            (candidate) =>
                              candidate.obstacleDesignRevisionId ===
                              placement.obstacleDesignRevisionId,
                          ).length === 1
                            ? ""
                            : "s"}{" "}
                          pinned to Revision{" "}
                          {String(
                            placement.pinnedRevision?.ordinal ?? 0,
                          ).padStart(2, "0")}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : null}
                {!placement.pinnedRevision ? (
                  <p className="missing-revision-status">
                    Missing pinned product data. Quantities for this placement
                    are excluded rather than estimated.
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          {review.placements.length === 0 ? (
            <p className="review-empty-copy">No placement rows to review.</p>
          ) : null}
        </section>

        <div className="review-summary-grid">
          <section aria-labelledby="geometry-review-title">
            <p className="eyebrow">03 · Geometry warnings</p>
            <h2 id="geometry-review-title">Planning checks</h2>
            {review.geometryWarnings.length === 0 ? (
              <p className="no-warnings">
                No overlap or boundary warnings in the current arrangement.
              </p>
            ) : (
              <ul data-testid="review-warnings">
                {review.geometryWarnings.map((warning) => (
                  <li key={`${warning.kind}-${warning.instanceIds.join("-")}`}>
                    <strong>{warning.kind.replaceAll("_", " ")}</strong>
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="review-boundary-copy">
              Exact Phase 1C semantics. Advisory only, not safety, federation,
              regulatory, course-validity, or venue-measurement certification.
            </p>
          </section>

          <section aria-labelledby="quantity-review-title">
            <p className="eyebrow">04 · Equipment quantities</p>
            <h2 id="quantity-review-title">Exact pinned roll-up</h2>
            <dl className="review-quantities" data-testid="review-quantities">
              {Object.entries(QUANTITY_LABELS).map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {
                      review.equipmentQuantities[
                        key as keyof typeof QUANTITY_LABELS
                      ]
                    }
                  </dd>
                </div>
              ))}
              {Object.entries(review.equipmentQuantities.lowerElements)
                .filter(([, quantity]) => quantity > 0)
                .map(([key, quantity]) => (
                  <div key={key}>
                    <dt>
                      {LOWER_LABELS[key as Exclude<LowerElement, "none">]}
                    </dt>
                    <dd>{quantity}</dd>
                  </div>
                ))}
            </dl>
            {review.completeness === "incomplete" ? (
              <p className="missing-revision-status">
                Unavailable revisions are excluded. This quantity summary is
                incomplete and unsuitable for production use.
              </p>
            ) : null}
          </section>
        </div>

        <section
          className="human-spec-section"
          aria-labelledby="human-spec-title"
        >
          <div className="review-section-heading">
            <div>
              <p className="eyebrow">05 · Human-readable specification</p>
              <h2 id="human-spec-title">Course production-spec preview</h2>
            </div>
            <span>Prototype preview · not for production</span>
          </div>
          <div className="human-spec-grid">
            <div>
              <h3>Placement instructions</h3>
              <ol>
                {review.humanReadableSpecification.placementLines.map(
                  (line) => (
                    <li key={line}>{line}</li>
                  ),
                )}
              </ol>
              {review.humanReadableSpecification.placementLines.length === 0 ? (
                <p>No placement instructions.</p>
              ) : null}
            </div>
            <div>
              <h3>Prototype quantity statement</h3>
              <ul>
                {review.humanReadableSpecification.quantityLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          className="machine-spec-section"
          aria-labelledby="machine-spec-title"
        >
          <div className="review-section-heading">
            <div>
              <p className="eyebrow">06 · Machine-readable specification</p>
              <h2 id="machine-spec-title">Deterministic JSON preview</h2>
            </div>
            <button
              className="copy-json-action review-navigation"
              type="button"
              onClick={copyJson}
              disabled={!hydrated}
            >
              {copyStatus}
            </button>
          </div>
          <p className="review-boundary-copy">
            Browser-local only. Copying does not publish, upload, approve, or
            order this course.
          </p>
          <pre data-testid="review-json" tabIndex={0}>
            <code>{json}</code>
          </pre>
          <span className="sr-only" aria-live="polite">
            {copyStatus}
          </span>
        </section>

        <section
          className="review-exclusions"
          aria-labelledby="review-exclusions-title"
        >
          <div>
            <p className="eyebrow">Prototype boundary</p>
            <h2 id="review-exclusions-title">Not suitable for production</h2>
            <p>{review.prototypeDisclaimer}</p>
          </div>
          <ul>
            {review.prototypeExclusions.map((exclusion) => (
              <li key={exclusion}>{exclusion}</li>
            ))}
          </ul>
        </section>
      </div>

      {updatePreview ? (
        <dialog
          className="revision-update-dialog review-navigation"
          aria-modal="true"
          ref={updateDialogRef}
          aria-labelledby="revision-update-dialog-title"
          aria-describedby="revision-update-dialog-boundary"
          onCancel={(event) => {
            event.preventDefault();
            cancelUpdatePreview();
          }}
          onKeyDown={handleDialogKeyDown}
        >
          <div className="revision-update-dialog-header">
            <div>
              <p className="eyebrow">
                Operation · {updatePreview.operation.kind}
              </p>
              <h2 id="revision-update-dialog-title">
                {updatePreview.operation.kind === "update_one"
                  ? `Update obstacle ${String(updatePreview.affectedDisplayNumbers[0]).padStart(2, "0")}`
                  : `Replace ${updatePreview.instanceCount} placement${updatePreview.instanceCount === 1 ? "" : "s"} pinned to Revision ${String(updatePreview.sourceRevision.ordinal).padStart(2, "0")}`}
              </h2>
            </div>
            <button
              className="revision-update-dialog-close"
              type="button"
              aria-label="Close update preview"
              onClick={cancelUpdatePreview}
            >
              ×
            </button>
          </div>

          <div className="revision-update-dialog-scroll">
            <section
              className="revision-update-route"
              aria-label="Revision route"
            >
              <div>
                <span>Source</span>
                <strong>
                  Revision{" "}
                  {String(updatePreview.sourceRevision.ordinal).padStart(
                    2,
                    "0",
                  )}
                </strong>
                <code>{updatePreview.sourceRevision.revisionId}</code>
              </div>
              <b aria-hidden="true">→</b>
              <div>
                <span>Destination</span>
                <strong>
                  Revision{" "}
                  {String(updatePreview.destinationRevision.ordinal).padStart(
                    2,
                    "0",
                  )}
                </strong>
                <code>{updatePreview.destinationRevision.revisionId}</code>
              </div>
            </section>

            <section aria-labelledby="affected-placements-title">
              <div className="revision-update-section-heading">
                <h3 id="affected-placements-title">
                  Exact affected placements
                </h3>
                <span>
                  {updatePreview.instanceCount} instance
                  {updatePreview.instanceCount === 1 ? "" : "s"} · display{" "}
                  {updatePreview.affectedDisplayNumbers
                    .map((number) => String(number).padStart(2, "0"))
                    .join(", ")}
                </span>
              </div>
              <ul className="revision-update-placements">
                {updatePreview.affectedPlacements.map((placement) => (
                  <li key={placement.instanceId}>
                    <strong>
                      Obstacle{" "}
                      {String(placement.displayNumber).padStart(2, "0")}
                    </strong>
                    <code>{placement.beforePinnedRevisionId}</code>
                    <span aria-hidden="true">→</span>
                    <code>{placement.afterPinnedRevisionId}</code>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="quantity-comparison-title">
              <div className="revision-update-section-heading">
                <h3 id="quantity-comparison-title">Equipment quantities</h3>
                <span>Exact pinned bill-of-materials derivation</span>
              </div>
              <div className="revision-update-table-wrap">
                <table className="revision-update-table">
                  <thead>
                    <tr>
                      <th scope="col">Equipment</th>
                      <th scope="col">Before</th>
                      <th scope="col">After</th>
                      <th scope="col">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(QUANTITY_LABELS).map(([key, label]) => {
                      const quantityKey = key as keyof typeof QUANTITY_LABELS;
                      return (
                        <tr key={key}>
                          <th scope="row">{label}</th>
                          <td>
                            {quantityValue(
                              updatePreview.quantities.before,
                              quantityKey,
                            )}
                          </td>
                          <td>
                            {quantityValue(
                              updatePreview.quantities.after,
                              quantityKey,
                            )}
                          </td>
                          <td>
                            {formatDelta(
                              updatePreview.quantities.delta[quantityKey],
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {Object.entries(LOWER_LABELS).map(([key, label]) => {
                      const lowerKey = key as Exclude<LowerElement, "none">;
                      return (
                        <tr key={key}>
                          <th scope="row">{label}</th>
                          <td>
                            {
                              updatePreview.quantities.before.lowerElements[
                                lowerKey
                              ]
                            }
                          </td>
                          <td>
                            {
                              updatePreview.quantities.after.lowerElements[
                                lowerKey
                              ]
                            }
                          </td>
                          <td>
                            {formatDelta(
                              updatePreview.quantities.delta.lowerElements[
                                lowerKey
                              ],
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="warning-comparison-title">
              <div className="revision-update-section-heading">
                <h3 id="warning-comparison-title">Geometry warnings</h3>
                <span>Existing Phase 1C advisory semantics</span>
              </div>
              <div className="revision-update-warning-grid">
                {(["before", "after"] as const).map((moment) => (
                  <div key={moment}>
                    <strong>
                      {moment === "before" ? "Before update" : "After update"}
                    </strong>
                    {updatePreview.geometryWarnings[moment].length === 0 ? (
                      <p>No overlap or boundary warnings.</p>
                    ) : (
                      <ul>
                        {updatePreview.geometryWarnings[moment].map(
                          (warning) => (
                            <li
                              key={`${warning.kind}-${warning.instanceIds.join("-")}`}
                            >
                              {warning.message}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="hash-comparison-title">
              <div className="revision-update-section-heading">
                <h3 id="hash-comparison-title">Course-review identity</h3>
                <span>
                  Draft version {review.courseDraftVersion} →{" "}
                  {updatePreview.proposedCourseDraftVersion}
                </span>
              </div>
              <dl className="revision-update-hashes">
                <div>
                  <dt>Current course-review hash</dt>
                  <dd>
                    <code>{updatePreview.currentReviewHash}</code>
                  </dd>
                </div>
                <div>
                  <dt>Proposed course-review hash</dt>
                  <dd>
                    <code data-testid="proposed-review-hash">
                      {updatePreview.proposedReviewHash}
                    </code>
                  </dd>
                </div>
              </dl>
            </section>

            <section
              className={`revision-update-validation${updateFailure ? " has-failure" : ""}`}
              aria-labelledby="preview-validation-title"
            >
              <h3 id="preview-validation-title">Preview validation</h3>
              {updateFailure ? (
                <p role="alert">{updateFailure}</p>
              ) : (
                <p>
                  Source, destination, design compatibility, exact targets, and
                  resulting course validated. Confirmation will revalidate all
                  preconditions before writing.
                </p>
              )}
            </section>

            <p
              className="revision-update-boundary"
              id="revision-update-dialog-boundary"
            >
              Browser-local, non-sellable prototype only. This update is not
              supplier approval, fabrication approval, safety certification,
              production approval, or an order.
            </p>
          </div>

          <div className="revision-update-dialog-actions">
            <button
              type="button"
              onClick={cancelUpdatePreview}
              ref={cancelUpdateRef}
              autoFocus
            >
              Cancel · keep current course
            </button>
            <button
              className="is-confirm"
              type="button"
              onClick={() => void confirmUpdate()}
            >
              {updatePreview.operation.kind === "update_one"
                ? "Confirm placement update"
                : "Confirm exact replace-all"}
            </button>
          </div>
        </dialog>
      ) : null}
    </main>
  );
}
