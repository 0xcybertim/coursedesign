import "server-only";

import { Storage } from "@google-cloud/storage";

import type { ServerPersistenceConfig } from "@/server/config/persistence-config";

import {
  ObjectStorageError,
  type ObjectReadAuthorization,
  type ObjectStorageFailureKind,
  type ObjectUploadAuthorization,
  type ObjectUploadRequest,
  type PrivateObjectStorage,
  type StoredObjectInspection,
} from "./object-storage";
import { inspectPngBytes } from "./png";

function errorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = Reflect.get(error, "code");
  return typeof code === "number" ? code : undefined;
}

function storageFailure(
  error: unknown,
  fallback: string,
  integrity = false,
): ObjectStorageError {
  if (error instanceof ObjectStorageError) return error;
  const code = errorCode(error);
  const kind: ObjectStorageFailureKind =
    code === 404
      ? "missing"
      : integrity
        ? "integrity"
        : "temporarily_unavailable";
  return new ObjectStorageError(
    kind,
    code === 404 ? "The object is missing." : fallback,
  );
}

function metadataRecord(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export class GcsPrivateObjectStorage implements PrivateObjectStorage {
  private readonly bucket;

  constructor(config: ServerPersistenceConfig["gcs"]) {
    const client = new Storage({
      projectId: config.projectId,
      credentials: {
        client_email: config.clientEmail,
        private_key: config.privateKey,
      },
    });
    this.bucket = client.bucket(config.bucket);
  }

  async authorizeUpload(
    request: ObjectUploadRequest,
  ): Promise<ObjectUploadAuthorization> {
    const requiredHeaders = {
      "content-type": request.contentType,
      "x-goog-hash": `crc32c=${request.crc32c}`,
      "x-goog-meta-byte-length": String(request.byteLength),
      "x-goog-meta-canonical-purpose": "render-derivative",
      "x-goog-meta-pixel-height": String(request.pixelHeight),
      "x-goog-meta-pixel-width": String(request.pixelWidth),
      "x-goog-meta-sha256": request.contentHash,
    };
    try {
      const [url] = await this.bucket.file(request.objectKey).getSignedUrl({
        version: "v4",
        action: "write",
        expires: request.expiresAt,
        contentType: request.contentType,
        extensionHeaders: requiredHeaders,
        queryParams: { "x-goog-if-generation-match": "0" },
      });
      return { url, expiresAt: request.expiresAt, requiredHeaders };
    } catch (error) {
      throw storageFailure(
        error,
        "Canonical artwork upload authorization is temporarily unavailable.",
      );
    }
  }

  async inspect(objectKey: string): Promise<StoredObjectInspection> {
    const file = this.bucket.file(objectKey);
    try {
      const [[metadata], [bytes]] = await Promise.all([
        file.getMetadata(),
        file.download({ validation: "crc32c" }),
      ]);
      const png = inspectPngBytes(bytes);
      const customMetadata = metadataRecord(metadata.metadata);
      const generation = String(metadata.generation ?? "");
      const crc32c = String(metadata.crc32c ?? "");
      const contentType = String(metadata.contentType ?? "");
      const byteLength = Number(metadata.size);
      if (
        !generation ||
        !crc32c ||
        !Number.isSafeInteger(byteLength) ||
        byteLength !== bytes.byteLength
      ) {
        throw new ObjectStorageError(
          "integrity",
          "Canonical artwork object metadata is incomplete.",
        );
      }
      return {
        objectKey,
        generation,
        contentType,
        crc32c,
        byteLength,
        contentHash: png.contentHash,
        pixelWidth: png.pixelWidth,
        pixelHeight: png.pixelHeight,
        metadata: customMetadata,
      };
    } catch (error) {
      throw storageFailure(
        error,
        "Canonical artwork verification is temporarily unavailable.",
        String(error).toLowerCase().includes("validation"),
      );
    }
  }

  async authorizeRead(input: {
    readonly objectKey: string;
    readonly generation: string;
    readonly expiresAt: Date;
  }): Promise<ObjectReadAuthorization> {
    try {
      const [url] = await this.bucket
        .file(input.objectKey, {
          generation: input.generation,
        })
        .getSignedUrl({
          version: "v4",
          action: "read",
          expires: input.expiresAt,
        });
      return { url, expiresAt: input.expiresAt };
    } catch (error) {
      throw storageFailure(
        error,
        "Canonical artwork read authorization is temporarily unavailable.",
      );
    }
  }
}
