import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { inspectPngBytes } from "@/server/storage/png";
import { crc32cBase64 } from "@/lib/browser/persistence-api";

describe("object storage boundary", () => {
  it("uses the canonical CRC32C representation expected by GCS", () => {
    expect(crc32cBase64(new TextEncoder().encode("123456789"))).toBe(
      "4waSgw==",
    );
  });

  it("derives content identity and dimensions from uploaded PNG bytes", () => {
    const bytes = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    expect(inspectPngBytes(bytes)).toEqual({
      contentHash:
        "431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460",
      pixelWidth: 1,
      pixelHeight: 1,
    });
    expect(() => inspectPngBytes(Uint8Array.from([1, 2, 3]))).toThrow(
      "not a valid PNG",
    );
  });

  it("keeps provider SDK imports out of persistence ports and UI", async () => {
    const sources = await Promise.all([
      readFile("src/persistence/artwork-repository.ts", "utf8"),
      readFile("src/persistence/browser/browser-artwork-repository.ts", "utf8"),
      readFile("src/components/auth/AuthenticationPanel.tsx", "utf8"),
    ]);
    expect(sources.join("\n")).not.toContain("@google-cloud/storage");
  });
});
