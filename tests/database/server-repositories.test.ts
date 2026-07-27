import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ARTWORK_PROCESSING_VERSION,
  createLinkedArtworkConfiguration,
  type ArtworkAsset,
} from "@/domain/artwork";
import { placeCourseInstance, type CourseDraft } from "@/domain/course";
import {
  deriveProfileWingPrototype,
  updateLocalDraft,
  type ObstacleDraft,
} from "@/domain/design";
import {
  appendSilhouetteDecision,
  createEmptySilhouetteReview,
} from "@/domain/silhouette";
import {
  STARTER_COURSE_ROUTE_KEY,
  STARTER_DESIGN_ROUTE_KEY,
} from "@/persistence";
import type { ValidatedSessionContext } from "@/persistence/identity-service";
import {
  DatabaseCourseRepository,
  DatabaseDesignRepository,
} from "@/server/persistence";

import {
  migrateCourseDesignTestDatabase,
  createTestWorkspaceSession,
  TEST_MIGRATION_URL,
  truncateCourseDesignTestData,
  withTestClient,
} from "../support/course-design-test-database";

const T0 = new Date("2026-07-25T09:00:00.000Z");
const T1 = "2026-07-25T09:01:00.000Z";
let pool: Pool;
async function session(_email: string): Promise<ValidatedSessionContext> {
  void _email;
  return createTestWorkspaceSession(pool, T0);
}

