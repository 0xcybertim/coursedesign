import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }

  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function stableHash(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(stableSerialize(value))));
}
