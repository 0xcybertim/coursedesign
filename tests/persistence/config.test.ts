import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DEFAULT_SESSION_TTL_SECONDS,
  PROVISIONAL_SESSION_COOKIE_NAME,
  parseMigrationConfig,
  parsePersistenceConfig,
} from "@/server/config/persistence-config";

const SERVER_ENVIRONMENT = {
  PERSISTENCE_MODE: "server",
  DATABASE_URL: "postgresql://runtime@example.invalid/coursedesign",
  GCS_PROJECT_ID: "course-design-production",
  GCS_BUCKET: "course-design-production-artwork",
  GCS_LOCATION: "europe-west3",
  GCS_CLIENT_EMAIL:
    "course-design-runtime@course-design-production.iam.gserviceaccount.com",
  GCS_PRIVATE_KEY: "private-key-placeholder",
  ALLOWED_ORIGINS: "https://coursedesign.onrender.com,http://localhost:3000",
} as const;

describe("server-only persistence configuration", () => {
  it("keeps browser mode independent from database and GCS credentials", () => {
    expect(parsePersistenceConfig({ PERSISTENCE_MODE: "browser" })).toEqual({
      mode: "browser",
    });
    expect(parsePersistenceConfig({})).toEqual({ mode: "browser" });
  });

  it("parses the bounded server configuration without exposing secrets", () => {
    const parsed = parsePersistenceConfig(SERVER_ENVIRONMENT);
    expect(parsed).toMatchObject({
      mode: "server",
      database: { poolMax: 5 },
      gcs: {
        projectId: "course-design-production",
        bucket: "course-design-production-artwork",
        location: "europe-west3",
      },
      artwork: {
        canonicalMaxWidthPx: 2048,
        canonicalMaxHeightPx: 2048,
        allowedContentTypes: ["image/png"],
      },
      session: {
        cookieName: PROVISIONAL_SESSION_COOKIE_NAME,
        ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
      },
      allowedOrigins: [
        "https://coursedesign.onrender.com",
        "http://localhost:3000",
      ],
    });
  });

  it("fails closed when server credentials or the Frankfurt location are invalid", () => {
    expect(() =>
      parsePersistenceConfig({
        ...SERVER_ENVIRONMENT,
        DATABASE_URL: undefined,
      }),
    ).toThrow("DATABASE_URL");
    expect(() =>
      parsePersistenceConfig({
        ...SERVER_ENVIRONMENT,
        GCS_LOCATION: "europe-west4",
      }),
    ).toThrow("europe-west3");
    expect(() =>
      parsePersistenceConfig({
        ...SERVER_ENVIRONMENT,
        ALLOWED_ORIGINS: "https://coursedesign.onrender.com/path",
      }),
    ).toThrow("exact HTTPS origins");
  });

  it("rejects unknown persistence modes and out-of-range limits", () => {
    expect(() =>
      parsePersistenceConfig({ PERSISTENCE_MODE: "automatic" }),
    ).toThrow("browser or server");
    expect(() =>
      parsePersistenceConfig({
        ...SERVER_ENVIRONMENT,
        DATABASE_POOL_MAX: "200",
      }),
    ).toThrow("DATABASE_POOL_MAX");
    expect(() =>
      parsePersistenceConfig({
        ...SERVER_ENVIRONMENT,
        PROVISIONAL_SESSION_TTL_SECONDS: String(
          DEFAULT_SESSION_TTL_SECONDS + 1,
        ),
      }),
    ).toThrow("PROVISIONAL_SESSION_TTL_SECONDS");
  });

  it("requires a distinct direct migration-owner URL", () => {
    expect(() => parseMigrationConfig({})).toThrow("MIGRATION_DATABASE_URL");
    expect(() =>
      parseMigrationConfig({
        MIGRATION_DATABASE_URL: SERVER_ENVIRONMENT.DATABASE_URL,
        DATABASE_URL: SERVER_ENVIRONMENT.DATABASE_URL,
      }),
    ).toThrow("direct migration-owner");
    expect(
      parseMigrationConfig({
        MIGRATION_DATABASE_URL:
          "postgresql://migration-owner@example.invalid/coursedesign",
        DATABASE_URL: SERVER_ENVIRONMENT.DATABASE_URL,
      }),
    ).toMatchObject({
      advisoryLockId: 1129270605n,
      statementTimeoutMs: 60_000,
    });
  });
});
