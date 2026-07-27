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
  type DerivedProfileWingPrototype,
  type ObstacleDesignRevision,
} from "@/domain/design";
import Link from "next/link";
import type { FrameColor, LowerElement } from "@/domain/product/types";
import type { ArtworkConfiguration } from "@/domain/artwork";
import { ConceptStudioClient } from "@/components/concepts/ConceptStudioClient";
import { ProfileWingCreatorClient } from "@/components/profile-wing/ProfileWingCreatorClient";
import { ProfileWingThreeStage } from "@/components/profile-wing/ProfileWingThreeStage";
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";
import { ArtworkEditor } from "./ArtworkEditor";
import { ThreeStage } from "./ThreeStage";
import type { ArtworkUrlMap } from "./useArtworkAssets";
import { useDesignWorkspace } from "./useDesignWorkspace";

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
type WingStyle = "standard" | "description" | "image";

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
  requestedRevisionId,
  conceptProviderMode = "deterministic",
  initialWingStyle = "standard",
  initialAcceptedConceptHash,
}: {
  forceThreeFailure?: boolean;
  requestedRevisionId?: string;
  conceptProviderMode?: "openai" | "deterministic" | null;
  initialWingStyle?: WingStyle;
  initialAcceptedConceptHash?: string;
}) {
  const localWorkspace = useDesignWorkspace(requestedRevisionId);
  const persistenceMode = usePersistenceMode();
  const reducedMotion = useReducedMotion();
  const [artworkEditorOpen, setArtworkEditorOpen] = useState(false);
  const [artworkPreview, setArtworkPreview] = useState<{
    configuration: ArtworkConfiguration | null;
    urls: ArtworkUrlMap;
  } | null>(null);
  const artworkTriggerRef = useRef<HTMLButtonElement>(null);
  const [lastSavedRevision, setLastSavedRevision] =
    useState<ObstacleDesignRevision | null>(null);
  const [wingStyle, setWingStyle] = useState<WingStyle>(initialWingStyle);
  const [acceptedConceptHash, setAcceptedConceptHash] = useState<
    string | undefined
  >(initialAcceptedConceptHash);
  const [customPrototype, setCustomPrototype] =
    useState<DerivedProfileWingPrototype | null>(null);
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

  async function saveExactRevision() {
    const saved = await localWorkspace.saveRevision();
    if (saved.ok) setLastSavedRevision(saved.revision);
  }

  function replaceWingQuery(nextStyle: WingStyle, conceptHash?: string): void {
    const url = new URL(window.location.href);
    if (nextStyle === "standard") {
      url.searchParams.delete("wing");
      url.searchParams.delete("source");
      url.searchParams.delete("concept");
    } else {
      url.searchParams.set("wing", nextStyle);
      if (conceptHash) {
        url.searchParams.set("source", "accepted-concept");
        url.searchParams.set("concept", conceptHash);
      } else {
        url.searchParams.delete("source");
        url.searchParams.delete("concept");
      }
    }
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function selectWingStyle(nextStyle: WingStyle) {
    setWingStyle(nextStyle);
    setAcceptedConceptHash(undefined);
    setCustomPrototype(null);
    replaceWingQuery(nextStyle);
  }

  function useDescribedWing(contentHash: string) {
    setAcceptedConceptHash(contentHash);
    setCustomPrototype(null);
    replaceWingQuery("description", contentHash);
  }

  const customWingActive = wingStyle !== "standard";
  const customSourceReady =
    wingStyle === "image" || acceptedConceptHash !== undefined;

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div className="studio-identity">
          <strong>
            {customWingActive
              ? "Four-pole vertical · Custom wings"
              : "SPJ-04 · Club Classic"}
          </strong>
          <span>
            {localWorkspace.viewingRevision
              ? `Read-only Revision ${String(
                  localWorkspace.viewingRevision.ordinal,
                ).padStart(2, "0")}`
              : "Working draft · controlled configuration"}
          </span>
        </div>
        <div className="header-status">
          {customPrototype ? (
            <code
              className="hash-stamp"
              title={customPrototype.renderManifest.geometrySha256}
            >
              GEO {customPrototype.renderManifest.geometrySha256.slice(0, 10)}
            </code>
          ) : customWingActive ? (
            <span className="advanced-customization-status">
              Advanced customization
            </span>
          ) : (
            <HashStamp hash={derived.configurationHash} />
          )}
          <span className="prototype-status">Non-sellable prototype</span>
        </div>
      </header>

      <section className="product-stage" aria-labelledby="studio-title">
        <div className="cobalt-field">
          <span className="step-number" aria-hidden="true">
            04
          </span>
          <div className="stage-copy">
            <p className="eyebrow">Jump customizer</p>
            <h1 id="studio-title">
              Your jump.
              <br />
              Your wings.
            </h1>
            <p>
              Choose the wing style, customize its appearance, preview the
              complete four-pole jump, then save one exact revision.
            </p>
          </div>
        </div>
        <div className="product-preview">
          {customPrototype ? (
            <ProfileWingThreeStage
              manifest={customPrototype.renderManifest}
              reducedMotion={reducedMotion}
              forceFailure={forceThreeFailure}
            />
          ) : (
            <ThreeStage
              manifest={derived.renderManifest}
              reducedMotion={reducedMotion}
              forceFailure={forceThreeFailure}
              artworkUrlOverrides={artworkPreview?.urls}
            />
          )}
          {customWingActive && !customPrototype ? (
            <p className="custom-preview-pending" role="status">
              Standard foundation shown until the custom silhouette is approved.
            </p>
          ) : null}
          {!customPrototype ? (
            <div
              className="dimension-line"
              aria-label="Prototype envelope width 5,100 millimetres"
            >
              <span>5,100 mm prototype envelope</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="control-tray" aria-label="Guided prototype options">
        <div className="tray-intro">
          <span className="eyebrow">01 / Wing style</span>
          <h2>How should the wings look?</h2>
          <p>
            Standard is included. Description and image are advanced
            customizations · quote impact unknown.
          </p>
        </div>

        <fieldset className="wing-style-options" disabled={controlsLocked}>
          <legend className="sr-only">Wing style</legend>
          <div
            className="wing-style-grid"
            role="radiogroup"
            aria-label="Wing style"
          >
            {(
              [
                {
                  value: "standard",
                  label: "Standard panels",
                  eyebrow: "Included",
                  description:
                    "Rectangular panels with color, lower element, and logo artwork.",
                },
                {
                  value: "description",
                  label: "Describe custom wings",
                  eyebrow: "Advanced customization",
                  description:
                    "Create a visual direction, approve its silhouette, and color the complete jump.",
                },
                {
                  value: "image",
                  label: "Upload a wing image",
                  eyebrow: "Advanced customization",
                  description:
                    "Start from one owned image, inspect the inferred profile, and color the complete jump.",
                },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={wingStyle === option.value}
                className="wing-style-option"
                onClick={() => selectWingStyle(option.value)}
                onKeyDown={(event) =>
                  activateRadioOption(event, () =>
                    selectWingStyle(option.value),
                  )
                }
              >
                <small>{option.eyebrow}</small>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
                <b>{wingStyle === option.value ? "Selected" : "Choose"}</b>
              </button>
            ))}
          </div>
        </fieldset>

        {wingStyle === "standard" ? (
          <>
            <div className="tray-section-label">
              <span className="eyebrow">02 / Appearance</span>
              <strong>Customize the standard panels</strong>
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
                    <span
                      className={`swatch swatch-${color}`}
                      aria-hidden="true"
                    />
                    <span>{FRAME_LABELS[color]}</span>
                    <small>
                      {frameColor === color ? "Selected" : "Prototype"}
                    </small>
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
                      activateRadioOption(event, () =>
                        selectLowerElement(option),
                      )
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

            <div
              className="fixed-options"
              aria-label="Fixed prototype treatments"
            >
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
              <small>
                {persistenceMode === "server"
                  ? "Fixed panel slots · canonical render derivatives cross devices"
                  : "Fixed panel slots · browser-local prototype assets"}
              </small>
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
                onClick={saveExactRevision}
                disabled={controlsLocked}
              >
                Save immutable revision
              </button>
              {localWorkspace.artifactError ? (
                <p className="artwork-save-error" role="alert">
                  {localWorkspace.artifactError}
                </p>
              ) : null}
              {lastSavedRevision ? (
                <div className="studio-save-continuation" aria-live="polite">
                  <strong>
                    Revision{" "}
                    {String(lastSavedRevision.ordinal).padStart(2, "0")} saved
                  </strong>
                  <Link
                    className="primary-action"
                    href={`/courses/local-course-1?revision=${encodeURIComponent(
                      lastSavedRevision.revisionId,
                    )}`}
                  >
                    Add Revision{" "}
                    {String(lastSavedRevision.ordinal).padStart(2, "0")} to
                    course
                  </Link>
                  <Link href={`/designs/${lastSavedRevision.designId}`}>
                    View saved design
                  </Link>
                </div>
              ) : localWorkspace.viewingRevision ? (
                <Link
                  className="primary-action"
                  href={`/courses/local-course-1?revision=${encodeURIComponent(
                    localWorkspace.viewingRevision.revisionId,
                  )}`}
                >
                  Add Revision{" "}
                  {String(localWorkspace.viewingRevision.ordinal).padStart(
                    2,
                    "0",
                  )}{" "}
                  to course
                </Link>
              ) : (
                <div className="studio-save-continuation">
                  <button type="button" className="primary-action" disabled>
                    Add to course
                  </button>
                  <small>Save a revision to add it to a course.</small>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="advanced-wing-workflow">
            <div className="advanced-wing-heading">
              <div>
                <span className="eyebrow">02 / Advanced customization</span>
                <h2>
                  {wingStyle === "description"
                    ? acceptedConceptHash
                      ? "Turn the description into custom wings"
                      : "Describe the custom wings"
                    : "Build custom wings from an image"}
                </h2>
              </div>
              <p>
                Custom silhouette · supplier quote impact unknown. The existing
                four-pole foundation stays fixed.
              </p>
            </div>
            {wingStyle === "description" && !acceptedConceptHash ? (
              conceptProviderMode ? (
                <ConceptStudioClient
                  embedded
                  providerMode={conceptProviderMode}
                  onUseSelectedConcept={useDescribedWing}
                />
              ) : (
                <div className="advanced-wing-unavailable" role="alert">
                  <strong>Description generation is unavailable.</strong>
                  <p>
                    This local server has no enabled concept provider. Standard
                    panels and image upload remain available.
                  </p>
                </div>
              )
            ) : customSourceReady ? (
              <ProfileWingCreatorClient
                embedded
                forceThreeFailure={forceThreeFailure}
                acceptedConceptHash={acceptedConceptHash}
                sourceMode={
                  wingStyle === "description" ? "accepted-concept" : "upload"
                }
                hideResultPreview
                onPrototypeChange={setCustomPrototype}
              />
            ) : null}
          </div>
        )}
      </section>

      {wingStyle === "standard" &&
      artworkEditorOpen &&
      !localWorkspace.viewingRevision ? (
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

      {wingStyle === "standard" ? (
        <>
          <section
            className="revision-workspace"
            aria-labelledby="revision-workspace-title"
          >
            <div className="revision-heading">
              <div>
                <p className="eyebrow">
                  02 /{" "}
                  {persistenceMode === "server"
                    ? "Server design record"
                    : "Local design record"}
                </p>
                <h2 id="revision-workspace-title">
                  Draft here. History pinned.
                </h2>
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
                  {persistenceMode === "server"
                    ? "Saved to your authenticated team workspace"
                    : "Browser-local on this device · no account or cloud copy"}
                </small>
              </div>
            </div>

            {localWorkspace.conflict ? (
              <div className="revision-view-banner" role="alert">
                <div>
                  <span className="eyebrow">Server save conflict</span>
                  <strong>Your attempted edit was not overwritten.</strong>
                  <p>
                    This design changed in another context. Load the latest
                    version or retry your preserved edit against it.
                  </p>
                </div>
                <div>
                  <button type="button" onClick={localWorkspace.reloadLatest}>
                    Load latest server version
                  </button>
                  <button type="button" onClick={localWorkspace.retryAttempted}>
                    Retry my preserved edit
                  </button>
                </div>
              </div>
            ) : null}

            {localWorkspace.viewingRevision ? (
              <div className="revision-view-banner" role="status">
                <div>
                  <span className="eyebrow">Read-only saved revision</span>
                  <strong>{localWorkspace.viewingRevision.name}</strong>
                  <p>
                    Its configuration and all six derived projections are pinned
                    to hash{" "}
                    {localWorkspace.viewingRevision.configurationHash.slice(
                      0,
                      12,
                    )}
                    .
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
                  {persistenceMode === "server"
                    ? "Changes replace this one server working copy with conflict protection."
                    : "Changes replace this one working copy and restore automatically in this browser."}
                </p>
              </article>

              <div className="revision-history">
                <div className="history-heading">
                  <div>
                    <span className="record-kind">Immutable history</span>
                    <strong>
                      {localWorkspace.workspace.revisions.length === 1
                        ? "1 saved revision"
                        : `${localWorkspace.workspace.revisions.length} saved revisions`}
                    </strong>
                  </div>
                  <p>
                    New saves append. Existing revisions are never overwritten.
                  </p>
                </div>

                {localWorkspace.workspace.revisions.length === 0 ? (
                  <div className="empty-revisions">
                    <strong>No saved revisions yet</strong>
                    <p>
                      {persistenceMode === "server"
                        ? "Configure the obstacle, then append an immutable server revision."
                        : "Configure the obstacle, then save an immutable browser-local checkpoint."}
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

          <section
            className="evidence-section"
            aria-labelledby="evidence-title"
          >
            <div className="evidence-heading">
              <p className="eyebrow">03 / Derived evidence</p>
              <h2 id="evidence-title">One configuration, six projections.</h2>
              <p>
                Every panel below carries the same normalized configuration
                hash.
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
                  <span className="status-dot" /> Compatible within prototype
                  rules
                </p>
                <ul>
                  <li>2 wing assemblies</li>
                  <li>4 poles remain fixed</li>
                  <li>8 cups or adapters</li>
                  <li>
                    {lowerLine?.quantity ?? 0} lower element in one exclusive
                    slot
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
                  Prototype-only. Not for survey, safety validation or
                  fabrication.
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
        </>
      ) : null}

      <footer className="prototype-footer">
        <strong>Non-sellable prototype</strong>
        <p>
          {persistenceMode === "server"
            ? "Core drafts, canonical render artwork, immutable revisions, and course placements are saved to your authenticated team workspace. Raw uploads, masks, generated concepts, and processing histories stay in this browser. Team invitations and private sharing are not available yet. No ordering, checkout, delivery promise, supplier approval, production claim, or safety claim is provided."
            : "Drafts, artwork, revisions, and course placements exist only in this browser. No account, server persistence, cross-device sync, sharing, ordering, checkout, delivery promise, supplier approval, production claim, or safety claim is provided."}
        </p>
      </footer>

      <p
        className="sr-only"
        aria-live="polite"
        data-testid="configuration-announcement"
      >
        {customPrototype
          ? `Custom wing preview updated. Geometry hash ${customPrototype.renderManifest.geometrySha256}.`
          : customWingActive
            ? `${wingStyle === "description" ? "Description" : "Image"} wing customization selected. Standard foundation shown until the custom silhouette is approved.`
            : `${
                localWorkspace.viewingRevision
                  ? `Viewing immutable revision ${localWorkspace.viewingRevision.ordinal}: `
                  : "Configuration updated: "
              }${FRAME_LABELS[frameColor]} frame, ${LOWER_LABELS[lowerElement]} lower element. Hash ${derived.configurationHash}.`}
      </p>
    </main>
  );
}
