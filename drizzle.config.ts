import { defineConfig } from "drizzle-kit";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle/migrations",
  ...(migrationDatabaseUrl
    ? { dbCredentials: { url: migrationDatabaseUrl } }
    : {}),
  strict: true,
  verbose: true,
});
