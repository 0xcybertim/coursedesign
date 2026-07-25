import type { PersistenceResult } from "./result";

export interface CanonicalArtworkDescriptor {
  readonly contentHash: string;
  readonly crc32c: string;
  readonly byteLength: number;
  readonly mediaType: "image/png";
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface AvailableArtworkRecord extends CanonicalArtworkDescriptor {
  readonly state: "available";
  readonly generation: string;
}

export interface RenderableArtwork {
  readonly contentHash: string;
  readonly url: string;
  readonly expiresAt: string | null;
}

export interface CanonicalArtworkUploadInput extends CanonicalArtworkDescriptor {
  readonly purpose: "canonical_render_derivative";
}

export interface CanonicalArtworkUploadIntent {
  readonly contentHash: string;
  readonly state: "upload_required";
  readonly url: string;
  readonly expiresAt: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface CanonicalArtworkAlreadyAvailable {
  readonly contentHash: string;
  readonly state: "already_available";
}

export type CanonicalArtworkUpload =
  | CanonicalArtworkUploadIntent
  | CanonicalArtworkAlreadyAvailable;

export interface ArtworkRepository {
  beginCanonicalUpload(
    input: CanonicalArtworkUploadInput,
  ): Promise<PersistenceResult<CanonicalArtworkUpload>>;
  finalizeCanonicalUpload(
    contentHash: string,
  ): Promise<PersistenceResult<AvailableArtworkRecord>>;
  verifyAvailable(
    contentHashes: readonly string[],
  ): Promise<PersistenceResult<readonly AvailableArtworkRecord[]>>;
  getRenderable(
    contentHash: string,
  ): Promise<PersistenceResult<RenderableArtwork>>;
}
