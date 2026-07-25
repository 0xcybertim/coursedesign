import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "@/server/db/migrations";
import {
  assertCourseDesignTestDatabaseUrl,
  migrateCourseDesignTestDatabase,
  resetCourseDesignTestSchema,
  TEST_MIGRATION_URL,
  withTestClient,
} from "../support/course-design-test-database";

const MIGRATIONS = [
  "0001_core_persistence.sql",
  "0002_revision_render_artwork.sql",
  "0003_runtime_migration_health.sql",
] as const;

beforeEach(async () => {
  await resetCourseDesignTestSchema();
});

afterAll(async () => {
  await resetCourseDesignTestSchema();
});

describe("Course Design forward-only migrations", () => {
  it("refuses cleanup against databases that are not explicitly tests", () => {
    expect(() =>
      assertCourseDesignTestDatabaseUrl("postgresql://localhost/colortune"),
    ).toThrow("must end in _test");
    expect(() =>
      assertCourseDesignTestDatabaseUrl(
        "postgresql://localhost/selfso-web-dev",
      ),
    ).toThrow("must end in _test");
  });

  it("applies the checked-in schema to a fresh database and reruns safely", async () => {
    expect(await migrateCourseDesignTestDatabase()).toEqual({
      applied: MIGRATIONS,
      alreadyApplied: [],
    });
    expect(await migrateCourseDesignTestDatabase()).toEqual({
      applied: [],
      alreadyApplied: MIGRATIONS,
    });

    await withTestClient(async (client) => {
      const result = await client.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
         ORDER BY table_name`,
      );
      expect(result.rows.map((row) => row.table_name)).toEqual([
        "artwork_assets",
        "course_design_migrations",
        "courses",
        "design_revisions",
        "designs",
        "operation_idempotency",
        "provisional_email_selectors",
        "provisional_sessions",
        "users",
        "workspace_memberships",
        "workspaces",
      ]);
    });
  });

  it("preserves an unrelated representative prior-schema fixture", async () => {
    await withTestClient(async (client) => {
      await client.query(
        `CREATE TABLE IF NOT EXISTS legacy_course_design_marker (
          value text PRIMARY KEY
        )`,
      );
      await client.query(
        `INSERT INTO legacy_course_design_marker (value)
         VALUES ('preserve-me')
         ON CONFLICT DO NOTHING`,
      );
    });
    await migrateCourseDesignTestDatabase();
    await withTestClient(async (client) => {
      expect(
        await client.query("SELECT value FROM legacy_course_design_marker"),
      ).toMatchObject({ rows: [{ value: "preserve-me" }] });
      await client.query("DROP TABLE legacy_course_design_marker");
    });
  });

  it("serializes concurrent migration attempts with one advisory lock", async () => {
    const results = await Promise.all([
      runMigrations({
        connectionString: TEST_MIGRATION_URL,
        advisoryLockId: 1129270605n,
        statementTimeoutMs: 30_000,
      }),
      runMigrations({
        connectionString: TEST_MIGRATION_URL,
        advisoryLockId: 1129270605n,
        statementTimeoutMs: 30_000,
      }),
    ]);
    expect(results.flatMap((result) => result.applied)).toEqual(MIGRATIONS);
    expect(results.flatMap((result) => result.alreadyApplied)).toEqual(
      MIGRATIONS,
    );
  });
});
