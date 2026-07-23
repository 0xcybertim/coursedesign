"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  deriveConfiguration,
  FRAME_COLORS,
  LOWER_ELEMENTS,
} from "@/domain/design";
import type { FrameColor, LowerElement } from "@/domain/product/types";
import type { ArtworkConfiguration } from "@/domain/artwork";
import { ArtworkEditor } from "./ArtworkEditor";
import { ThreeStage } from "./ThreeStage";
import type { ArtworkUrlMap } from "./useArtworkAssets";
import { useLocalDesignWorkspace } from "./useLocalDesignWorkspace";

const FRAME_LABELS: Record<FrameColor, string> = {
  white: "White",
  blue: "Blue",
  red: "Red",
  yellow: "Yellow",
};
const LOWER_LABELS: Record<LowerElement, string> = {
  none: "None",
  decorative_panel: "Panel",
  gate: "Gate",
  filler: "Filler",
};
const EMPTY_ARTWORK_URLS: ArtworkUrlMap = {};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function HashStamp({ hash }: { hash: string }) {
  return (
    <code className="hash-stamp" title={hash}>
      CFG {hash.slice(0, 10)}
    </code>
  );
}

function activateRadioOption(
  event: KeyboardEvent<HTMLButtonElement>,
  select: () => void,
) {
  if (event.key !== "Enter" && event.key !== " " && event.code !== "Space")
    return;
  event.preventDefault();
  select();
}

function formatRevisionDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function StudioClient({
  forceThreeFailure = false,
}: {
  forceThreeFailure?: boolean;
}) {
  const localWorkspace = useLocalDesignWorkspace();
  const reducedMotion = useReducedMotion();
  const [artworkEditorOpen, setArtworkEditorOpen] = useState(false);
  const [artworkPreview, setArtworkPreview] = useState<{
    configuration: ArtworkConfiguration | null;
    urls: ArtworkUrlMap;
  } | null>(null);
  const artworkTriggerRef = useRef<HTMLButtonElement>(null);
  const result = useMemo(
    () => deriveConfiguration(localWorkspace.workspace.draft.intent),
    [localWorkspace.workspace.draft.intent],
  );

  const previewResult = useMemo(() => {
    if (!artworkEditorOpen || !artworkPreview) return null;
    return deriveConfiguration({
      ...localWorkspace.workspace.draft.intent,
      artwork: artworkPreview.configuration
        ? "custom_artwork"
        : "fixed_panel_artwork",
      artworkConfiguration: artworkPreview.configuration ?? undefined,
    });
  }, [
    artworkEditorOpen,
    artworkPreview,
    localWorkspace.workspace.draft.intent,
  ]);

  const handleArtworkPreview = useCallback(
    (configuration: ArtworkConfiguration | null, urls: ArtworkUrlMap) => {
      setArtworkPreview({ configuration, urls });
    },
    [],
  );

  const closeArtworkEditor = useCallback(() => {
    setArtworkEditorOpen(false);
    setArtworkPreview(null);
    window.requestAnimationFrame(() => artworkTriggerRef.current?.focus());
  }, []);

  if (!result.ok) {
    return (
      <main>
        <p role="alert">
          The controlled prototype configuration could not be derived.
        </p>
      </main>
    );
  }

  const derived =
    previewResult?.ok === true
      ? previewResult.value
      : (localWorkspace.viewingRevision?.snapshot ?? result.value);
  const frameColor = derived.configuration.frameColor;
  const lowerElement = derived.configuration.lowerElement;
  const controlsLocked =
    !localWorkspace.hydrated || localWorkspace.viewingRevision !== null;
  const lowerLine = derived.billOfMaterials.lines.find(
    (line) => line.componentKey === "lower_element",
  );

  function selectFrameColor(color: FrameColor) {
    localWorkspace.updateIntent({
      ...localWorkspace.workspace.draft.intent,
      frameColor: color,
    });
  }

  function selectLowerElement(option: LowerElement) {
    localWorkspace.updateIntent({
      ...localWorkspace.workspace.draft.intent,
      lowerElement: option,
    });
  }

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div
          className="working-brand"
          aria-label="JUMPFORM working mockup wordmark"
        >
          <span>JUMPFORM</span>
          <small>working wordmark</small>
        </div>
        <div className="studio-identity">
          <strong>SPJ-04 · Club Classic</strong>
          <span>Prototype-v1 · inferred geometry</span>
        </div>
        <div className="header-status">
          <HashStamp hash={derived.configurationHash} />
          <span className="prototype-status">Non-sellable prototype</span>
        </div>
      </header>

      <section className="product-stage" aria-labelledby="studio-title">
        <div className="cobalt-field">
          <span className="step-number" aria-hidden="true">
            04
          </span>
          <div className="stage-copy">
            <p className="eyebrow">Obstacle studio · Phase 1F</p>
            <h1 id="studio-title">
              One object.
              <br />
              Every output.
            </h1>
            <p>
              Configure the bounded SPJ-04 prototype. Visuals and evidence
              update from the same deterministic state.
            </p>
          </div>
        </div>
        <div className="product-preview">
          <ThreeStage
            manifest={derived.renderManifest}
            reducedMotion={reducedMotion}
            forceFailure={forceThreeFailure}
            artworkUrlOverrides={artworkPreview?.urls}
          />
          <div
            className="dimension-line"
            aria-label="Prototype envelope width 5,100 millimetres"
          >
            <span>5,100 mm prototype envelope</span>
          </div>
        </div>
      </section>

      <section className="control-tray" aria-label="Guided prototype options">
        <div className="tray-intro">
          <span className="eyebrow">01 / Configure</span>
          <h2>Club Classic</h2>
          <p>Prototype choices · not factory-confirmed</p>
        </div>

        <fieldset
          className="option-group frame-options"
          disabled={controlsLocked}
        >
          <legend>
            Frame color <small>inferred palette</small>
          </legend>
          <div
            className="swatch-row"
            role="radiogroup"
            aria-label="Frame color"
          >
            {FRAME_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={frameColor === color}
                aria-label={`${FRAME_LABELS[color]} frame${frameColor === color ? ", selected" : ""}`}
                className="swatch-option"
                onClick={() => selectFrameColor(color)}
                onKeyDown={(event) =>
                  activateRadioOption(event, () => selectFrameColor(color))
                }
              >
                <span className={`swatch swatch-${color}`} aria-hidden="true" />
                <span>{FRAME_LABELS[color]}</span>
                <small>{frameColor === color ? "Selected" : "Prototype"}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset
          className="option-group lower-options"
          disabled={controlsLocked}
        >
          <legend>
            Lower element <small>one optional slot</small>
          </legend>
          <div
            className="segmented-options"
            role="radiogroup"
            aria-label="Lower element"
          >
            {LOWER_ELEMENTS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={lowerElement === option}
                onClick={() => selectLowerElement(option)}
                onKeyDown={(event) =>
                  activateRadioOption(event, () => selectLowerElement(option))
                }
              >
                <span
                  className={`lower-icon lower-icon-${option}`}
                  aria-hidden="true"
                />
                {LOWER_LABELS[option]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="fixed-options" aria-label="Fixed prototype treatments">
          <span className="fixed-option-label">Pole treatment</span>
          <strong>Blue + white · alternating</strong>
          <small>Read-only · only evidenced prototype treatment</small>
          <span className="fixed-option-label artwork-label">Artwork</span>
          <strong>
            {derived.configuration.artwork === "custom_artwork"
              ? derived.configuration.artworkMapping ===
                "same_artwork_on_both_wings"
                ? "Custom artwork · linked wings"
                : "Custom artwork · independent wings"
              : "Club Classic · both wing panels"}
          </strong>
          <small>Fixed panel slots · browser-local prototype assets</small>
          <button
            ref={artworkTriggerRef}
            type="button"
            className="artwork-open-action"
            disabled={controlsLocked}
            onClick={() => setArtworkEditorOpen(true)}
          >
            {derived.configuration.artwork === "custom_artwork"
              ? "Edit logo artwork"
              : "Customize logo artwork"}
          </button>
        </div>

        <div className="price-action">
          <p className="provisional-label">Provisional supplier evidence</p>
          <strong data-testid="price-label">{derived.price.label}</strong>
          <p data-testid="surcharge-status">
            {derived.price.unknownSurcharges.length > 0
              ? `Surcharge unknown: ${derived.price.unknownSurcharges.join(", ")}. Example unchanged.`
              : "No option surcharge is confirmed."}
          </p>
          <button
            type="button"
            className="save-revision-action"
            onClick={localWorkspace.saveRevision}
            disabled={controlsLocked}
          >
            Save immutable revision
          </button>
          {localWorkspace.artifactError ? (
            <p className="artwork-save-error" role="alert">
              {localWorkspace.artifactError}
            </p>
          ) : null}
          <button type="button" className="primary-action" disabled>
            Continue unavailable · prototype only
          </button>
        </div>
      </section>

      {artworkEditorOpen && !localWorkspace.viewingRevision ? (
        <ArtworkEditor
          initialConfiguration={
            localWorkspace.workspace.draft.intent.artworkConfiguration
          }
          resolvedUrls={EMPTY_ARTWORK_URLS}
          onPreview={handleArtworkPreview}
          onConfirm={(configuration) => {
            localWorkspace.confirmArtwork(configuration);
            closeArtworkEditor();
          }}
          onCancel={closeArtworkEditor}
        />
      ) : null}

      <section
        className="revision-workspace"
        aria-labelledby="revision-workspace-title"
      >
        <div className="revision-heading">
          <div>
            <p className="eyebrow">02 / Local design record</p>
            <h2 id="revision-workspace-title">Draft here. History pinned.</h2>
          </div>
          <div className="local-save-state">
            <span
              className={`save-state-dot save-state-${localWorkspace.saveState}`}
              aria-hidden="true"
            />
            <p aria-live="polite" data-testid="local-save-status">
              {localWorkspace.status}
            </p>
            <small>
              Browser-local on this device · no account or cloud copy
            </small>
          </div>
        </div>

        {localWorkspace.viewingRevision ? (
          <div className="revision-view-banner" role="status">
            <div>
              <span className="eyebrow">Read-only saved revision</span>
              <strong>{localWorkspace.viewingRevision.name}</strong>
              <p>
                Its configuration and all six derived projections are pinned to
                hash{" "}
                {localWorkspace.viewingRevision.configurationHash.slice(0, 12)}.
              </p>
            </div>
            <div className="revision-view-actions">
              <button
                type="button"
                className="duplicate-action"
                onClick={localWorkspace.duplicateRevision}
              >
                Duplicate to edit
              </button>
              <button
                type="button"
                className="return-action"
                onClick={localWorkspace.returnToDraft}
              >
                Back to current draft
              </button>
            </div>
          </div>
        ) : null}

        <div className="revision-layout">
          <article className="draft-record" data-testid="draft-record">
            <span className="record-kind">Mutable draft</span>
            <strong>Club Classic · working copy</strong>
            <dl>
              <div>
                <dt>Version</dt>
                <dd>{localWorkspace.workspace.draft.draftVersion}</dd>
              </div>
              <div>
                <dt>Frame</dt>
                <dd>
                  {
                    FRAME_LABELS[
                      localWorkspace.workspace.draft.intent.frameColor
                    ]
                  }
                </dd>
              </div>
              <div>
                <dt>Lower</dt>
                <dd>
                  {
                    LOWER_LABELS[
                      localWorkspace.workspace.draft.intent.lowerElement
                    ]
                  }
                </dd>
              </div>
            </dl>
            <p>
              Changes replace this one working copy and restore automatically in
              this browser.
            </p>
          </article>

          <div className="revision-history">
            <div className="history-heading">
              <div>
                <span className="record-kind">Immutable history</span>
                <strong>
                  {localWorkspace.workspace.revisions.length} saved revision
                  {localWorkspace.workspace.revisions.length === 1 ? "" : "s"}
                </strong>
              </div>
              <p>New saves append. Existing revisions are never overwritten.</p>
            </div>

            {localWorkspace.workspace.revisions.length === 0 ? (
              <div className="empty-revisions">
                <strong>No saved revisions yet</strong>
                <p>
                  Configure the obstacle, then save an immutable browser-local
                  checkpoint.
                </p>
              </div>
            ) : (
              <ol className="revision-list">
                {[...localWorkspace.workspace.revisions]
                  .reverse()
                  .map((revision) => (
                    <li key={revision.revisionId}>
                      <div className="revision-number" aria-hidden="true">
                        {String(revision.ordinal).padStart(2, "0")}
                      </div>
                      <div className="revision-details">
                        <strong>{revision.name}</strong>
                        <span>
                          {
                            FRAME_LABELS[
                              revision.snapshot.configuration.frameColor
                            ]
                          }{" "}
                          frame ·{" "}
                          {
                            LOWER_LABELS[
                              revision.snapshot.configuration.lowerElement
                            ]
                          }{" "}
                          lower
                        </span>
                        <time dateTime={revision.createdAt}>
                          {formatRevisionDate(revision.createdAt)}
                        </time>
                        <code title={revision.configurationHash}>
                          CFG {revision.configurationHash.slice(0, 12)}
                        </code>
                      </div>
                      <button
                        type="button"
                        className="open-revision-action"
                        onClick={() =>
                          localWorkspace.openRevision(revision.revisionId)
                        }
                        aria-current={
                          localWorkspace.viewingRevision?.revisionId ===
                          revision.revisionId
                            ? "true"
                            : undefined
                        }
                      >
                        Open revision{" "}
                        {String(revision.ordinal).padStart(2, "0")}
                      </button>
                    </li>
                  ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section className="evidence-section" aria-labelledby="evidence-title">
        <div className="evidence-heading">
          <p className="eyebrow">03 / Derived evidence</p>
          <h2 id="evidence-title">One configuration, six projections.</h2>
          <p>
            Every panel below carries the same normalized configuration hash.
          </p>
        </div>

        <div className="evidence-grid">
          <article
            className="evidence-panel compatibility-panel"
            data-testid="compatibility-summary"
          >
            <div className="panel-heading">
              <span>Compatibility</span>
              <HashStamp hash={derived.compatibility.configurationHash} />
            </div>
            <p className="status-line">
              <span className="status-dot" /> Compatible within prototype rules
            </p>
            <ul>
              <li>2 wing assemblies</li>
              <li>4 poles remain fixed</li>
              <li>8 cups or adapters</li>
              <li>
                {lowerLine?.quantity ?? 0} lower element in one exclusive slot
              </li>
            </ul>
            <p className="truth-note">
              Inferred product-design compatibility. Not supplier-confirmed.
            </p>
          </article>

          <article
            className="evidence-panel bom-panel"
            data-testid="bom-summary"
          >
            <div className="panel-heading">
              <span>Bill of materials</span>
              <HashStamp hash={derived.billOfMaterials.configurationHash} />
            </div>
            <table>
              <thead>
                <tr>
                  <th>Prototype component</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {derived.billOfMaterials.lines.map((line) => (
                  <tr
                    key={line.componentKey}
                    data-component-key={line.componentKey}
                  >
                    <td>{line.label}</td>
                    <td>{line.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article
            className="evidence-panel footprint-panel"
            data-testid="footprint-summary"
          >
            <div className="panel-heading">
              <span>Course footprint</span>
              <HashStamp hash={derived.footprint.configurationHash} />
            </div>
            <div className="footprint-graphic" aria-hidden="true">
              <span className="wing-mark left" />
              <span className="pole-mark" />
              <span className="wing-mark right" />
              <span className="anchor-mark" />
            </div>
            <strong>5,100 × 800 mm</strong>
            <p>Anchor · midpoint of primary pole centerline</p>
            <p className="truth-note">
              Prototype-only. Not for survey, safety validation or fabrication.
            </p>
          </article>

          <article
            className="evidence-panel spec-panel"
            data-testid="spec-summary"
          >
            <div className="panel-heading">
              <span>Production-spec preview</span>
              <HashStamp hash={derived.productionSpec.configurationHash} />
            </div>
            <ul>
              {derived.productionSpec.humanReadable.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <details>
              <summary>Machine-readable preview</summary>
              <pre>
                {JSON.stringify(
                  derived.productionSpec.machineReadable,
                  null,
                  2,
                )}
              </pre>
            </details>
            <p className="spec-warning">
              Preview only · not supplier-approved · not for production
            </p>
          </article>
        </div>
      </section>

      <footer className="prototype-footer">
        <strong>Non-sellable prototype</strong>
        <p>
          Drafts, artwork, revisions, and course placements exist only in this
          browser. No account, server persistence, cross-device sync, sharing,
          ordering, checkout, delivery promise, supplier approval, production
          claim, or safety claim is provided.
        </p>
      </footer>

      <p
        className="sr-only"
        aria-live="polite"
        data-testid="configuration-announcement"
      >
        {localWorkspace.viewingRevision
          ? `Viewing immutable revision ${localWorkspace.viewingRevision.ordinal}: `
          : "Configuration updated: "}
        {FRAME_LABELS[frameColor]} frame, {LOWER_LABELS[lowerElement]} lower
        element. Hash {derived.configurationHash}.
      </p>
    </main>
  );
}
