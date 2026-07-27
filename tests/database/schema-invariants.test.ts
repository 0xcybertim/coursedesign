import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { parseCourseDraft } from "@/domain/course";
import { parseLocalDesignWorkspace } from "@/domain/design";
import { bootstrapStarterRecords } from "@/server/db/starter-records";
import * as schema from "@/server/db/schema";

import {
  migrateCourseDesignTestDatabase,
  TEST_MIGRATION_URL,
  truncateCourseDesignTestData,
  withTestClient,
} from "../support/course-design-test-database";

interface Fixture {
  readonly userId: string;
  readonly workspaceId: string;
  readonly designId: string;
  readonly revisionId: string;
}

async function fixture(): Promise<Fixture> {
  return withTestClient(async (client) => {
    const user = await client.query<{ id: string }>(
      "INSERT INTO users DEFAULT VALUES RETURNING id",
    );
    const workspace = await client.query<{ id: string }>(
      `INSERT INTO workspaces (display_name)
       VALUES ('Course Design test workspace')
       RETURNING id`,
    );
    const userId = user.rows[0].id;
    const workspaceId = workspace.rows[0].id;
    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id)
       VALUES ($1, $2)`,
      [workspaceId, userId],
    );
    const design = await client.query<{ id: string }>(
      `INSERT INTO designs (
         workspace_id,
         legacy_route_key,
         family_id,
         display_name,
         draft_snapshot,
         domain_schema_version
       )
       VALUES ($1, 'local-spj-04', 'spj-04-club-classic', 'SPJ-04',
         '{}'::jsonb, '1.0.0-phase1b')
       RETURNING id`,
      [workspaceId],
    );
    const designId = design.rows[0].id;
    const revision = await client.query<{ id: string }>(
      `INSERT INTO design_revisions (
         workspace_id,
         design_id,
         ordinal,
         name,
         configuration_hash,
         domain_schema_version,
         snapshot
       )
       VALUES ($1, $2, 1, 'Revision 1', $3, '1.0.0-phase1b',
         '{}'::jsonb)
       RETURNING id`,
      [workspaceId, designId, "a".repeat(64)],
    );
    return {
      userId,
      workspaceId,
      designId,
      revisionId: revision.rows[0].id,
    };
  });
}

beforeAll(async () => {
  await migrateCourseDesignTestDatabase();
});

beforeEach(async () => {
  await truncateCourseDesignTestData();
});

describe("Course Design schema invariants", () => {
  it("bootstraps clean starter records transactionally and idempotently", async () => {
    const seeded = await withTestClient(async (client) => {
      const user = await client.query<{ id: string }>(
        "INSERT INTO users DEFAULT VALUES RETURNING id",
      );
      const workspace = await client.query<{ id: string }>(
        `INSERT INTO workspaces (display_name)
         VALUES ('Starter workspace')
         RETURNING id`,
      );
      await client.query(
        `INSERT INTO workspace_memberships (workspace_id, user_id)
         VALUES ($1, $2)`,
        [workspace.rows[0].id, user.rows[0].id],
      );
      return workspace.rows[0].id;
    });
    const pool = new Pool({ connectionString: TEST_MIGRATION_URL });
    const database = drizzle(pool, { schema });
    try {
      await database.transaction(async (transaction) => {
        await bootstrapStarterRecords(transaction, {
          workspaceId: seeded,
          now: "2026-07-25T09:00:00.000Z",
        });
        await bootstrapStarterRecords(transaction, {
          workspaceId: seeded,
          now: "2026-07-25T09:00:00.000Z",
        });
      });
      const result = await withTestClient(async (client) => {
        const designs = await client.query<{
          draft_snapshot: unknown;
        }>("SELECT draft_snapshot FROM designs WHERE workspace_id = $1", [
          seeded,
        ]);
        const courses = await client.query<{
          draft_snapshot: unknown;
        }>("SELECT draft_snapshot FROM courses WHERE workspace_id = $1", [
          seeded,
        ]);
        return { designs: designs.rows, courses: courses.rows };
      });
      expect(result.designs).toHaveLength(1);
      expect(result.courses).toHaveLength(1);
      expect(
        parseLocalDesignWorkspace(
          JSON.stringify({
            schemaVersion: "1.0.0-phase1b",
            designId: "local-spj-04",
            draft: result.designs[0].draft_snapshot,
            revisions: [],
          }),
        ).ok,
      ).toBe(true);
      expect(
        parseCourseDraft(JSON.stringify(result.courses[0].draft_snapshot)).ok,
      ).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it("allows identical configuration hashes while keeping ordinals unique", async () => {
    const seeded = await fixture();
    await withTestClient(async (client) => {
      await expect(
        client.query(
          `INSERT INTO design_revisions (
             workspace_id, design_id, ordinal, name, configuration_hash,
             domain_schema_version, snapshot
           )
           VALUES ($1, $2, 2, 'Revision 2', $3, '1.0.0-phase1b',
             '{}'::jsonb)`,
          [seeded.workspaceId, seeded.designId, "a".repeat(64)],
        ),
      ).resolves.toBeDefined();
      await expect(
        client.query(
          `INSERT INTO design_revisions (
             workspace_id, design_id, ordinal, name, configuration_hash,
             domain_schema_version, snapshot
           )
           VALUES ($1, $2, 2, 'Duplicate ordinal', $3,
             '1.0.0-phase1b', '{}'::jsonb)`,
          [seeded.workspaceId, seeded.designId, "b".repeat(64)],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    });
  });

  it("rejects direct UPDATE and DELETE of immutable revisions by trigger", async () => {
    const seeded = await fixture();
    await withTestClient(async (client) => {
      await expect(
        client.query(
          "UPDATE design_revisions SET name = 'changed' WHERE id = $1",
          [seeded.revisionId],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        client.query("DELETE FROM design_revisions WHERE id = $1", [
          seeded.revisionId,
        ]),
      ).rejects.toMatchObject({ code: "55000" });
    });
  });

  it("restricts the runtime role from revision mutation and schema changes", async () => {
    const seeded = await fixture();
    await withTestClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE coursedesign_runtime");
        const migrationLedger = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM course_design_migrations",
        );
        expect(migrationLedger.rows[0]?.count).toBeGreaterThanOrEqual(1);
        await expect(
          client.query(
            "UPDATE design_revisions SET name = 'changed' WHERE id = $1",
            [seeded.revisionId],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE coursedesign_runtime");
        await expect(
          client.query("CREATE TABLE forbidden_runtime_table (id int)"),
        ).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  });

  it("stores only exact SHA-256 WorkOS session observations", async () => {
    await withTestClient(async (client) => {
      const identity = await client.query<{ id: string }>(
        `INSERT INTO auth_identities (
           provider, provider_tenant_id, provider_subject,
           email, email_verified
         )
         VALUES (
           'workos', 'client_test', 'user_test',
           'digest@example.test', true
         )
         RETURNING id`,
      );
      await expect(
        client.query(
          `INSERT INTO auth_session_observations (
             auth_identity_id, provider_session_digest, expires_at
           )
           VALUES ($1, $2, now() + interval '1 day')`,
          [identity.rows[0]!.id, "provider-session-not-a-digest"],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        client.query(
          `INSERT INTO auth_session_observations (
             auth_identity_id, provider_session_digest, expires_at
           )
           VALUES ($1, $2, now() + interval '1 day')`,
          [identity.rows[0]!.id, "f".repeat(64)],
        ),
      ).resolves.toBeDefined();
    });
  });

  it("keeps auth audit events append-only and legacy selectors closed to runtime", async () => {
    const seeded = await fixture();
    await withTestClient(async (client) => {
      const legacyReadPrivileges = await client.query<{
        selectors: boolean;
        sessions: boolean;
      }>(
        `SELECT
          has_table_privilege(
            'coursedesign_runtime',
            'provisional_email_selectors',
            'SELECT'
          ) AS selectors,
          has_table_privilege(
            'coursedesign_runtime',
            'provisional_sessions',
            'SELECT'
          ) AS sessions`,
      );
      expect(legacyReadPrivileges.rows[0]).toEqual({
        selectors: false,
        sessions: false,
      });

      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE coursedesign_runtime");
        await client.query(
          `INSERT INTO auth_audit_events (event_type, outcome)
           VALUES ('security_test', 'success')`,
        );
        await expect(
          client.query(
            `UPDATE auth_audit_events
             SET outcome = 'failure'
             WHERE event_type = 'security_test'`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE coursedesign_runtime");
        await expect(
          client.query(
            `INSERT INTO provisional_email_selectors (
               workspace_id, user_id, email_normalized
             )
             VALUES ($1, $2, 'cannot-reopen@example.test')`,
            [seeded.workspaceId, seeded.userId],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  });

  it("rejects cross-workspace revision ownership at the foreign key", async () => {
    const seeded = await fixture();
    await withTestClient(async (client) => {
      const other = await client.query<{ id: string }>(
        "INSERT INTO workspaces (display_name) VALUES ('Other') RETURNING id",
      );
      await expect(
        client.query(
          `INSERT INTO design_revisions (
             workspace_id, design_id, ordinal, name, configuration_hash,
             domain_schema_version, snapshot
           )
           VALUES ($1, $2, 2, 'Foreign', $3, '1.0.0-phase1b',
             '{}'::jsonb)`,
          [other.rows[0].id, seeded.designId, "c".repeat(64)],
        ),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });
});
