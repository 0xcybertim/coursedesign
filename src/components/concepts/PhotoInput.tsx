"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  PHOTO_PROCESSING_VERSION,
  PHOTO_SUBJECT_KINDS,
  type PhotoDerivative,
  type PhotoSubjectKind,
} from "@/domain/generation";
import { hashArtworkBytes } from "@/domain/artwork";
import { storeContentAddressedBlob } from "@/lib/browser/artifact-store";

const PHOTO_SOURCE_MAX_BYTES = 10 * 1024 * 1024;

export type PhotoProcessingFailureKind =
  | "unsupported_photo"
  | "invalid_photo_size"
  | "photo_decode_failure"
  | "photo_processing_failure"
  | "storage_failure";

function photoFailure(kind: PhotoProcessingFailureKind, message: string) {
  return Object.assign(new Error(message), { kind });
}

export interface PreparedPhoto {
  readonly derivative: PhotoDerivative;
  readonly blob: Blob;
}

interface PhotoProcessingDependencies {
  readonly decode?: (file: File) => Promise<ImageBitmap>;
  readonly createCanvas?: () => HTMLCanvasElement;
  readonly store?: typeof storeContentAddressedBlob;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              photoFailure(
                "photo_processing_failure",
                "Photo derivative re-encoding failed.",
              ),
            ),
      "image/jpeg",
      0.9,
    );
  });
}

function blobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === "function")
    return blob.arrayBuffer().then((value) => new Uint8Array(value));
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Blob read failed."));
    reader.readAsArrayBuffer(blob);
  });
}

export async function preparePhotoDerivative(
  file: File,
  subjectKind: PhotoSubjectKind,
  dependencies: PhotoProcessingDependencies = {},
): Promise<PreparedPhoto> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw photoFailure(
      "unsupported_photo",
      "Use a JPEG, PNG, or WebP photo. PDF and SVG are not accepted here.",
    );
  if (file.size === 0 || file.size > PHOTO_SOURCE_MAX_BYTES)
    throw photoFailure(
      "invalid_photo_size",
      "The photo must be non-empty and no larger than 10 MiB.",
    );
  const decode =
    dependencies.decode ??
    ((source: File) =>
      createImageBitmap(source, { imageOrientation: "from-image" }));
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw photoFailure(
      "photo_decode_failure",
      "The browser could not decode this raster photo.",
    );
  }
  try {
    if (bitmap.width <= 0 || bitmap.height <= 0)
      throw photoFailure(
        "photo_processing_failure",
        "The photo has invalid decoded dimensions.",
      );
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas =
      dependencies.createCanvas?.() ?? document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context)
      throw photoFailure(
        "photo_processing_failure",
        "Photo canvas processing is unavailable.",
      );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasBlob(canvas);
    const bytes = await blobBytes(blob);
    const contentHash = hashArtworkBytes(bytes);
    const stored = await (dependencies.store ?? storeContentAddressedBlob)({
      contentHash,
      blob,
    });
    if (!stored.ok) throw photoFailure("storage_failure", stored.error.message);
    return {
      blob,
      derivative: {
        contentHash,
        mediaType: "image/jpeg",
        byteLength: blob.size,
        pixelWidth: width,
        pixelHeight: height,
        processingVersion: PHOTO_PROCESSING_VERSION,
        originalFilename: file.name,
        subjectKind,
      },
    };
  } finally {
    bitmap.close();
  }
}

