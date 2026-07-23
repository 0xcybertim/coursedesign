import DOMPurify from "dompurify";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  ARTWORK_LIMITS,
  ARTWORK_PROCESSING_VERSION,
  type ArtworkMediaType,
  type ArtworkResult,
  type ArtworkValidationFailureKind,
  type ProcessedArtwork,
  type ValidatedArtworkSource,
} from "./types";

function failure(
  kind: ArtworkValidationFailureKind,
  message: string,
): ArtworkResult<never, ArtworkValidationFailureKind> {
  return { ok: false, error: { kind, message, recoverable: true } };
}

export function hashArtworkBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectArtworkMediaType(
  bytes: Uint8Array,
): ArtworkMediaType | "application/pdf" | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return "application/pdf";
  const prefix = new TextDecoder().decode(bytes.slice(0, 4096)).trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[^]*?-->\s*)?<svg[\s>]/i.test(prefix))
    return "image/svg+xml";
  return null;
}

function pngInfo(bytes: Uint8Array) {
  if (
    bytes.length < 33 ||
    new TextDecoder().decode(bytes.slice(12, 16)) !== "IHDR"
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const colorType = bytes[25];
  return {
    width,
    height,
    hasAlpha: colorType === 4 || colorType === 6,
  };
}

function jpegInfo(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        hasAlpha: false,
      };
    }
    offset += length + 2;
  }
  return null;
}

const ACTIVE_SVG_TAGS = new Set([
  "animate",
  "animatemotion",
  "animatetransform",
  "audio",
  "embed",
  "iframe",
  "object",
  "script",
  "set",
  "video",
]);

function svgNumber(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)/.exec(value);
  return match ? Number(match[1]) : null;
}

function sanitizeSvg(
  bytes: Uint8Array,
): ArtworkResult<ValidatedArtworkSource, ArtworkValidationFailureKind> {
  const markup = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const document = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (
    document.querySelector("parsererror") ||
    document.documentElement.localName.toLowerCase() !== "svg"
  ) {
    return failure("svg_invalid", "The SVG could not be parsed safely.");
  }

  const elements = [...document.querySelectorAll("*")];
  const attributeCount = elements.reduce(
    (total, element) => total + element.attributes.length,
    0,
  );
  if (
    elements.length > ARTWORK_LIMITS.svgMaxElements ||
    attributeCount > ARTWORK_LIMITS.svgMaxAttributes
  ) {
    return failure(
      "svg_too_complex",
      "The SVG is too complex for this browser-local prototype.",
    );
  }

  for (const element of elements) {
    const tag = element.localName.toLowerCase();
    if (tag === "foreignobject") {
      return failure(
        "svg_foreign_object",
        "SVG foreignObject content is not supported.",
      );
    }
    if (tag === "script") {
      return failure("svg_script", "SVG scripts are not allowed.");
    }
    if (ACTIVE_SVG_TAGS.has(tag)) {
      return failure(
        "svg_active_content",
        `Active SVG element <${tag}> is not supported.`,
      );
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on")) {
        return failure(
          "svg_event_handler",
          "SVG event-handler attributes are not allowed.",
        );
      }
      if (
        (name === "href" || name === "xlink:href" || name === "src") &&
        value !== "" &&
        !value.startsWith("#") &&
        !value.startsWith("data:image/png") &&
        !value.startsWith("data:image/jpeg")
      ) {
        return failure(
          "svg_external_reference",
          "External SVG resources are not allowed.",
        );
      }
      if (/url\s*\(\s*["']?(?:https?:|\/\/|file:)/i.test(value)) {
        return failure(
          "svg_external_reference",
          "External SVG resources are not allowed.",
        );
      }
    }
    if (tag === "style") {
      const css = element.textContent ?? "";
      if (/@font-face|@import|url\s*\(/i.test(css)) {
        return failure(
          "svg_remote_font",
          "Remote fonts and imported SVG styles are not allowed.",
        );
      }
    }
  }

  const sanitized = DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [...ACTIVE_SVG_TAGS, "foreignObject"],
    FORBID_ATTR: ["style"],
  });
  const sanitizedDocument = new DOMParser().parseFromString(
    sanitized,
    "image/svg+xml",
  );
  const root = sanitizedDocument.documentElement;
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width =
    svgNumber(root.getAttribute("width")) ??
    (viewBox.length === 4 ? viewBox[2] : null);
  const height =
    svgNumber(root.getAttribute("height")) ??
    (viewBox.length === 4 ? viewBox[3] : null);
  if (
    !width ||
    !height ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return failure(
      "svg_invalid",
      "The SVG needs finite width and height or a valid viewBox.",
    );
  }
  if (width * height > ARTWORK_LIMITS.decodedMaxPixels) {
    return failure(
      "decoded_dimensions_too_large",
      "Decoded artwork may not exceed 40 megapixels.",
    );
  }
  return {
    ok: true,
    value: {
      detectedMediaType: "image/svg+xml",
      pixelWidth: Math.round(width),
      pixelHeight: Math.round(height),
      hasAlpha: true,
      sanitizedSvgMarkup: new XMLSerializer().serializeToString(root),
    },
  };
}

