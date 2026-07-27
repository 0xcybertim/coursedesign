import { runMigrations } from "../../src/server/db/migrations.ts";

const connectionString =
  process.env.COURSE_DESIGN_TEST_DATABASE_URL ??
  "postgresql://localhost/coursedesign_test";

function assertTestDatabaseUrl(value: string): void {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(value).pathname.slice(1));
  } catch {
    throw new Error("COURSE_DESIGN_TEST_DATABASE_URL is invalid.");
  }
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      "Refusing authentication QA setup: the database name must end in _test.",
    );
  }
}

async function main(): Promise<void> {
  assertTestDatabaseUrl(connectionString);
  const result = await runMigrations({
    connectionString,
    advisoryLockId: 1129270605n,
    statementTimeoutMs: 60_000,
  });
  process.stdout.write(
    `Authentication QA database ready: ${result.applied.length} applied, ${result.alreadyApplied.length} already applied.\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown QA database failure.";
  process.stderr.write(`Authentication QA database setup failed: ${message}\n`);
  process.exitCode = 1;
});
