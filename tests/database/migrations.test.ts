import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  "0004_authentication_foundation.sql",
  "0005_retire_unverified_workspaces.sql",
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
        "auth_audit_events",
        "auth_identities",
        "auth_revoked_provider_sessions",
        "auth_session_observations",
        "auth_webhook_events",
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

  it("can stop at the additive authentication foundation before the retirement cutover", async () => {
    expect(
      await runMigrations({
        connectionString: TEST_MIGRATION_URL,
        advisoryLockId: 1129270605n,
        statementTimeoutMs: 30_000,
        throughFilename: "0004_authentication_foundation.sql",
      }),
    ).toEqual({
      applied: MIGRATIONS.slice(0, 4),
      alreadyApplied: [],
    });
    expect(
      await runMigrations({
        connectionString: TEST_MIGRATION_URL,
        advisoryLockId: 1129270605n,
        statementTimeoutMs: 30_000,
      }),
    ).toEqual({
      applied: ["0005_retire_unverified_workspaces.sql"],
      alreadyApplied: MIGRATIONS.slice(0, 4),
    });
  });

  it("retires every legacy selector workspace without deleting immutable records", async () => {
    await withTestClient(async (client) => {
      for (const filename of [MIGRATIONS[0], MIGRATIONS[1], MIGRATIONS[3]]) {
        await client.query(
          await readFile(resolve("drizzle", "migrations", filename), "utf8"),
        );
      }
      const seeded = await client.query<{
        user_id: string;
        workspace_id: string;
      }>(`
        WITH new_user AS (
          INSERT INTO users DEFAULT VALUES RETURNING id
        ),
        new_workspace AS (
          INSERT INTO workspaces (display_name)
          VALUES ('Legacy public test workspace')
          RETURNING id
        ),
        new_membership AS (
          INSERT INTO workspace_memberships (workspace_id, user_id)
          SELECT new_workspace.id, new_user.id
          FROM new_workspace, new_user
          RETURNING workspace_id, user_id
        )
        INSERT INTO provisional_email_selectors (
          workspace_id, user_id, email_normalized
        )
        SELECT workspace_id, user_id, 'legacy-public@example.test'
        FROM new_membership
        RETURNING workspace_id, user_id
      `);
      const { user_id: userId, workspace_id: workspaceId } = seeded.rows[0]!;
      await client.query(
        `INSERT INTO provisional_sessions (
          workspace_id, user_id, token_digest, expires_at
        )
        VALUES ($1, $2, $3, now() + interval '30 days')`,
        [workspaceId, userId, "a".repeat(64)],
      );
      await client.query(`
        WITH new_user AS (
          INSERT INTO users DEFAULT VALUES RETURNING id
        ),
        new_workspace AS (
          INSERT INTO workspaces (display_name)
          VALUES ('Already disabled legacy workspace')
          RETURNING id
        ),
        new_membership AS (
          INSERT INTO workspace_memberships (workspace_id, user_id)
          SELECT new_workspace.id, new_user.id
          FROM new_workspace, new_user
          RETURNING workspace_id, user_id
        )
        INSERT INTO provisional_email_selectors (
          workspace_id, user_id, email_normalized, status
        )
        SELECT
          workspace_id,
          user_id,
          'already-disabled@example.test',
          'disabled'
        FROM new_membership
      `);
      const design = await client.query<{ id: string }>(
        `INSERT INTO designs (
          workspace_id, legacy_route_key, family_id, display_name,
          draft_snapshot, domain_schema_version
        )
        VALUES ($1, 'legacy-design', 'legacy-family', 'Legacy design',
          '{}'::jsonb, 'legacy')
        RETURNING id`,
        [workspaceId],
      );
      await client.query(
        `INSERT INTO design_revisions (
          workspace_id, design_id, ordinal, name, configuration_hash,
          domain_schema_version, snapshot
        )
        VALUES ($1, $2, 1, 'Immutable legacy revision', $3, 'legacy',
          '{}'::jsonb)`,
        [workspaceId, design.rows[0]!.id, "b".repeat(64)],
      );
      await client.query(
        await readFile(
          resolve(
            "drizzle",
            "migrations",
            "0005_retire_unverified_workspaces.sql",
          ),
          "utf8",
        ),
      );
      const state = await client.query<{
        selector_email: string;
        selector_status: string;
        plaintext_selectors: number;
        anonymized_selectors: number;
        runtime_can_read_selectors: boolean;
        runtime_can_read_sessions: boolean;
        revoked: boolean;
        retirement_reason: string;
        revisions: string;
      }>(
        `SELECT
          (SELECT email_normalized FROM provisional_email_selectors
            WHERE workspace_id = $1) AS selector_email,
          (SELECT status FROM provisional_email_selectors
            WHERE workspace_id = $1) AS selector_status,
          (SELECT count(*)::int
           FROM provisional_email_selectors
           WHERE email_normalized IN (
             'legacy-public@example.test',
             'already-disabled@example.test'
           )) AS plaintext_selectors,
          (SELECT count(*)::int
           FROM provisional_email_selectors
           WHERE email_normalized
             ~ '^retired\\+[0-9a-f]{64}@invalid\\.example$'
          ) AS anonymized_selectors,
          has_table_privilege(
            'coursedesign_runtime',
            'provisional_email_selectors',
            'SELECT'
          ) AS runtime_can_read_selectors,
          has_table_privilege(
            'coursedesign_runtime',
            'provisional_sessions',
            'SELECT'
          ) AS runtime_can_read_sessions,
          (SELECT revoked_at IS NOT NULL FROM provisional_sessions
            WHERE workspace_id = $1) AS revoked,
          (SELECT retirement_reason FROM workspaces
            WHERE id = $1) AS retirement_reason,
          (SELECT count(*) FROM design_revisions
            WHERE workspace_id = $1) AS revisions`,
        [workspaceId],
      );
      expect(state.rows[0]).toEqual({
        selector_email: expect.stringMatching(
          /^retired\+[0-9a-f]{64}@invalid\.example$/,
        ),
        selector_status: "disabled",
        plaintext_selectors: 0,
        anonymized_selectors: 2,
        runtime_can_read_selectors: false,
        runtime_can_read_sessions: false,
        revoked: true,
        retirement_reason: "unverified_selector_retired",
        revisions: "1",
      });
    });
  });
});
