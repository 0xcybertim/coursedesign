import {
  getArtworkBlob,
  type ArtifactStoreOptions,
} from "@/lib/browser/artifact-store";
import type {
  ArtworkRepository,
  AvailableArtworkRecord,
  CanonicalArtworkUpload,
  CanonicalArtworkUploadInput,
  RenderableArtwork,
} from "@/persistence/artwork-repository";
import {
  persistenceFailure,
  type PersistenceResult,
} from "@/persistence/result";

interface BrowserArtworkRepositoryOptions {
  readonly artifactStore?: ArtifactStoreOptions;
  readonly createObjectUrl?: (blob: Blob) => string;
}

function available(contentHash: string, blob: Blob): AvailableArtworkRecord {
  return {
    contentHash,
    crc32c: "browser-local-not-applicable",
    byteLength: blob.size,
    mediaType: "image/png",
    pixelWidth: 0,
    pixelHeight: 0,
    state: "available",
    generation: "browser-local",
  };
}

export class BrowserArtworkRepository implements ArtworkRepository {
  private readonly artifactStore?: ArtifactStoreOptions;
  private readonly createObjectUrl: (blob: Blob) => string;

  constructor(options: BrowserArtworkRepositoryOptions = {}) {
    this.artifactStore = options.artifactStore;
    this.createObjectUrl =
      options.createObjectUrl ??
      ((blob) => {
        if (typeof URL === "undefined" || !URL.createObjectURL) {
          throw new Error("Object URLs are unavailable.");
        }
        return URL.createObjectURL(blob);
      });
  }

  async beginCanonicalUpload(
    input: CanonicalArtworkUploadInput,
  ): Promise<PersistenceResult<CanonicalArtworkUpload>> {
    void input;
    return persistenceFailure(
      "validation",
      "Browser mode keeps artwork on this device and does not upload it.",
    );
  }

  async finalizeCanonicalUpload(
    contentHash: string,
  ): Promise<PersistenceResult<AvailableArtworkRecord>> {
    void contentHash;
    return persistenceFailure(
      "validation",
      "Browser mode keeps artwork on this device and does not finalize uploads.",
    );
  }

  async verifyAvailable(
    contentHashes: readonly string[],
  ): Promise<PersistenceResult<readonly AvailableArtworkRecord[]>> {
    const records: AvailableArtworkRecord[] = [];
    for (const contentHash of [...new Set(contentHashes)]) {
      const result = await getArtworkBlob(contentHash, this.artifactStore);
      if (!result.ok) {
        return persistenceFailure("asset_unavailable", result.error.message);
      }
      records.push(available(contentHash, result.value));
    }
    return { ok: true, value: records };
  }

  async getRenderable(
    contentHash: string,
  ): Promise<PersistenceResult<RenderableArtwork>> {
    const result = await getArtworkBlob(contentHash, this.artifactStore);
    if (!result.ok) {
      return persistenceFailure("asset_unavailable", result.error.message);
    }
    try {
      return {
        ok: true,
        value: {
          contentHash,
          url: this.createObjectUrl(result.value),
          expiresAt: null,
        },
      };
    } catch {
      return persistenceFailure(
        "temporarily_unavailable",
        "Browser artwork rendering is unavailable.",
      );
    }
  }
}
