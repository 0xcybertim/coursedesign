import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type {
  CanonicalArtworkUploadInput,
  ValidatedSessionContext,
} from "@/persistence";
import { DatabaseArtworkRepository } from "@/server/persistence";
import { FakePrivateObjectStorage } from "@/server/storage/fake-object-storage";
import type { StoredObjectInspection } from "@/server/storage/object-storage";

import {
  migrateCourseDesignTestDatabase,
  createTestWorkspaceSession,
  TEST_MIGRATION_URL,
  truncateCourseDesignTestData,
  withTestClient,
} from "../support/course-design-test-database";

const NOW = new Date("2026-07-25T10:00:00.000Z");
const HASH = "a".repeat(64);
const CRC32C = "ImIEBA==";
const DESCRIPTOR: CanonicalArtworkUploadInput = {
  purpose: "canonical_render_derivative",
  contentHash: HASH,
  crc32c: CRC32C,
  byteLength: 4096,
  mediaType: "image/png",
  pixelWidth: 1024,
  pixelHeight: 512,
};
const CONFIG = {
  gcs: {
    projectId: "course-design-test",
    bucket: "course-design-test-private",
    location: "europe-west3" as const,
    clientEmail: "test@example.test",
    privateKey: "not-used-by-fake",
  },
  artwork: {
    canonicalMaxBytes: 10 * 1024 * 1024,
    canonicalMaxWidthPx: 2048,
    canonicalMaxHeightPx: 2048,
    allowedContentTypes: ["image/png"] as const,
    signedUrlTtlSeconds: 300,
  },
};

let pool: Pool;
async function session(_email: string): Promise<ValidatedSessionContext> {
  void _email;
  return createTestWorkspaceSession(pool, NOW);
}

function inspection(
  workspaceId: string,
  overrides: Partial<StoredObjectInspection> = {},
): StoredObjectInspection {
  return {
    objectKey: `workspaces/${workspaceId}/sha256/${HASH}`,
    generation: "1735732800000000",
    contentType: "image/png",
    crc32c: CRC32C,
    byteLength: 4096,
    contentHash: HASH,
    pixelWidth: 1024,
    pixelHeight: 512,
    metadata: {
      sha256: HASH,
      "canonical-purpose": "render-derivative",
      "byte-length": "4096",
      "pixel-width": "1024",
      "pixel-height": "512",
    },
    ...overrides,
  };
}

beforeAll(async () => {
  await migrateCourseDesignTestDatabase();
  pool = new Pool({ connectionString: TEST_MIGRATION_URL, max: 8 });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateCourseDesignTestData();
});

