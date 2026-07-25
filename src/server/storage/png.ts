import { createHash } from "node:crypto";

import { ObjectStorageError } from "./object-storage";

const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectPngBytes(bytes: Uint8Array): {
  readonly contentHash: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
} {
  if (
    bytes.byteLength < 45 ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value) ||
    Buffer.from(bytes.subarray(12, 16)).toString("ascii") !== "IHDR"
  ) {
    throw new ObjectStorageError(
      "integrity",
      "The uploaded canonical derivative is not a valid PNG.",
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13) {
    throw new ObjectStorageError(
      "integrity",
      "The uploaded PNG has an invalid IHDR chunk.",
    );
  }
  const pixelWidth = view.getUint32(16);
  const pixelHeight = view.getUint32(20);
  if (pixelWidth < 1 || pixelHeight < 1) {
    throw new ObjectStorageError(
      "integrity",
      "The uploaded PNG has invalid dimensions.",
    );
  }
  let offset = 8;
  let foundEnd = false;
  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset);
    const dataEnd = offset + 8 + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > bytes.byteLength) {
      throw new ObjectStorageError(
        "integrity",
        "The uploaded PNG has a truncated chunk.",
      );
    }
    const expectedCrc = view.getUint32(dataEnd);
    const actualCrc = crc32(bytes.subarray(offset + 4, dataEnd));
    if (expectedCrc !== actualCrc) {
      throw new ObjectStorageError(
        "integrity",
        "The uploaded PNG has a corrupt chunk.",
      );
    }
    const type = Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString(
      "ascii",
    );
    offset = chunkEnd;
    if (type === "IEND") {
      foundEnd = length === 0 && offset === bytes.byteLength;
      break;
    }
  }
  if (!foundEnd) {
    throw new ObjectStorageError(
      "integrity",
      "The uploaded PNG has no valid end chunk.",
    );
  }
  return {
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    pixelWidth,
    pixelHeight,
  };
}
