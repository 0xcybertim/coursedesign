import { parseMigrationConfig } from "../../src/server/config/persistence-config-values.ts";
import { runMigrations } from "../../src/server/db/migrations.ts";

async function main() {
  const configuration = parseMigrationConfig(process.env);
  const result = await runMigrations({
    connectionString: configuration.migrationDatabaseUrl,
    advisoryLockId: configuration.advisoryLockId,
    statementTimeoutMs: configuration.statementTimeoutMs,
    throughFilename: configuration.throughFilename,
    onMigrationApplied: (filename) => {
      process.stdout.write(`Applied ${filename}\n`);
    },
  });
  process.stdout.write(
    `Course Design migrations ready: ${result.applied.length} applied, ${result.alreadyApplied.length} already applied.\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown migration failure.";
  process.stderr.write(`Course Design migration failed: ${message}\n`);
  process.exitCode = 1;
});
