export interface ObjectUploadRequest {
  readonly objectKey: string;
  readonly contentType: "image/png";
  readonly crc32c: string;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly expiresAt: Date;
}

export interface ObjectUploadAuthorization {
  readonly url: string;
  readonly expiresAt: Date;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface StoredObjectInspection {
  readonly objectKey: string;
  readonly generation: string;
  readonly contentType: string;
  readonly crc32c: string;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ObjectReadAuthorization {
  readonly url: string;
  readonly expiresAt: Date;
}

export type ObjectStorageFailureKind =
  | "missing"
  | "integrity"
  | "temporarily_unavailable";

export class ObjectStorageError extends Error {
  constructor(
    readonly kind: ObjectStorageFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "ObjectStorageError";
  }
}

export interface PrivateObjectStorage {
  authorizeUpload(
    request: ObjectUploadRequest,
  ): Promise<ObjectUploadAuthorization>;
  inspect(objectKey: string): Promise<StoredObjectInspection>;
  authorizeRead(input: {
    readonly objectKey: string;
    readonly generation: string;
    readonly expiresAt: Date;
  }): Promise<ObjectReadAuthorization>;
}
