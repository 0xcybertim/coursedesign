import "server-only";

import { randomUUID } from "node:crypto";

import {
  ObjectStorageError,
  type ObjectReadAuthorization,
  type ObjectUploadAuthorization,
  type ObjectUploadRequest,
  type PrivateObjectStorage,
  type StoredObjectInspection,
} from "./object-storage";
import { inspectPngBytes } from "./png";

function crc32cBase64(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0x82f63b78 & mask);
    }
  }
  const value = (crc ^ 0xffffffff) >>> 0;
  return Buffer.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]).toString("base64");
}

function expectedHeaders(request: ObjectUploadRequest) {
  return {
    "content-type": request.contentType,
    "x-goog-hash": `crc32c=${request.crc32c}`,
    "x-goog-meta-byte-length": String(request.byteLength),
    "x-goog-meta-canonical-purpose": "render-derivative",
    "x-goog-meta-pixel-height": String(request.pixelHeight),
    "x-goog-meta-pixel-width": String(request.pixelWidth),
    "x-goog-meta-sha256": request.contentHash,
  };
}

export class LocalHttpFakeObjectStorage implements PrivateObjectStorage {
  private readonly uploadAuthorizations = new Map<
    string,
    ObjectUploadRequest
  >();
  private readonly readAuthorizations = new Map<
    string,
    {
      readonly objectKey: string;
      readonly generation: string;
      readonly expiresAt: Date;
    }
  >();
  private readonly objects = new Map<
    string,
    { readonly bytes: Uint8Array; readonly inspection: StoredObjectInspection }
  >();
  private generation = 0;

  async authorizeUpload(
    request: ObjectUploadRequest,
  ): Promise<ObjectUploadAuthorization> {
    const token = randomUUID();
    this.uploadAuthorizations.set(token, request);
    return {
      url: `/api/local-fake-storage/${token}`,
      expiresAt: request.expiresAt,
      requiredHeaders: expectedHeaders(request),
    };
  }

  async acceptUpload(input: {
    readonly token: string;
    readonly headers: Headers;
    readonly bytes: Uint8Array;
  }): Promise<"stored" | "precondition_failed"> {
    const request = this.uploadAuthorizations.get(input.token);
    this.uploadAuthorizations.delete(input.token);
    if (!request || request.expiresAt.getTime() <= Date.now()) {
      throw new ObjectStorageError(
        "missing",
        "The local upload authorization is invalid or expired.",
      );
    }
    if (this.objects.has(request.objectKey)) return "precondition_failed";
    for (const [name, value] of Object.entries(expectedHeaders(request))) {
      if (input.headers.get(name) !== value) {
        throw new ObjectStorageError(
          "integrity",
          "The local upload headers do not match the authorization.",
        );
      }
    }
    const png = inspectPngBytes(input.bytes);
    const crc32c = crc32cBase64(input.bytes);
    if (
      png.contentHash !== request.contentHash ||
      png.pixelWidth !== request.pixelWidth ||
      png.pixelHeight !== request.pixelHeight ||
      input.bytes.byteLength !== request.byteLength ||
      crc32c !== request.crc32c
    ) {
      throw new ObjectStorageError(
        "integrity",
        "The local uploaded bytes failed integrity verification.",
      );
    }
    this.generation += 1;
    const generation = String(this.generation);
    this.objects.set(request.objectKey, {
      bytes: input.bytes,
      inspection: {
        objectKey: request.objectKey,
        generation,
        contentType: "image/png",
        crc32c,
        byteLength: input.bytes.byteLength,
        contentHash: png.contentHash,
        pixelWidth: png.pixelWidth,
        pixelHeight: png.pixelHeight,
        metadata: {
          sha256: request.contentHash,
          "canonical-purpose": "render-derivative",
          "byte-length": String(request.byteLength),
          "pixel-width": String(request.pixelWidth),
          "pixel-height": String(request.pixelHeight),
        },
      },
    });
    return "stored";
  }

  async inspect(objectKey: string): Promise<StoredObjectInspection> {
    const object = this.objects.get(objectKey);
    if (!object)
      throw new ObjectStorageError("missing", "The object is missing.");
    return object.inspection;
  }

  async authorizeRead(input: {
    readonly objectKey: string;
    readonly generation: string;
    readonly expiresAt: Date;
  }): Promise<ObjectReadAuthorization> {
    const object = this.objects.get(input.objectKey);
    if (!object || object.inspection.generation !== input.generation) {
      throw new ObjectStorageError("missing", "The object is missing.");
    }
    const token = randomUUID();
    this.readAuthorizations.set(token, input);
    return {
      url: `/api/local-fake-storage/${token}`,
      expiresAt: input.expiresAt,
    };
  }

  read(
    token: string,
  ): { readonly bytes: Uint8Array; readonly contentType: string } | null {
    const authorization = this.readAuthorizations.get(token);
    if (!authorization || authorization.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    const object = this.objects.get(authorization.objectKey);
    if (!object || object.inspection.generation !== authorization.generation) {
      return null;
    }
    return {
      bytes: object.bytes,
      contentType: object.inspection.contentType,
    };
  }
}
