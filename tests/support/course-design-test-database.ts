import { Client } from "pg";
import type { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { runMigrations } from "@/server/db/migrations";
import { bootstrapStarterRecords } from "@/server/db/starter-records";
import * as schema from "@/server/db/schema";
import type { ValidatedSessionContext } from "@/persistence";

export const COURSE_DESIGN_TABLE_ALLOWLIST = [
  "auth_audit_events",
  "auth_session_observations",
  "auth_revoked_provider_sessions",
  "auth_webhook_events",
  "auth_identities",
  "auth_rate_limits",
  "auth_passkeys",
  "auth_email_tokens",
  "auth_verifications",
  "auth_accounts",
  "auth_sessions",
  "auth_users",
  "operation_idempotency",
  "artwork_assets",
  "courses",
  "design_revisions",
  "designs",
  "provisional_sessions",
  "provisional_email_selectors",
  "workspace_memberships",
  "workspaces",
  "users",
] as const;

export const TEST_MIGRATION_URL =
  process.env.COURSE_DESIGN_TEST_DATABASE_URL ??
  "postgresql://localhost/coursedesign_test";

export function assertCourseDesignTestDatabaseUrl(url: string): string {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    throw new Error("Course Design test database URL is invalid.");
  }
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      "Refusing Course Design test cleanup: database name must end in _test.",
    );
  }
  return databaseName;
}

export async function withTestClient<T>(
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  assertCourseDesignTestDatabaseUrl(TEST_MIGRATION_URL);
  const client = new Client({ connectionString: TEST_MIGRATION_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

export async function resetCourseDesignTestSchema(): Promise<void> {
  await withTestClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `DROP TABLE IF EXISTS
          ${[...COURSE_DESIGN_TABLE_ALLOWLIST, "course_design_migrations"]
            .map((name) => `"${name}"`)
            .join(", ")}
        CASCADE`,
      );
      await client.query(
        "DROP FUNCTION IF EXISTS reject_design_revision_mutation() CASCADE",
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function truncateCourseDesignTestData(): Promise<void> {
  await withTestClient(async (client) => {
    const existing = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [COURSE_DESIGN_TABLE_ALLOWLIST],
    );
    const names = existing.rows.map((row) => row.table_name);
    if (names.length === 0) return;
    await client.query(
      `TRUNCATE ${names.map((name) => `"${name}"`).join(", ")}
       RESTART IDENTITY CASCADE`,
    );
  });
}

export async function migrateCourseDesignTestDatabase() {
  assertCourseDesignTestDatabaseUrl(TEST_MIGRATION_URL);
  return runMigrations({
    connectionString: TEST_MIGRATION_URL,
    advisoryLockId: 1129270605n,
    statementTimeoutMs: 30_000,
  });
}

export async function createTestWorkspaceSession(
  pool: Pool,
  now: Date,
): Promise<ValidatedSessionContext> {
  const database = drizzle(pool, { schema });
  return database.transaction(async (transaction) => {
    const [user] = await transaction
      .insert(schema.users)
      .values({ createdAt: now, updatedAt: now })
      .returning({ id: schema.users.id });
    const [workspace] = await transaction
      .insert(schema.workspaces)
      .values({
        displayName: "Course Design test team",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.workspaces.id });
    if (!user || !workspace) {
      throw new Error("The test workspace was not created.");
    }
    await transaction.insert(schema.workspaceMemberships).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    await bootstrapStarterRecords(transaction, {
      workspaceId: workspace.id,
      now: now.toISOString(),
    });
    return {
      authIdentityId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      userId: user.id,
      workspaceId: workspace.id,
      membershipRole: "owner",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1_000).toISOString(),
      authenticatedAt: now.toISOString(),
    };
  });
}