function updateDraft(
  draft: ObstacleDraft,
  frameColor: "red" | "blue" | "green",
): ObstacleDraft {
  const result = updateLocalDraft(
    {
      schemaVersion: "1.0.0-phase1b",
      designId: "local-spj-04",
      draft,
      revisions: [],
    },
    { ...draft.intent, frameColor },
    T1,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value.draft;
}

function placeRevision(draft: CourseDraft, revisionId: string): CourseDraft {
  const placed = placeCourseInstance(draft, {
    instanceId: "instance-1",
    obstacleDesignRevisionId: revisionId,
    now: T1,
  });
  if (!placed.ok) throw new Error(placed.error.message);
  return placed.value;
}

beforeAll(async () => {
  await migrateCourseDesignTestDatabase();
  pool = new Pool({ connectionString: TEST_MIGRATION_URL, max: 12 });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateCourseDesignTestData();
});

describe("server design repository", () => {
  it("keeps detail and revision-page reads to one bounded query each", async () => {
    const context = await session("query-count@example.test");
    const countingPool = new Pool({
      connectionString: TEST_MIGRATION_URL,
      max: 1,
    });
    const mutablePool = countingPool as unknown as {
      query: (...args: unknown[]) => unknown;
    };
    const originalQuery = mutablePool.query.bind(countingPool);
    let queryCount = 0;
    mutablePool.query = (...args) => {
      queryCount += 1;
      return originalQuery(...args);
    };
    try {
      const repository = new DatabaseDesignRepository(countingPool, context);
      expect(
        await repository.loadDesign(STARTER_DESIGN_ROUTE_KEY),
      ).toMatchObject({ ok: true });
      expect(queryCount).toBe(1);
      queryCount = 0;
      expect(await repository.listRevisions({ limit: 25 })).toMatchObject({
        ok: true,
      });
      expect(queryCount).toBe(1);
    } finally {
      await countingPool.end();
    }
  });

  it("validates JSONB reads and uses database compare-and-swap", async () => {
    const context = await session("design@example.test");
    const repository = new DatabaseDesignRepository(pool, context, {
      now: () => new Date(T1),
    });
    const initial = await repository.loadDesign(STARTER_DESIGN_ROUTE_KEY);
    if (!initial.ok) throw new Error(initial.error.message);
    const attempted = updateDraft(initial.value.draft, "red");
    const saved = await repository.saveDraft({
      routeKey: STARTER_DESIGN_ROUTE_KEY,
      expectedLockVersion: initial.value.lockVersion,
      draft: attempted,
    });
    expect(saved).toMatchObject({
      ok: true,
      value: {
        lockVersion: 2,
        draft: { draftVersion: 2, intent: { frameColor: "red" } },
      },
    });

    const staleAttempt = updateDraft(initial.value.draft, "blue");
    const stale = await repository.saveDraft({
      routeKey: STARTER_DESIGN_ROUTE_KEY,
      expectedLockVersion: initial.value.lockVersion,
      draft: staleAttempt,
    });
    expect(stale).toMatchObject({
      ok: false,
      error: {
        kind: "stale_version",
        expectedLockVersion: 1,
        actualLockVersion: 2,
        latest: { draft: { intent: { frameColor: "red" } } },
      },
    });
    expect(await repository.loadDesign(STARTER_DESIGN_ROUTE_KEY)).toMatchObject(
      {
        ok: true,
        value: { draft: { intent: { frameColor: "red" } } },
      },
    );
  });

  it("allows exactly one of two simultaneous mutable saves", async () => {
    const context = await session("design-race@example.test");
    const repository = new DatabaseDesignRepository(pool, context, {
      now: () => new Date(T1),
    });
    const initial = await repository.loadDesign(STARTER_DESIGN_ROUTE_KEY);
    if (!initial.ok) throw new Error(initial.error.message);
    const results = await Promise.all([
      repository.saveDraft({
        routeKey: STARTER_DESIGN_ROUTE_KEY,
        expectedLockVersion: 1,
        draft: updateDraft(initial.value.draft, "red"),
      }),
      repository.saveDraft({
        routeKey: STARTER_DESIGN_ROUTE_KEY,
        expectedLockVersion: 1,
        draft: updateDraft(initial.value.draft, "blue"),
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.ok && result.error.kind === "stale_version",
      ),
    ).toHaveLength(1);
  });

  it("appends concurrent immutable revisions with unique ordered ordinals", async () => {
    const context = await session("revisions@example.test");
    const repository = new DatabaseDesignRepository(pool, context, {
      now: () => new Date(T1),
    });
    const results = await Promise.all([
      repository.appendStarterRevision({
        routeKey: STARTER_DESIGN_ROUTE_KEY,
        expectedLockVersion: 1,
        idempotencyKey: "revision-request-a",
        referencedRenderableArtworkHashes: [],
      }),
      repository.appendStarterRevision({
        routeKey: STARTER_DESIGN_ROUTE_KEY,
        expectedLockVersion: 1,
        idempotencyKey: "revision-request-b",
        referencedRenderableArtworkHashes: [],
      }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(
      results
        .filter((result) => result.ok)
        .map((result) => result.value.revision.ordinal)
        .sort(),
    ).toEqual([1, 2]);
    const hashes = results
      .filter((result) => result.ok)
      .map((result) => result.value.revision.configurationHash);
    expect(new Set(hashes).size).toBe(1);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("makes revision retries idempotent without suppressing equal configurations", async () => {
    const context = await session("idempotency@example.test");
    const repository = new DatabaseDesignRepository(pool, context, {
      now: () => new Date(T1),
    });
    const request = {
      routeKey: STARTER_DESIGN_ROUTE_KEY,
      expectedLockVersion: 1,
      idempotencyKey: "same-revision-request",
      referencedRenderableArtworkHashes: [],
    } as const;
    const first = await repository.appendStarterRevision(request);
    const retried = await repository.appendStarterRevision(request);
    expect(first.ok && retried.ok).toBe(true);
    if (!first.ok || !retried.ok) return;
    expect(retried.value.revision.revisionId).toBe(
      first.value.revision.revisionId,
    );
    await withTestClient(async (client) => {
      expect(
        await client.query("SELECT id FROM design_revisions"),
      ).toMatchObject({ rowCount: 1 });
    });
  });

  it("requires only exact available canonical derivatives, never raw sources", async () => {
    const context = await session("artwork@example.test");
    const repository = new DatabaseDesignRepository(pool, context, {
      now: () => new Date(T1),
    });
    const initial = await repository.loadDesign(STARTER_DESIGN_ROUTE_KEY);
    if (!initial.ok) throw new Error(initial.error.message);
    const asset: ArtworkAsset = {
      assetId: "local-artwork",
      sourceContentHash: "a".repeat(64),
      renderContentHash: "b".repeat(64),
      originalFilename: "local-only-source.svg",
      detectedMediaType: "image/svg+xml",
      sourceByteLength: 500,
      renderedByteLength: 1_000,
      pixelWidth: 800,
      pixelHeight: 400,
      hasAlpha: true,
      processingVersion: ARTWORK_PROCESSING_VERSION,
      svgSanitized: true,
      rasterization: "browser_canvas_png",
      createdAt: T1,
      status: "ready",
    };
    const updated = updateLocalDraft(
      {
        schemaVersion: "1.0.0-phase1b",
        designId: "local-spj-04",
        draft: initial.value.draft,
        revisions: [],
      },
      {
        ...initial.value.draft.intent,
        artwork: "custom_artwork",
        artworkConfiguration: createLinkedArtworkConfiguration(asset),
      },
      T1,
    );
    if (!updated.ok) throw new Error(updated.error.message);
    const saved = await repository.saveDraft({
      routeKey: STARTER_DESIGN_ROUTE_KEY,
      expectedLockVersion: 1,
      draft: updated.value.draft,
    });
    if (!saved.ok) throw new Error(saved.error.message);

    expect(
      await repository.appendStarterRevision({
        routeKey: STARTER_DESIGN_ROUTE_KEY,
        expectedLockVersion: saved.value.lockVersion,
        idempotencyKey: "missing-canonical-artwork",
        referencedRenderableArtworkHashes: [asset.renderContentHash],
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "asset_unavailable" },
    });

    await withTestClient(async (client) => {
      await client.query(
        `INSERT INTO artwork_assets (
           workspace_id, content_hash, crc32c, detected_media_type,
           byte_length, pixel_width, pixel_height, bucket, object_key,
           object_generation, state
         )
         VALUES ($1, $2, 'crc32c', 'image/png', 1000, 800, 400,
           'test-bucket', $3, '1', 'available')`,
        [
          context.workspaceId,
          asset.renderContentHash,
          `workspaces/${context.workspaceId}/sha256/${asset.renderContentHash}`,
        ],
      );
    });
    expect(
      await repository.appendStarterRevision({
        routeKey: STARTER_DESIGN_ROUTE_KEY,
        expectedLockVersion: saved.value.lockVersion,
        idempotencyKey: "available-canonical-artwork",
        referencedRenderableArtworkHashes: [asset.renderContentHash],
      }),
    ).toMatchObject({ ok: true });
    await withTestClient(async (client) => {
      const assets = await client.query<{ content_hash: string }>(
        "SELECT content_hash FROM artwork_assets",
      );
      expect(assets.rows).toEqual([{ content_hash: asset.renderContentHash }]);
    });
  });

  it("reports corrupt JSONB without rewriting the row", async () => {
    const context = await session("corrupt@example.test");
    const repository = new DatabaseDesignRepository(pool, context);
    await withTestClient(async (client) => {
      await client.query(
        "UPDATE designs SET draft_snapshot = '{\"corrupt\":true}'::jsonb WHERE workspace_id = $1",
        [context.workspaceId],
      );
    });
    expect(await repository.loadDesign(STARTER_DESIGN_ROUTE_KEY)).toMatchObject(
      { ok: false, error: { kind: "corrupt_record" } },
    );
    await withTestClient(async (client) => {
      expect(
        await client.query(
          "SELECT draft_snapshot FROM designs WHERE workspace_id = $1",
          [context.workspaceId],
        ),
      ).toMatchObject({
        rows: [{ draft_snapshot: { corrupt: true } }],
      });
    });
  });

  it("uses stable bounded cursor pagination", async () => {
    const context = await session("pagination@example.test");
    const repository = new DatabaseDesignRepository(pool, context, {
      now: () => new Date(T1),
    });
    for (const key of [
      "revision-page-a",
      "revision-page-b",
      "revision-page-c",
    ]) {
      const result = await repository.appendStarterRevision({
        routeKey: STARTER_DESIGN_ROUTE_KEY,
        expectedLockVersion: 1,
        idempotencyKey: key,
        referencedRenderableArtworkHashes: [],
      });
      if (!result.ok) throw new Error(result.error.message);
    }
    const first = await repository.listRevisions({ limit: 2 });
    if (!first.ok) throw new Error(first.error.message);
    expect(first.value.revisions).toHaveLength(2);
    expect(first.value.nextCursor).not.toBeNull();
    const second = await repository.listRevisions({
      limit: 2,
      cursor: first.value.nextCursor ?? undefined,
    });
    if (!second.ok) throw new Error(second.error.message);
    expect(second.value.revisions).toHaveLength(1);
    expect(
      new Set([
        ...first.value.revisions.map((revision) => revision.revisionId),
        ...second.value.revisions.map((revision) => revision.revisionId),
      ]).size,
    ).toBe(3);
  });
});

describe("final Profile Wing server boundary", () => {
  it("appends exactly one immutable revision only after canonical artwork is available", async () => {
    const context = await session("profile@example.test");
    const repository = new DatabaseDesignRepository(pool, context, {
      now: () => new Date(T1),
    });
    const decision = appendSilhouetteDecision(
      createEmptySilhouetteReview(T0.toISOString()),
      {
        decisionId: "decision-server-profile",
        fixtureId: "clean-dog-side",
        action: "accepted_for_future_prototyping",
        createdAt: T1,
      },
    );
    if (!decision.ok) throw new Error(decision.error.message);
    const derived = deriveProfileWingPrototype({
      review: decision.value,
      fixtureId: "clean-dog-side",
    });
    if (!derived.ok) throw new Error(derived.error.message);
    const canonicalRenderHash = "e".repeat(64);
    const input = {
      idempotencyKey: "final-profile-wing-001",
      prototype: derived.value,
      canonicalRenderHash,
    };

    expect(
      await repository.appendFinalProfileWingRevision(input),
    ).toMatchObject({ ok: false, error: { kind: "asset_unavailable" } });
    await withTestClient(async (client) => {
      await client.query(
        `INSERT INTO artwork_assets (
          workspace_id, content_hash, crc32c, detected_media_type, byte_length,
          pixel_width, pixel_height, bucket, object_key, object_generation, state
        ) VALUES ($1, $2, 'ImIEBA==', 'image/png', 2048, 1024, 1024,
          'course-design-test-private', $3, 'profile-generation', 'available')`,
        [
          context.workspaceId,
          canonicalRenderHash,
          `workspaces/${context.workspaceId}/sha256/${canonicalRenderHash}`,
        ],
      );
    });

    const saved = await repository.appendFinalProfileWingRevision(input);
    const repeated = await repository.appendFinalProfileWingRevision(input);
    expect(saved).toMatchObject({
      ok: true,
      value: {
        designId: "local-profile-wing-clean-dog-side",
        familyId: "profile-wing-vertical-v1",
        ordinal: 1,
      },
    });
    expect(repeated).toEqual(saved);
    const page = await repository.listRevisions();
    expect(page).toMatchObject({
      ok: true,
      value: {
        revisions: [
          {
            designId: "local-profile-wing-clean-dog-side",
            ordinal: 1,
          },
        ],
      },
    });
    await withTestClient(async (client) => {
      const rows = await client.query<{
        render_artwork_hashes: string[];
      }>(
        "SELECT render_artwork_hashes FROM design_revisions WHERE workspace_id = $1",
        [context.workspaceId],
      );
      expect(rows.rows).toEqual([
        { render_artwork_hashes: [canonicalRenderHash] },
      ]);
    });
  });
});

describe("server course repository", () => {
  it("pins exact same-workspace revisions and uses compare-and-swap", async () => {
    const context = await session("course@example.test");
    const designs = new DatabaseDesignRepository(pool, context, {
      now: () => new Date(T1),
    });
    const revision = await designs.appendStarterRevision({
      routeKey: STARTER_DESIGN_ROUTE_KEY,
      expectedLockVersion: 1,
      idempotencyKey: "course-pinned-revision",
      referencedRenderableArtworkHashes: [],
    });
    if (!revision.ok) throw new Error(revision.error.message);
    const courses = new DatabaseCourseRepository(pool, context, {
      now: () => new Date(T1),
    });
    const initial = await courses.loadCourse(STARTER_COURSE_ROUTE_KEY);
    if (!initial.ok) throw new Error(initial.error.message);
    const draft = placeRevision(
      initial.value.draft,
      revision.value.revision.revisionId,
    );
    expect(
      await courses.saveCourse({
        routeKey: STARTER_COURSE_ROUTE_KEY,
        expectedLockVersion: 1,
        draft,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        lockVersion: 2,
        draft: {
          instances: [
            {
              obstacleDesignRevisionId: revision.value.revision.revisionId,
            },
          ],
        },
      },
    });
    expect(
      await courses.saveCourse({
        routeKey: STARTER_COURSE_ROUTE_KEY,
        expectedLockVersion: 1,
        draft,
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "stale_version", actualLockVersion: 2 },
    });
  });

  it("rejects exact foreign-workspace revision identifiers atomically", async () => {
    const firstContext = await session("course-a@example.test");
    const secondContext = await session("course-b@example.test");
    const firstDesigns = new DatabaseDesignRepository(pool, firstContext, {
      now: () => new Date(T1),
    });
    const revision = await firstDesigns.appendStarterRevision({
      routeKey: STARTER_DESIGN_ROUTE_KEY,
      expectedLockVersion: 1,
      idempotencyKey: "foreign-course-revision",
      referencedRenderableArtworkHashes: [],
    });
    if (!revision.ok) throw new Error(revision.error.message);

    const secondCourses = new DatabaseCourseRepository(pool, secondContext, {
      now: () => new Date(T1),
    });
    const initial = await secondCourses.loadCourse(STARTER_COURSE_ROUTE_KEY);
    if (!initial.ok) throw new Error(initial.error.message);
    const attempted = placeRevision(
      initial.value.draft,
      revision.value.revision.revisionId,
    );
    expect(
      await secondCourses.saveCourse({
        routeKey: STARTER_COURSE_ROUTE_KEY,
        expectedLockVersion: 1,
        draft: attempted,
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "missing_reference" },
    });
    expect(
      await secondCourses.loadCourse(STARTER_COURSE_ROUTE_KEY),
    ).toMatchObject({
      ok: true,
      value: { lockVersion: 1, draft: { instances: [] } },
    });
  });

  it("rejects browser-local revision identifiers in server mode", async () => {
    const context = await session("course-local-id@example.test");
    const courses = new DatabaseCourseRepository(pool, context);
    const initial = await courses.loadCourse(STARTER_COURSE_ROUTE_KEY);
    if (!initial.ok) throw new Error(initial.error.message);
    expect(
      await courses.saveCourse({
        routeKey: STARTER_COURSE_ROUTE_KEY,
        expectedLockVersion: 1,
        draft: placeRevision(initial.value.draft, "revision-browser-local"),
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "missing_reference" },
    });
  });
});
