import type {
  CanonicalArtworkUpload,
  CanonicalArtworkUploadInput,
  PersistenceResult,
  RenderableArtwork,
} from "@/persistence";
import {
  COURSE_DESIGN_CSRF_HEADER,
  COURSE_DESIGN_CSRF_VALUE,
} from "@/persistence/request-policy-values";

export async function persistenceApi<T>(
  url: string,
  init: RequestInit = {},
): Promise<PersistenceResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.method && init.method !== "GET"
          ? { [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE }
          : {}),
        ...init.headers,
      },
    });
    return (await response.json()) as PersistenceResult<T>;
  } catch {
    return {
      ok: false,
      error: {
        kind: "temporarily_unavailable",
        message: "The server workspace is temporarily unavailable. Try again.",
        retryable: true,
      },
    };
  }
}

function crc32c(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0x82f63b78 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function crc32cBase64(bytes: Uint8Array): string {
  const value = crc32c(bytes);
  const encoded = String.fromCharCode(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
  return btoa(encoded);
}

export async function uploadCanonicalArtwork(input: {
  readonly contentHash: string;
  readonly blob: Blob;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}): Promise<PersistenceResult<null>> {
  const bytes = new Uint8Array(await input.blob.arrayBuffer());
  const descriptor: CanonicalArtworkUploadInput = {
    purpose: "canonical_render_derivative",
    contentHash: input.contentHash,
    crc32c: crc32cBase64(bytes),
    byteLength: bytes.byteLength,
    mediaType: "image/png",
    pixelWidth: input.pixelWidth,
    pixelHeight: input.pixelHeight,
  };
  const intent = await persistenceApi<CanonicalArtworkUpload>(
    "/api/artwork/uploads",
    { method: "POST", body: JSON.stringify(descriptor) },
  );
  if (!intent.ok) return intent;
  if (intent.value.state === "upload_required") {
    try {
      const uploaded = await fetch(intent.value.url, {
        method: "PUT",
        body: input.blob,
        headers: intent.value.requiredHeaders,
      });
      if (!uploaded.ok && uploaded.status !== 412) {
        return {
          ok: false,
          error: {
            kind: "asset_unavailable",
            message:
              "The canonical render derivative could not be uploaded. Nothing was saved.",
            retryable: false,
          },
        };
      }
    } catch {
      return {
        ok: false,
        error: {
          kind: "temporarily_unavailable",
          message:
            "The canonical render derivative upload was interrupted. Try again.",
          retryable: true,
        },
      };
    }
  }
  const finalized = await persistenceApi(
    `/api/artwork/uploads/${encodeURIComponent(input.contentHash)}/finalize`,
    { method: "POST" },
  );
  return finalized.ok ? { ok: true, value: null } : finalized;
}

export function getServerRenderableArtwork(
  contentHash: string,
): Promise<PersistenceResult<RenderableArtwork>> {
  return persistenceApi(`/api/artwork/${encodeURIComponent(contentHash)}`);
}