export function validateArtworkSource(input: {
  bytes: Uint8Array;
  filename: string;
  declaredMediaType?: string;
}): ArtworkResult<ValidatedArtworkSource, ArtworkValidationFailureKind> {
  if (input.bytes.length === 0)
    return failure("empty_file", "Choose a non-empty artwork file.");
  const detected = detectArtworkMediaType(input.bytes);
  if (detected === "application/pdf") {
    return failure(
      "unsupported_pdf",
      "PDF is not supported in this prototype. Choose PNG, JPEG, or SVG.",
    );
  }
  if (!detected) {
    return failure(
      "unsupported_media_type",
      "The file content is not a supported PNG, JPEG, or SVG.",
    );
  }
  const sourceLimit =
    detected === "image/svg+xml"
      ? ARTWORK_LIMITS.svgSourceMaxBytes
      : ARTWORK_LIMITS.rasterSourceMaxBytes;
  if (input.bytes.length > sourceLimit) {
    return failure(
      "source_too_large",
      detected === "image/svg+xml"
        ? "SVG source files may not exceed 2 MiB."
        : "PNG and JPEG source files may not exceed 10 MiB.",
    );
  }

  if (
    input.declaredMediaType &&
    input.declaredMediaType !== "application/octet-stream" &&
    input.declaredMediaType !== detected &&
    !(input.declaredMediaType === "image/jpg" && detected === "image/jpeg")
  ) {
    return failure(
      "spoofed_media_type",
      `The browser reported ${input.declaredMediaType}, but the bytes are ${detected}.`,
    );
  }
  if (detected === "image/svg+xml") return sanitizeSvg(input.bytes);

  const info =
    detected === "image/png" ? pngInfo(input.bytes) : jpegInfo(input.bytes);
  if (!info || info.width <= 0 || info.height <= 0) {
    return failure(
      "corrupt_image",
      "The image bytes are incomplete or corrupt.",
    );
  }
  if (info.width * info.height > ARTWORK_LIMITS.decodedMaxPixels) {
    return failure(
      "decoded_dimensions_too_large",
      "Decoded artwork may not exceed 40 megapixels.",
    );
  }
  return {
    ok: true,
    value: {
      detectedMediaType: detected,
      pixelWidth: info.width,
      pixelHeight: info.height,
      hasAlpha: info.hasAlpha,
      sanitizedSvgMarkup: null,
    },
  };
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas returned no PNG.")),
      "image/png",
    );
  });
}

interface DecodedArtwork {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  close(): void;
}

async function decodeArtworkBlob(
  blob: Blob,
  allowSanitizedSvgFallback: boolean,
): Promise<DecodedArtwork> {
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
    if (!allowSanitizedSvgFallback) throw error;
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("The sanitized SVG decoded without dimensions.");
    }
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

export async function processArtworkFile(
  file: File,
  createdAt = new Date().toISOString(),
): Promise<ArtworkResult<ProcessedArtwork, ArtworkValidationFailureKind>> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return failure("corrupt_image", "The selected file could not be read.");
  }
  const validated = validateArtworkSource({
    bytes,
    filename: file.name,
    declaredMediaType: file.type,
  });
  if (!validated.ok) return validated;

  try {
    const sourceBlob = new Blob([Uint8Array.from(bytes).buffer], {
      type: validated.value.detectedMediaType,
    });
    const decodeBlob = validated.value.sanitizedSvgMarkup
      ? new Blob([validated.value.sanitizedSvgMarkup], {
          type: "image/svg+xml",
        })
      : sourceBlob;
    const decoded = await decodeArtworkBlob(
      decodeBlob,
      validated.value.detectedMediaType === "image/svg+xml",
    );
    const scale = Math.min(
      1,
      ARTWORK_LIMITS.canonicalLongestEdgePx /
        Math.max(decoded.width, decoded.height),
    );
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");
    context.clearRect(0, 0, width, height);
    try {
      context.drawImage(decoded.source, 0, 0, width, height);
    } finally {
      decoded.close();
    }
    const renderedBlob = await canvasPng(canvas);
    const renderedBytes = new Uint8Array(await renderedBlob.arrayBuffer());
    const sourceContentHash = hashArtworkBytes(bytes);
    const renderContentHash = hashArtworkBytes(renderedBytes);
    const warnings: string[] = [];
    if (Math.max(width, height) < 1024) {
      warnings.push(
        "This may look soft at full prototype-panel coverage. This is preview guidance, not a supplier print threshold.",
      );
    }
    return {
      ok: true,
      value: {
        sourceBlob,
        renderedBlob,
        warnings,
        asset: {
          assetId: `artwork-${sourceContentHash.slice(0, 16)}-${renderContentHash.slice(0, 16)}`,
          sourceContentHash,
          renderContentHash,
          originalFilename: file.name,
          detectedMediaType: validated.value.detectedMediaType,
          sourceByteLength: bytes.byteLength,
          renderedByteLength: renderedBlob.size,
          pixelWidth: width,
          pixelHeight: height,
          hasAlpha: validated.value.hasAlpha,
          processingVersion: ARTWORK_PROCESSING_VERSION,
          svgSanitized: validated.value.detectedMediaType === "image/svg+xml",
          rasterization: "browser_canvas_png",
          createdAt,
          status: "ready",
        },
      },
    };
  } catch {
    return failure(
      "rasterization_failed",
      "The artwork passed validation but could not be rasterized in this browser.",
    );
  }
}
