import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ARTWORK_PROCESSING_VERSION,
  createLinkedArtworkConfiguration,
  hashArtworkBytes,
  type ProcessedArtwork,
} from "@/domain/artwork";
import {
  LOCAL_WORKSPACE_SCHEMA_VERSION,
  type LocalDesignWorkspace,
} from "@/domain/design";
import {
  GENERATION_SCHEMA_VERSION,
  type LocalConceptWorkspace,
} from "@/domain/generation";
import {
  ARTIFACT_BLOB_STORE,
  ARTIFACT_DATABASE_NAME,
  ARTIFACT_RECORD_STORE,
  getArtworkBlob,
  cleanupUnreferencedWorkspaceArtifacts,
  cleanupUnreferencedArtwork,
  openArtifactDatabase,
  storeArtworkArtifact,
  storeContentAddressedBlob,
  verifyArtworkAsset,
  verifyArtworkConfiguration,
} from "@/lib/browser/artifact-store";

const options = { indexedDB: fakeIndexedDB };

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(ARTIFACT_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function processed(): ProcessedArtwork {
  const sourceBlob = new NodeBlob(["source-svg"], {
    type: "image/svg+xml",
  }) as unknown as Blob;
  const renderedBlob = new NodeBlob(["rendered-png"], {
    type: "image/png",
  }) as unknown as Blob;
  const sourceContentHash = hashArtworkBytes(
    new TextEncoder().encode("source-svg"),
  );
  const renderContentHash = hashArtworkBytes(
    new TextEncoder().encode("rendered-png"),
  );
  return {
    sourceBlob,
    renderedBlob,
    warnings: [],
    asset: {
      assetId: "artwork-roundtrip",
      sourceContentHash,
      renderContentHash,
      originalFilename: "logo.svg",
      detectedMediaType: "image/svg+xml",
      sourceByteLength: sourceBlob.size,
      renderedByteLength: renderedBlob.size,
      pixelWidth: 800,
      pixelHeight: 400,
      hasAlpha: true,
      processingVersion: ARTWORK_PROCESSING_VERSION,
      svgSanitized: true,
      rasterization: "browser_canvas_png",
      createdAt: "2026-07-15T10:00:00.000Z",
      status: "ready",
    },
  };
}

beforeEach(async () => {
  await deleteDatabase();
});

describe("Phase 1F IndexedDB artifact store", () => {
  it("creates the required content-addressed stores", async () => {
    const opened = await openArtifactDatabase(options);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect([...opened.value.objectStoreNames]).toEqual([
      ARTIFACT_RECORD_STORE,
      ARTIFACT_BLOB_STORE,
    ]);
    opened.value.close();
  });

  it("writes blobs before metadata and verifies the round-trip hashes", async () => {
    const item = processed();
    const stored = await storeArtworkArtifact(item, options);
    expect(stored).toMatchObject({
      ok: true,
      value: { assetId: item.asset.assetId },
    });
    const verified = await verifyArtworkAsset(item.asset.assetId, options);
    expect(verified).toMatchObject({
      ok: true,
      value: {
        asset: {
          sourceContentHash: item.asset.sourceContentHash,
          renderContentHash: item.asset.renderContentHash,
        },
      },
    });
    const configuration = createLinkedArtworkConfiguration(item.asset);
    expect(await verifyArtworkConfiguration(configuration, options)).toEqual({
      ok: true,
      value: [
        item.asset.renderContentHash,
        item.asset.sourceContentHash,
      ].sort(),
    });
  });

  it("reports missing records and blobs without filename fallback", async () => {
    expect(await verifyArtworkAsset("missing", options)).toMatchObject({
      ok: false,
      error: { kind: "missing_record" },
    });
    expect(await getArtworkBlob("a".repeat(64), options)).toMatchObject({
      ok: false,
      error: { kind: "missing_blob" },
    });
  });

  it("detects a corrupt blob under a trusted-looking content key", async () => {
    const opened = await openArtifactDatabase(options);
    if (!opened.ok) throw new Error(opened.error.message);
    const transaction = opened.value.transaction(
      ARTIFACT_BLOB_STORE,
      "readwrite",
    );
    transaction.objectStore(ARTIFACT_BLOB_STORE).put({
      contentHash: "a".repeat(64),
      byteLength: 7,
      blob: new NodeBlob(["corrupt"]) as unknown as Blob,
    });
    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve();
    });
    opened.value.close();
    expect(await getArtworkBlob("a".repeat(64), options)).toMatchObject({
      ok: false,
      error: { kind: "corrupt_hash" },
    });
  });

  it("cleans only blobs excluded from an explicit proven reference set", async () => {
    const item = processed();
    const stored = await storeArtworkArtifact(item, options);
    expect(stored.ok).toBe(true);
    const cleanup = await cleanupUnreferencedArtwork(
      new Set([item.asset.renderContentHash]),
      options,
    );
    expect(cleanup).toEqual({ ok: true, value: 1 });
    expect(
      await getArtworkBlob(item.asset.renderContentHash, options),
    ).toMatchObject({
      ok: true,
    });
    expect(
      await getArtworkBlob(item.asset.sourceContentHash, options),
    ).toMatchObject({
      ok: false,
      error: { kind: "missing_blob" },
    });
  });

  it("shares content-addressed storage across Phase 1F artwork and Phase 1G history", async () => {
    const artwork = processed();
    expect((await storeArtworkArtifact(artwork, options)).ok).toBe(true);
    const conceptBytes = new TextEncoder().encode("generated-concept");
    const conceptHash = hashArtworkBytes(conceptBytes);
    expect(
      await storeContentAddressedBlob(
        {
          contentHash: conceptHash,
          blob: new NodeBlob([conceptBytes], {
            type: "image/png",
          }) as unknown as Blob,
        },
        options,
      ),
    ).toEqual({ ok: true, value: conceptHash });
    const cleanup = await cleanupUnreferencedArtwork(
      new Set([
        artwork.asset.sourceContentHash,
        artwork.asset.renderContentHash,
        conceptHash,
      ]),
      options,
    );
    expect(cleanup).toEqual({ ok: true, value: 0 });
    expect(
      await getArtworkBlob(artwork.asset.renderContentHash, options),
    ).toMatchObject({
      ok: true,
    });
    expect(await getArtworkBlob(conceptHash, options)).toMatchObject({
      ok: true,
    });
  });

  it("protects every Phase 1F workspace and Phase 1G history reference during cleanup", async () => {
    const artwork = processed();
    expect((await storeArtworkArtifact(artwork, options)).ok).toBe(true);
    const configuration = createLinkedArtworkConfiguration(artwork.asset);
    const designWorkspace = {
      schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
      draft: { intent: { artworkConfiguration: configuration } },
      revisions: [
        {
          snapshot: { configuration: { artworkConfiguration: configuration } },
        },
      ],
    } as unknown as LocalDesignWorkspace;

    const storedHashes = new Map<string, Uint8Array>();
    for (const value of [
      "reference-derivative",
      "initial-concept",
      "refinement-concept",
      "proven-orphan",
    ]) {
      const bytes = new TextEncoder().encode(value);
      const contentHash = hashArtworkBytes(bytes);
      storedHashes.set(value, bytes);
      expect(
        await storeContentAddressedBlob(
          {
            contentHash,
            blob: new NodeBlob([bytes], {
              type: "image/png",
            }) as unknown as Blob,
          },
          options,
        ),
      ).toEqual({ ok: true, value: contentHash });
    }
    const hash = (value: string) => hashArtworkBytes(storedHashes.get(value)!);
    const conceptWorkspace = {
      schemaVersion: GENERATION_SCHEMA_VERSION,
      requests: [
        {
          photoDerivative: { contentHash: hash("reference-derivative") },
        },
        { photoDerivative: null, kind: "refine" },
      ],
      concepts: [
        { contentHash: hash("initial-concept") },
        { contentHash: hash("refinement-concept") },
      ],
      selectedConceptId: "initial-concept-id",
      acceptedConceptId: "initial-concept-id",
    } as unknown as LocalConceptWorkspace;

    expect(
      await cleanupUnreferencedWorkspaceArtifacts(
        {
          designWorkspaces: [designWorkspace],
          conceptWorkspaces: [conceptWorkspace],
        },
        options,
      ),
    ).toEqual({ ok: true, value: 1 });
    for (const protectedHash of [
      artwork.asset.sourceContentHash,
      artwork.asset.renderContentHash,
      hash("reference-derivative"),
      hash("initial-concept"),
      hash("refinement-concept"),
    ]) {
      expect(await getArtworkBlob(protectedHash, options)).toMatchObject({
        ok: true,
      });
    }
    expect(await getArtworkBlob(hash("proven-orphan"), options)).toMatchObject({
      ok: false,
      error: { kind: "missing_blob" },
    });
  });

  it("rejects content-addressed writes when exact bytes do not match the key", async () => {
    expect(
      await storeContentAddressedBlob(
        {
          contentHash: "f".repeat(64),
          blob: new NodeBlob(["different"]) as unknown as Blob,
        },
        options,
      ),
    ).toMatchObject({ ok: false, error: { kind: "corrupt_hash" } });
  });

  it("returns quota and unavailable storage failures without writes", async () => {
    const item = processed();
    expect(
      await storeArtworkArtifact(item, {
        ...options,
        estimate: async () => ({ usage: 100, quota: 101 }),
      }),
    ).toMatchObject({ ok: false, error: { kind: "quota_exceeded" } });
    const original = globalThis.indexedDB;
    // @ts-expect-error exercising an unavailable browser capability
    delete globalThis.indexedDB;
    expect(await openArtifactDatabase()).toMatchObject({
      ok: false,
      error: { kind: "storage_unavailable" },
    });
    if (original)
      Object.defineProperty(globalThis, "indexedDB", { value: original });
  });
});
