import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Client } from "pg";

export const MIGRATION_TABLE = "course_design_migrations" as const;
export const MIGRATION_FILENAME_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface MigrationRunOptions {
  readonly connectionString: string;
  readonly advisoryLockId: bigint;
  readonly statementTimeoutMs: number;
  readonly migrationsDirectory?: string;
  readonly throughFilename?: string;
  readonly onMigrationApplied?: (filename: string) => void;
}

export interface MigrationRunResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

interface MigrationFile {
  readonly filename: string;
  readonly sql: string;
  readonly checksum: string;
}

async function migrationFiles(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => MIGRATION_FILENAME_PATTERN.test(name))
    .sort();
  if (names.length === 0) {
    throw new Error("No checked-in Course Design migrations were found.");
  }
  return Promise.all(
    names.map(async (filename) => {
      const sql = await readFile(resolve(directory, filename), "utf8");
      return {
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

export async function runMigrations(
  options: MigrationRunOptions,
): Promise<MigrationRunResult> {
  const directory =
    options.migrationsDirectory ??
    resolve(process.cwd(), "drizzle", "migrations");
  const availableFiles = await migrationFiles(directory);
  if (
    options.throughFilename &&
    !availableFiles.some((file) => file.filename === options.throughFilename)
  ) {
    throw new Error(
      `Migration target ${options.throughFilename} is not checked in.`,
    );
  }
  const files = options.throughFilename
    ? availableFiles.filter((file) => file.filename <= options.throughFilename!)
    : availableFiles;
  const client = new Client({
    connectionString: options.connectionString,
    application_name: "course-design-migration-owner",
    connectionTimeoutMillis: 10_000,
  });
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('statement_timeout', $1, true)", [
      `${options.statementTimeoutMs}ms`,
    ]);
    await client.query("SELECT pg_advisory_xact_lock($1)", [
      options.advisoryLockId.toString(),
    ]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        filename text PRIMARY KEY,
        checksum_sha256 text NOT NULL
          CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const history = await client.query<{
      filename: string;
      checksum_sha256: string;
    }>(
      `SELECT filename, checksum_sha256
       FROM ${MIGRATION_TABLE}
       ORDER BY filename`,
    );
    const checksumByFilename = new Map(
      history.rows.map((row) => [row.filename, row.checksum_sha256]),
    );

    for (const file of files) {
      const existingChecksum = checksumByFilename.get(file.filename);
      if (existingChecksum) {
        if (existingChecksum !== file.checksum) {
          throw new Error(
            `Applied migration ${file.filename} no longer matches its checked-in checksum.`,
          );
        }
        alreadyApplied.push(file.filename);
        continue;
      }
      await client.query(file.sql);
      await client.query(
        `INSERT INTO ${MIGRATION_TABLE} (filename, checksum_sha256)
         VALUES ($1, $2)`,
        [file.filename, file.checksum],
      );
      applied.push(file.filename);
      options.onMigrationApplied?.(file.filename);
    }
    await client.query("COMMIT");
    return { applied, alreadyApplied };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
