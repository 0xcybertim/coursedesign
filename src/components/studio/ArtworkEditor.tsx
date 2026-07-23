"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  copyPlacementToSide,
  createLinkedArtworkConfiguration,
  normalizeArtworkPlacement,
  processArtworkFile,
  type ArtworkConfiguration,
  type ArtworkPlacement,
  type ArtworkSide,
  type ProcessedArtwork,
} from "@/domain/artwork";
import { storeArtworkArtifact } from "@/lib/browser/artifact-store";
import {
  releaseArtworkObjectUrl,
  type ArtworkUrlMap,
} from "./useArtworkAssets";

interface ArtworkEditorProps {
  initialConfiguration?: ArtworkConfiguration;
  resolvedUrls: ArtworkUrlMap;
  onPreview: (
    configuration: ArtworkConfiguration | null,
    urlOverrides: ArtworkUrlMap,
  ) => void;
  onConfirm: (configuration: ArtworkConfiguration | null) => void;
  onCancel: () => void;
}

type ProcessingState = "idle" | "processing" | "ready" | "error";

function updatedConfiguration(
  configuration: ArtworkConfiguration,
  side: ArtworkSide,
  update: (placement: ArtworkPlacement) => ArtworkPlacement,
): ArtworkConfiguration {
  const placement = normalizeArtworkPlacement(update(configuration[side]));
  if (configuration.mapping === "linked") {
    const left =
      side === "left" ? placement : copyPlacementToSide(placement, "left");
    return {
      ...configuration,
      left,
      right: copyPlacementToSide(left, "right"),
    };
  }
  return { ...configuration, [side]: placement };
}

function controlNumber(event: ChangeEvent<HTMLInputElement>) {
  return Number.isFinite(event.target.valueAsNumber)
    ? event.target.valueAsNumber
    : 0;
}

