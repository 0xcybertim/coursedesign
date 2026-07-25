import { Client } from "pg";

import { runMigrations } from "@/server/db/migrations";

export const COURSE_DESIGN_TABLE_ALLOWLIST = [
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
