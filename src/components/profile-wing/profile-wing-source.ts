"use client";

import { hashArtworkBytes, validateArtworkSource } from "@/domain/artwork";
import type {
  ProfileWingCreationSource,
  ProfileWingCreationSourceKind,
} from "@/domain/profile-wing-creation";
import type { RasterMaskInput } from "@/domain/silhouette";
import { storeContentAddressedBlob } from "@/lib/browser/artifact-store";

const PROFILE_WING_SOURCE_MAX_EDGE = 2048;
const PROFILE_WING_SOURCE_MAX_BYTES = 10 * 1024 * 1024;

export type ProfileWingSourceFailureKind =
  | "unsupported_source"
  | "invalid_source_size"
  | "source_decode_failure"
  | "source_processing_failure"
  | "mask_decode_failure"
  | "storage_failure";

function sourceFailure(kind: ProfileWingSourceFailureKind, message: string) {
  return Object.assign(new Error(message), { kind });
}

export interface PreparedProfileWingSource {
  readonly metadata: ProfileWingCreationSource;
  readonly blob: Blob;
}

interface DecodedSource {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  close(): void;
}

interface ProfileWingSourceDependencies {
  readonly decode?: (blob: Blob, allowSvg: boolean) => Promise<DecodedSource>;
  readonly createCanvas?: () => HTMLCanvasElement;
  readonly store?: typeof storeContentAddressedBlob;
}

export async function profileWingBlobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === "function")
    return new Uint8Array(await blob.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Blob read failed."));
    reader.readAsArrayBuffer(blob);
  });
}

async function decodeSource(
  blob: Blob,
  allowSvg: boolean,
): Promise<DecodedSource> {
  try {
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch (error) {
    if (!allowSvg) throw error;
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("Decoded image has no dimensions.");
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              sourceFailure(
                "source_processing_failure",
                "The browser could not encode the Profile Wing source.",
              ),
            ),
      "image/jpeg",
      0.92,
    );
  });
}

export async function prepareProfileWingSource(
  input: {
    readonly blob: Blob;
    readonly filename: string;
    readonly sourceKind: ProfileWingCreationSourceKind;
    readonly sourceLabel: string;
    readonly declaredMediaType?: string;
  },
  dependencies: ProfileWingSourceDependencies = {},
): Promise<PreparedProfileWingSource> {
  if (input.blob.size <= 0 || input.blob.size > PROFILE_WING_SOURCE_MAX_BYTES)
    throw sourceFailure(
      "invalid_source_size",
      "Choose a non-empty PNG or JPEG no larger than 10 MiB.",
    );
  const bytes = await profileWingBlobBytes(input.blob);
  const validated = validateArtworkSource({
    bytes,
    filename: input.filename,
    declaredMediaType: input.declaredMediaType,
  });
  if (
    !validated.ok ||
    (input.sourceKind === "user_upload" &&
      !["image/png", "image/jpeg"].includes(
        validated.ok ? validated.value.detectedMediaType : "",
      ))
  )
    throw sourceFailure(
      "unsupported_source",
      input.sourceKind === "user_upload"
        ? "Use a valid PNG or JPEG. PDF, SVG, WebP, and renamed files are not accepted."
        : validated.ok
          ? "This generated concept cannot be decoded as a raster source."
          : validated.error.message,
    );
  const sourceBlob =
    validated.value.detectedMediaType === "image/svg+xml" &&
    validated.value.sanitizedSvgMarkup
      ? new Blob([validated.value.sanitizedSvgMarkup], {
          type: "image/svg+xml",
        })
      : input.blob;
  let decoded: DecodedSource;
  try {
    decoded = await (dependencies.decode ?? decodeSource)(
      sourceBlob,
      validated.value.detectedMediaType === "image/svg+xml",
    );
  } catch {
    throw sourceFailure(
      "source_decode_failure",
      "The browser could not decode this Profile Wing source image.",
    );
  }
  try {
    if (decoded.width <= 0 || decoded.height <= 0)
      throw sourceFailure(
        "source_processing_failure",
        "The source image has invalid dimensions.",
      );
    const scale = Math.min(
      1,
      PROFILE_WING_SOURCE_MAX_EDGE / Math.max(decoded.width, decoded.height),
    );
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas =
      dependencies.createCanvas?.() ?? document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context)
      throw sourceFailure(
        "source_processing_failure",
        "Profile Wing canvas processing is unavailable.",
      );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await canvasBlob(canvas);
    const derivativeBytes = await profileWingBlobBytes(blob);
    const contentHash = hashArtworkBytes(derivativeBytes);
    const stored = await (dependencies.store ?? storeContentAddressedBlob)({
      contentHash,
      blob,
    });
    if (!stored.ok)
      throw sourceFailure("storage_failure", stored.error.message);
    const prefix = input.sourceKind === "user_upload" ? "upload" : "concept";
    return {
      blob,
      metadata: {
        sourceId: `${prefix}-${contentHash.slice(0, 24)}`,
        sourceKind: input.sourceKind,
        sourceLabel: input.sourceLabel.trim().slice(0, 160),
        originalFilename: input.filename.slice(0, 160),
        contentHash,
        mediaType: "image/jpeg",
        byteLength: blob.size,
        pixelWidth: width,
        pixelHeight: height,
      },
    };
  } finally {
    decoded.close();
  }
}

export async function rasterMaskFromCutout(
  blob: Blob,
  sourceMaskSha256: string,
  dependencies: Pick<
    ProfileWingSourceDependencies,
    "decode" | "createCanvas"
  > = {},
): Promise<RasterMaskInput> {
  let decoded: DecodedSource;
  try {
    decoded = await (dependencies.decode ?? decodeSource)(blob, false);
  } catch {
    throw sourceFailure(
      "mask_decode_failure",
      "The browser could not decode the returned transparent PNG.",
    );
  }
  try {
    const canvas =
      dependencies.createCanvas?.() ?? document.createElement("canvas");
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: true,
    });
    if (!context)
      throw sourceFailure(
        "mask_decode_failure",
        "Mask canvas processing is unavailable.",
      );
    context.clearRect(0, 0, decoded.width, decoded.height);
    context.drawImage(decoded.source, 0, 0);
    const rgba = context.getImageData(0, 0, decoded.width, decoded.height).data;
    const values = new Uint8Array(decoded.width * decoded.height);
    for (let pixel = 0; pixel < values.length; pixel += 1)
      values[pixel] = rgba[pixel * 4 + 3]!;
    return {
      width: decoded.width,
      height: decoded.height,
      values,
      sourceMaskSha256,
    };
  } finally {
    decoded.close();
  }
}