export function ArtworkEditor({
  initialConfiguration,
  resolvedUrls,
  onPreview,
  onConfirm,
  onCancel,
}: ArtworkEditorProps) {
  const [configuration, setConfiguration] =
    useState<ArtworkConfiguration | null>(initialConfiguration ?? null);
  const [activeSide, setActiveSide] = useState<ArtworkSide>("left");
  const [processed, setProcessed] = useState<
    ReadonlyMap<string, ProcessedArtwork>
  >(new Map());
  const [objectUrls, setObjectUrls] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [processingState, setProcessingState] =
    useState<ProcessingState>("idle");
  const [message, setMessage] = useState(
    initialConfiguration
      ? "Existing custom artwork loaded for editing."
      : "Choose or drop PNG, JPEG, or sanitized SVG artwork.",
  );
  const [filename, setFilename] = useState<string | null>(null);
  const [pendingRelink, setPendingRelink] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    urlRef.current = objectUrls;
  }, [objectUrls]);

  useEffect(
    () => () => {
      for (const url of urlRef.current.values()) releaseArtworkObjectUrl(url);
    },
    [],
  );

  const previewUrls = useMemo(
    () => ({ ...resolvedUrls, ...Object.fromEntries(objectUrls.entries()) }),
    [objectUrls, resolvedUrls],
  );

  useEffect(() => {
    onPreview(pendingRemoval ? null : configuration, previewUrls);
  }, [configuration, onPreview, pendingRemoval, previewUrls]);

  const activePlacement = configuration?.[activeSide] ?? null;

  async function acceptFile(file: File) {
    setProcessingState("processing");
    setMessage(`Processing ${file.name}…`);
    setFilename(file.name);
    const result = await processArtworkFile(file);
    if (!result.ok) {
      setProcessingState("error");
      setMessage(`${result.error.kind}: ${result.error.message}`);
      return;
    }
    const item = result.value;
    const url = URL.createObjectURL(item.renderedBlob);
    setProcessed((current) => new Map(current).set(item.asset.assetId, item));
    setObjectUrls((current) => {
      const next = new Map(current);
      const previous = next.get(item.asset.renderContentHash);
      if (previous) releaseArtworkObjectUrl(previous);
      next.set(item.asset.renderContentHash, url);
      return next;
    });
    setConfiguration((current) => {
      if (!current) return createLinkedArtworkConfiguration(item.asset);
      const replacement = {
        ...current[activeSide],
        assetId: item.asset.assetId,
        sourceContentHash: item.asset.sourceContentHash,
        renderContentHash: item.asset.renderContentHash,
        pixelWidth: item.asset.pixelWidth,
        pixelHeight: item.asset.pixelHeight,
      };
      return updatedConfiguration(current, activeSide, () => replacement);
    });
    setPendingRemoval(false);
    setProcessingState("ready");
    setMessage(
      `${file.name} processed as canonical PNG. ${item.warnings.join(" ")}`.trim(),
    );
  }

  function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void acceptFile(file);
    event.target.value = "";
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void acceptFile(file);
  }

  function updatePlacement(
    update: (placement: ArtworkPlacement) => ArtworkPlacement,
  ) {
    setConfiguration((current) =>
      current ? updatedConfiguration(current, activeSide, update) : current,
    );
  }

  async function confirm() {
    if (pendingRemoval) {
      onConfirm(null);
      return;
    }
    if (!configuration) {
      setProcessingState("error");
      setMessage("Choose artwork before confirming.");
      inputRef.current?.focus();
      return;
    }
    for (const placement of [configuration.left, configuration.right]) {
      const item = processed.get(placement.assetId);
      if (
        item?.asset.detectedMediaType === "image/jpeg" &&
        placement.background.mode === "transparent"
      ) {
        setProcessingState("error");
        setMessage(
          "jpeg_background_required: Choose white, navy, or a custom background for JPEG artwork.",
        );
        return;
      }
    }
    setProcessingState("processing");
    setMessage("Verifying and storing artwork bytes before draft metadata…");
    for (const item of [...processed.values()]) {
      const stored = await storeArtworkArtifact(item);
      if (!stored.ok) {
        setProcessingState("error");
        setMessage(`${stored.error.kind}: ${stored.error.message}`);
        return;
      }
    }
    setProcessingState("ready");
    setMessage("Artwork stored and hash-verified.");
    onConfirm(configuration);
  }

  return (
    <section className="artwork-editor" aria-labelledby="artwork-editor-title">
      <div className="artwork-editor-heading">
        <div>
          <p className="eyebrow">Artwork · Phase 1F</p>
          <h3 id="artwork-editor-title">Place a logo on the fixed panels</h3>
        </div>
        <p className="artwork-editor-state" aria-live="polite">
          {message}
        </p>
      </div>

      <div
        className="artwork-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
        data-processing={processingState}
      >
        <input
          ref={inputRef}
          id="artwork-file"
          className="sr-only"
          type="file"
          accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
          onChange={fileChanged}
        />
        <label htmlFor="artwork-file" className="artwork-file-action">
          {configuration ? "Replace artwork" : "Choose artwork"}
        </label>
        <div>
          <strong>or drop a file here</strong>
          <p>PNG/JPEG up to 10 MiB · SVG up to 2 MiB · PDF unsupported</p>
          <p>Canonical PNG up to 2,048 px · 40 megapixel decode limit</p>
        </div>
        <span className="artwork-filename">
          {filename ??
            (configuration
              ? `Stored asset ${configuration[activeSide].assetId}`
              : "No file selected")}
        </span>
      </div>

      {configuration && !pendingRemoval ? (
        <div className="artwork-editor-body">
          <div className="artwork-mapping-controls">
            <label className="artwork-toggle">
              <input
                type="checkbox"
                checked={configuration.mapping === "independent"}
                onChange={(event) => {
                  if (event.target.checked) {
                    setConfiguration({
                      ...configuration,
                      mapping: "independent",
                    });
                    setActiveSide("right");
                  } else {
                    setPendingRelink(true);
                  }
                }}
              />
              Edit wings separately
            </label>
            {configuration.mapping === "independent" ? (
              <div
                className="artwork-side-tabs"
                role="tablist"
                aria-label="Wing to edit"
              >
                {(["left", "right"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    role="tab"
                    aria-selected={activeSide === side}
                    onClick={() => setActiveSide(side)}
                  >
                    {side === "left" ? "Left wing" : "Right wing"}
                  </button>
                ))}
              </div>
            ) : (
              <p>Linked · changes apply to both wings</p>
            )}
          </div>

          {pendingRelink ? (
            <div
              className="artwork-confirmation"
              role="alertdialog"
              aria-labelledby="relink-title"
            >
              <strong id="relink-title">Relink both wings?</strong>
              <p>
                The right-wing asset and placement will be replaced by the
                left-wing placement.
              </p>
              <button type="button" onClick={() => setPendingRelink(false)}>
                Keep separate
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfiguration({
                    ...configuration,
                    mapping: "linked",
                    right: copyPlacementToSide(configuration.left, "right"),
                  });
                  setActiveSide("left");
                  setPendingRelink(false);
                }}
              >
                Confirm relink
              </button>
            </div>
          ) : null}

          {activePlacement ? (
            <div className="artwork-controls-grid">
              <fieldset>
                <legend>Fit</legend>
                <div className="artwork-segments">
                  {(["contain", "cover"] as const).map((fit) => (
                    <button
                      key={fit}
                      type="button"
                      aria-pressed={activePlacement.fit === fit}
                      onClick={() =>
                        updatePlacement((item) => ({ ...item, fit }))
                      }
                    >
                      {fit[0].toUpperCase() + fit.slice(1)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label>
                Scale · {Math.round(activePlacement.scalePermille / 10)}%
                <input
                  type="range"
                  min="25"
                  max="400"
                  step="1"
                  value={activePlacement.scalePermille / 10}
                  onChange={(event) =>
                    updatePlacement((item) => ({
                      ...item,
                      scalePermille: controlNumber(event) * 10,
                    }))
                  }
                />
              </label>
              <label>
                Horizontal position
                <input
                  type="number"
                  min="-100"
                  max="100"
                  value={activePlacement.offsetXBasisPoints / 100}
                  onChange={(event) =>
                    updatePlacement((item) => ({
                      ...item,
                      offsetXBasisPoints: controlNumber(event) * 100,
                    }))
                  }
                />
              </label>
              <label>
                Vertical position
                <input
                  type="number"
                  min="-100"
                  max="100"
                  value={activePlacement.offsetYBasisPoints / 100}
                  onChange={(event) =>
                    updatePlacement((item) => ({
                      ...item,
                      offsetYBasisPoints: controlNumber(event) * 100,
                    }))
                  }
                />
              </label>
              <label>
                Rotation in degrees
                <input
                  type="number"
                  min="-180"
                  max="180"
                  step="1"
                  value={activePlacement.rotationMilliDegrees / 1000}
                  onChange={(event) =>
                    updatePlacement((item) => ({
                      ...item,
                      rotationMilliDegrees: controlNumber(event) * 1000,
                    }))
                  }
                />
              </label>
              <fieldset className="artwork-alignments">
                <legend>Alignment shortcuts</legend>
                {[
                  ["Left", -5000, 0],
                  ["Center", 0, 0],
                  ["Right", 5000, 0],
                  ["Top", 0, -5000],
                  ["Bottom", 0, 5000],
                ].map(([label, x, y]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      updatePlacement((item) => ({
                        ...item,
                        offsetXBasisPoints: Number(x),
                        offsetYBasisPoints: Number(y),
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
              <fieldset className="artwork-backgrounds">
                <legend>Panel background</legend>
                {[
                  ["Transparent", "transparent"],
                  ["White", "white"],
                  ["Navy", "navy"],
                ].map(([label, mode]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={activePlacement.background.mode === mode}
                    onClick={() =>
                      updatePlacement((item) => ({
                        ...item,
                        background:
                          mode === "transparent"
                            ? { mode: "transparent" }
                            : mode === "white"
                              ? { mode: "white", color: "#FFFFFF" }
                              : { mode: "navy", color: "#09245C" },
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
                <label>
                  Custom background
                  <input
                    type="color"
                    value={
                      activePlacement.background.mode === "custom"
                        ? activePlacement.background.color
                        : "#0D43C7"
                    }
                    onChange={(event) =>
                      updatePlacement((item) => ({
                        ...item,
                        background: {
                          mode: "custom",
                          color: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </fieldset>
              <label className="artwork-toggle">
                <input
                  type="checkbox"
                  checked={activePlacement.showBleedGuide}
                  onChange={(event) =>
                    updatePlacement((item) => ({
                      ...item,
                      showBleedGuide: event.target.checked,
                    }))
                  }
                />
                Show prototype bleed guide
              </label>
              <label className="artwork-toggle">
                <input
                  type="checkbox"
                  checked={activePlacement.showSafeAreaGuide}
                  onChange={(event) =>
                    updatePlacement((item) => ({
                      ...item,
                      showSafeAreaGuide: event.target.checked,
                    }))
                  }
                />
                Show prototype safe-area guide
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="artwork-assumption-note">
        <strong>Prototype assumptions only</strong>
        <p>
          700 × 1,500 mm panel area, 20 mm bleed, and 50 mm safe margin are not
          supplier-confirmed print rules.
        </p>
        <p>
          Fastener positions, edge keep-outs, resolution, color profile, panel
          material, and print method remain unresolved.
        </p>
      </div>

      <div className="artwork-editor-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {configuration && !pendingRemoval ? (
          <button
            type="button"
            className="artwork-remove-action"
            onClick={() => {
              setPendingRemoval(true);
              setMessage(
                "Custom artwork marked for removal. Confirm to return to Club Classic.",
              );
            }}
          >
            Remove custom artwork
          </button>
        ) : null}
        {pendingRemoval ? (
          <button type="button" onClick={() => setPendingRemoval(false)}>
            Keep artwork
          </button>
        ) : null}
        <button
          type="button"
          className="artwork-confirm-action"
          disabled={processingState === "processing"}
          onClick={() => void confirm()}
        >
          {pendingRemoval ? "Confirm removal" : "Confirm artwork"}
        </button>
      </div>
    </section>
  );
}