export function PhotoInput(props: {
  readonly providerMode: "openai" | "deterministic";
  readonly value: PreparedPhoto | null;
  readonly onChange: (value: PreparedPhoto | null) => void;
  readonly consentReady: boolean;
  readonly onConsentReadyChange: (value: boolean) => void;
  readonly onPreparingChange: (value: boolean) => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [subjectKind, setSubjectKind] = useState<PhotoSubjectKind>("animal");
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState({
    rights: false,
    provider: false,
    people: false,
    logo: false,
    subject: false,
  });

  function updateCheck(key: keyof typeof checks, value: boolean) {
    const next = { ...checks, [key]: value };
    setChecks(next);
    props.onConsentReadyChange(Object.values(next).every(Boolean));
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    props.onPreparingChange(true);
    try {
      props.onChange(await preparePhotoDerivative(file, subjectKind));
    } catch (caught) {
      props.onChange(null);
      const kind =
        caught && typeof caught === "object" && "kind" in caught
          ? `${String(caught.kind)}: `
          : "";
      setError(
        `${kind}${caught instanceof Error ? caught.message : "Photo processing failed."}`,
      );
    } finally {
      props.onPreparingChange(false);
    }
  }

  return (
    <fieldset className="concept-photo-fieldset">
      <legend>Optional · Match this subject</legend>
      {props.providerMode === "openai" ? (
        <p>
          The original remains on this device. A metadata-stripped JPEG
          derivative, at most 2,048 px on its longest edge, is stored locally
          and sent to OpenAI only when you submit.
        </p>
      ) : (
        <p>
          Simulator mode preprocesses, hashes, stores, and submits a local
          derivative to test the workflow only. It makes no OpenAI call and does
          not demonstrate genuine photo matching.
        </p>
      )}
      <label htmlFor={`${inputId}-kind`}>Allowed subject</label>
      <select
        id={`${inputId}-kind`}
        value={subjectKind}
        onChange={(event) =>
          setSubjectKind(event.target.value as PhotoSubjectKind)
        }
      >
        {PHOTO_SUBJECT_KINDS.map((kind) => (
          <option value={kind} key={kind}>
            {kind.replace("-", " ")}
          </option>
        ))}
      </select>
      <label className="concept-photo-action" htmlFor={inputId}>
        {props.value ? "Replace reference photo" : "Choose reference photo"}
      </label>
      <input
        id={inputId}
        className="visually-hidden-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      {props.value ? (
        <div className="concept-photo-status">
          <strong>{props.value.derivative.originalFilename}</strong>
          <span>
            {props.value.derivative.pixelWidth} ×{" "}
            {props.value.derivative.pixelHeight}
            {" · "}
            {Math.ceil(props.value.derivative.byteLength / 1024)} KiB derivative
          </span>
          <code>{props.value.derivative.contentHash.slice(0, 16)}</code>
          <button type="button" onClick={() => props.onChange(null)}>
            Remove photo
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="concept-inline-error" role="alert" id={errorId}>
          {error}
        </p>
      ) : null}
      {props.value ? (
        <div className="concept-consent-list">
          <label>
            <input
              type="checkbox"
              checked={checks.rights}
              onChange={(event) => updateCheck("rights", event.target.checked)}
            />
            I own this image or have the right to use it.
          </label>
          <label>
            <input
              type="checkbox"
              checked={checks.provider}
              onChange={(event) =>
                updateCheck("provider", event.target.checked)
              }
            />
            {props.providerMode === "openai"
              ? "I understand the processed derivative leaves this device and is sent to OpenAI."
              : "I understand the processed derivative is used only by this local workflow simulator; no OpenAI call is made."}
          </label>
          <label>
            <input
              type="checkbox"
              checked={checks.people}
              onChange={(event) => updateCheck("people", event.target.checked)}
            />
            It contains no identifiable person.
          </label>
          <label>
            <input
              type="checkbox"
              checked={checks.logo}
              onChange={(event) => updateCheck("logo", event.target.checked)}
            />
            It is not a logo. Logos belong in the{" "}
            <Link href="/studio/obstacles/spj-04">
              exact SPJ-04 artwork workflow
            </Link>
            .
          </label>
          <label>
            <input
              type="checkbox"
              checked={checks.subject}
              onChange={(event) => updateCheck("subject", event.target.checked)}
            />
            It has one clear, prominent subject; ambiguous or multi-subject
            images should be cropped first.
          </label>
          <output className="concept-consent-state">
            {props.consentReady
              ? "Photo consent complete"
              : "All five confirmations are required"}
          </output>
        </div>
      ) : null}
    </fieldset>
  );
}