describe("server artwork repository", () => {
  it("authorizes only an exact workspace-scoped canonical PUT", async () => {
    const context = await session("artwork-a@example.test");
    const storage = new FakePrivateObjectStorage();
    const repository = new DatabaseArtworkRepository(
      pool,
      context,
      storage,
      CONFIG,
      { now: () => NOW },
    );

    const result = await repository.beginCanonicalUpload(DESCRIPTOR);

    expect(result).toMatchObject({
      ok: true,
      value: {
        contentHash: HASH,
        state: "upload_required",
        expiresAt: "2026-07-25T10:05:00.000Z",
        requiredHeaders: {
          "content-type": "image/png",
          "x-goog-hash": `crc32c=${CRC32C}`,
          "x-goog-meta-canonical-purpose": "render-derivative",
          "x-goog-meta-sha256": HASH,
        },
      },
    });
    expect(storage.uploadRequests).toEqual([
      expect.objectContaining({
        objectKey: `workspaces/${context.workspaceId}/sha256/${HASH}`,
        contentHash: HASH,
        contentType: "image/png",
      }),
    ]);
    expect(
      await repository.beginCanonicalUpload({
        ...DESCRIPTOR,
        purpose: "raw_source" as never,
      }),
    ).toMatchObject({ ok: false, error: { kind: "validation" } });
  });

  it("finalizes only byte-verified metadata and makes retries idempotent", async () => {
    const context = await session("artwork-a@example.test");
    const storage = new FakePrivateObjectStorage();
    const repository = new DatabaseArtworkRepository(
      pool,
      context,
      storage,
      CONFIG,
      { now: () => NOW },
    );
    await repository.beginCanonicalUpload(DESCRIPTOR);
    storage.objects.set(
      `workspaces/${context.workspaceId}/sha256/${HASH}`,
      inspection(context.workspaceId),
    );

    const finalized = await repository.finalizeCanonicalUpload(HASH);
    const repeatedFinalize = await repository.finalizeCanonicalUpload(HASH);
    const repeatedBegin = await repository.beginCanonicalUpload(DESCRIPTOR);

    expect(finalized).toMatchObject({
      ok: true,
      value: {
        contentHash: HASH,
        state: "available",
        generation: "1735732800000000",
      },
    });
    expect(repeatedFinalize).toEqual(finalized);
    expect(repeatedBegin).toEqual({
      ok: true,
      value: { contentHash: HASH, state: "already_available" },
    });
    expect(storage.uploadRequests).toHaveLength(1);
    const renderable = await repository.getRenderable(HASH);
    expect(renderable).toMatchObject({
      ok: true,
      value: {
        contentHash: HASH,
        expiresAt: "2026-07-25T10:05:00.000Z",
      },
    });
    expect(storage.readRequests).toEqual([
      {
        objectKey: `workspaces/${context.workspaceId}/sha256/${HASH}`,
        generation: "1735732800000000",
        expiresAt: new Date("2026-07-25T10:05:00.000Z"),
      },
    ]);
  });

  it("does not make checksum, hash, dimension, or metadata mismatches available", async () => {
    const context = await session("artwork-a@example.test");
    const storage = new FakePrivateObjectStorage();
    const repository = new DatabaseArtworkRepository(
      pool,
      context,
      storage,
      CONFIG,
      { now: () => NOW },
    );
    await repository.beginCanonicalUpload(DESCRIPTOR);
    storage.objects.set(
      `workspaces/${context.workspaceId}/sha256/${HASH}`,
      inspection(context.workspaceId, { crc32c: "AAAAAA==" }),
    );

    expect(await repository.finalizeCanonicalUpload(HASH)).toMatchObject({
      ok: false,
      error: { kind: "asset_unavailable" },
    });
    expect(await repository.verifyAvailable([HASH])).toMatchObject({
      ok: false,
      error: { kind: "asset_unavailable" },
    });
    await withTestClient(async (client) => {
      const result = await client.query<{ state: string }>(
        "SELECT state FROM artwork_assets WHERE workspace_id = $1",
        [context.workspaceId],
      );
      expect(result.rows).toEqual([{ state: "failed" }]);
    });
  });

  it("isolates identical hashes and reads by server-derived workspace", async () => {
    const contextA = await session("artwork-a@example.test");
    const contextB = await session("artwork-b@example.test");
    const storage = new FakePrivateObjectStorage();
    const repositoryA = new DatabaseArtworkRepository(
      pool,
      contextA,
      storage,
      CONFIG,
      { now: () => NOW },
    );
    const repositoryB = new DatabaseArtworkRepository(
      pool,
      contextB,
      storage,
      CONFIG,
      { now: () => NOW },
    );
    await repositoryA.beginCanonicalUpload(DESCRIPTOR);
    storage.objects.set(
      `workspaces/${contextA.workspaceId}/sha256/${HASH}`,
      inspection(contextA.workspaceId),
    );
    await repositoryA.finalizeCanonicalUpload(HASH);

    expect(await repositoryB.verifyAvailable([HASH])).toMatchObject({
      ok: false,
      error: { kind: "asset_unavailable" },
    });
    const uploadB = await repositoryB.beginCanonicalUpload(DESCRIPTOR);
    expect(uploadB).toMatchObject({
      ok: true,
      value: { state: "upload_required" },
    });
    expect(storage.uploadRequests.at(-1)?.objectKey).toBe(
      `workspaces/${contextB.workspaceId}/sha256/${HASH}`,
    );
  });
});
