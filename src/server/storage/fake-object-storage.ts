import {
  ObjectStorageError,
  type ObjectReadAuthorization,
  type ObjectUploadAuthorization,
  type ObjectUploadRequest,
  type PrivateObjectStorage,
  type StoredObjectInspection,
} from "./object-storage";

export class FakePrivateObjectStorage implements PrivateObjectStorage {
  readonly uploadRequests: ObjectUploadRequest[] = [];
  readonly readRequests: Array<{
    readonly objectKey: string;
    readonly generation: string;
    readonly expiresAt: Date;
  }> = [];
  readonly objects = new Map<string, StoredObjectInspection>();
  failure: ObjectStorageError | null = null;

  async authorizeUpload(
    request: ObjectUploadRequest,
  ): Promise<ObjectUploadAuthorization> {
    if (this.failure) throw this.failure;
    this.uploadRequests.push(request);
    const requiredHeaders = {
      "content-type": request.contentType,
      "x-goog-hash": `crc32c=${request.crc32c}`,
      "x-goog-meta-byte-length": String(request.byteLength),
      "x-goog-meta-canonical-purpose": "render-derivative",
      "x-goog-meta-pixel-height": String(request.pixelHeight),
      "x-goog-meta-pixel-width": String(request.pixelWidth),
      "x-goog-meta-sha256": request.contentHash,
    };
    return {
      url: `https://storage.invalid/upload/${encodeURIComponent(request.objectKey)}`,
      expiresAt: request.expiresAt,
      requiredHeaders,
    };
  }

  async inspect(objectKey: string): Promise<StoredObjectInspection> {
    if (this.failure) throw this.failure;
    const value = this.objects.get(objectKey);
    if (!value) {
      throw new ObjectStorageError("missing", "The object is missing.");
    }
    return value;
  }

  async authorizeRead(input: {
    readonly objectKey: string;
    readonly generation: string;
    readonly expiresAt: Date;
  }): Promise<ObjectReadAuthorization> {
    if (this.failure) throw this.failure;
    this.readRequests.push(input);
    return {
      url: `https://storage.invalid/read/${encodeURIComponent(input.objectKey)}?generation=${encodeURIComponent(input.generation)}`,
      expiresAt: input.expiresAt,
    };
  }
}
