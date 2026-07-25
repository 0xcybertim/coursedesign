import { ARTWORK_LIMITS } from "@/domain/artwork";

type Environment = Readonly<Record<string, string | undefined>>;

export const PERSISTENCE_MODES = ["browser", "server"] as const;
export type PersistenceMode = (typeof PERSISTENCE_MODES)[number];

export const PROVISIONAL_SESSION_COOKIE_NAME =
  "__Host-course-design-session" as const;
export const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

interface OperationalTimeouts {
  readonly connectionTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly statementTimeoutMs: number;
  readonly transactionTimeoutMs: number;
}

export interface BrowserPersistenceConfig {
  readonly mode: "browser";
}

export interface ServerPersistenceConfig {
  readonly mode: "server";
  readonly database: {
    readonly connectionString: string;
    readonly poolMax: number;
    readonly timeouts: OperationalTimeouts;
  };
  readonly gcs: {
    readonly projectId: string;
    readonly bucket: string;
    readonly location: "europe-west3";
    readonly clientEmail: string;
    readonly privateKey: string;
  };
  readonly artwork: {
    readonly canonicalMaxBytes: number;
    readonly canonicalMaxWidthPx: number;
    readonly canonicalMaxHeightPx: number;
    readonly allowedContentTypes: readonly ["image/png"];
    readonly signedUrlTtlSeconds: number;
  };
  readonly session: {
    readonly cookieName: typeof PROVISIONAL_SESSION_COOKIE_NAME;
    readonly ttlSeconds: number;
  };
  readonly allowedOrigins: readonly string[];
}

export type PersistenceConfig =
  | BrowserPersistenceConfig
  | ServerPersistenceConfig;

export interface MigrationConfig {
  readonly migrationDatabaseUrl: string;
  readonly advisoryLockId: bigint;
  readonly statementTimeoutMs: number;
}

export class PersistenceConfigError extends Error {
  readonly kind = "invalid_persistence_configuration";

  constructor(message: string) {
    super(message);
    this.name = "PersistenceConfigError";
  }
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new PersistenceConfigError(
      `Required server configuration ${name} is missing.`,
    );
  }
  return value;
}

function integer(
  environment: Environment,
  name: string,
  fallback: number,
  bounds: { readonly minimum: number; readonly maximum: number },
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < bounds.minimum ||
    value > bounds.maximum
  ) {
    throw new PersistenceConfigError(
      `${name} must be an integer between ${bounds.minimum} and ${bounds.maximum}.`,
    );
  }
  return value;
}

function persistenceMode(environment: Environment): PersistenceMode {
  const value = environment.PERSISTENCE_MODE?.trim() || "browser";
  if (value !== "browser" && value !== "server") {
    throw new PersistenceConfigError(
      "PERSISTENCE_MODE must be either browser or server.",
    );
  }
  return value;
}

function parseAllowedOrigins(environment: Environment): readonly string[] {
  const values = required(environment, "ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new PersistenceConfigError(
      "ALLOWED_ORIGINS must contain at least one exact origin.",
    );
  }
  const origins = values.map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new PersistenceConfigError(
        "ALLOWED_ORIGINS contains an invalid URL.",
      );
    }
    const isLocalHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.origin !== value || (url.protocol !== "https:" && !isLocalHttp)) {
      throw new PersistenceConfigError(
        "ALLOWED_ORIGINS must contain exact HTTPS origins or local HTTP origins without paths.",
      );
    }
    return url.origin;
  });
  return [...new Set(origins)];
}

export function parsePersistenceConfig(
  environment: Environment = process.env,
): PersistenceConfig {
  const mode = persistenceMode(environment);
  if (mode === "browser") return { mode };

  const location = required(environment, "GCS_LOCATION");
  if (location !== "europe-west3") {
    throw new PersistenceConfigError(
      "GCS_LOCATION must be europe-west3 for Course Design.",
    );
  }

  return {
    mode,
    database: {
      connectionString: required(environment, "DATABASE_URL"),
      poolMax: integer(environment, "DATABASE_POOL_MAX", 5, {
        minimum: 1,
        maximum: 20,
      }),
      timeouts: {
        connectionTimeoutMs: integer(
          environment,
          "DATABASE_CONNECTION_TIMEOUT_MS",
          5_000,
          { minimum: 250, maximum: 30_000 },
        ),
        idleTimeoutMs: integer(
          environment,
          "DATABASE_IDLE_TIMEOUT_MS",
          30_000,
          { minimum: 1_000, maximum: 300_000 },
        ),
        statementTimeoutMs: integer(
          environment,
          "DATABASE_STATEMENT_TIMEOUT_MS",
          10_000,
          { minimum: 500, maximum: 60_000 },
        ),
        transactionTimeoutMs: integer(
          environment,
          "DATABASE_TRANSACTION_TIMEOUT_MS",
          15_000,
          { minimum: 1_000, maximum: 120_000 },
        ),
      },
    },
    gcs: {
      projectId: required(environment, "GCS_PROJECT_ID"),
      bucket: required(environment, "GCS_BUCKET"),
      location,
      clientEmail: required(environment, "GCS_CLIENT_EMAIL"),
      privateKey: required(environment, "GCS_PRIVATE_KEY").replace(
        /\\n/g,
        "\n",
      ),
    },
    artwork: {
      canonicalMaxBytes: integer(
        environment,
        "ARTWORK_CANONICAL_MAX_BYTES",
        ARTWORK_LIMITS.rasterSourceMaxBytes,
        { minimum: 1_024, maximum: 25 * 1_024 * 1_024 },
      ),
      canonicalMaxWidthPx: integer(
        environment,
        "ARTWORK_CANONICAL_MAX_WIDTH_PX",
        ARTWORK_LIMITS.canonicalLongestEdgePx,
        { minimum: 1, maximum: ARTWORK_LIMITS.canonicalLongestEdgePx },
      ),
      canonicalMaxHeightPx: integer(
        environment,
        "ARTWORK_CANONICAL_MAX_HEIGHT_PX",
        ARTWORK_LIMITS.canonicalLongestEdgePx,
        { minimum: 1, maximum: ARTWORK_LIMITS.canonicalLongestEdgePx },
      ),
      allowedContentTypes: ["image/png"],
      signedUrlTtlSeconds: integer(
        environment,
        "GCS_SIGNED_URL_TTL_SECONDS",
        5 * 60,
        { minimum: 30, maximum: 15 * 60 },
      ),
    },
    session: {
      cookieName: PROVISIONAL_SESSION_COOKIE_NAME,
      ttlSeconds: integer(
        environment,
        "PROVISIONAL_SESSION_TTL_SECONDS",
        DEFAULT_SESSION_TTL_SECONDS,
        { minimum: 60 * 60, maximum: DEFAULT_SESSION_TTL_SECONDS },
      ),
    },
    allowedOrigins: parseAllowedOrigins(environment),
  };
}

export function getPersistenceConfig(): PersistenceConfig {
  return parsePersistenceConfig(process.env);
}

export function parseMigrationConfig(
  environment: Environment = process.env,
): MigrationConfig {
  const migrationDatabaseUrl = required(environment, "MIGRATION_DATABASE_URL");
  const runtimeDatabaseUrl = environment.DATABASE_URL?.trim();
  if (runtimeDatabaseUrl && migrationDatabaseUrl === runtimeDatabaseUrl) {
    throw new PersistenceConfigError(
      "MIGRATION_DATABASE_URL must use the direct migration-owner connection, not DATABASE_URL.",
    );
  }
  const advisoryLockText =
    environment.MIGRATION_ADVISORY_LOCK_ID?.trim() || "1129270605";
  let advisoryLockId: bigint;
  try {
    advisoryLockId = BigInt(advisoryLockText);
  } catch {
    throw new PersistenceConfigError(
      "MIGRATION_ADVISORY_LOCK_ID must be an integer.",
    );
  }
  return {
    migrationDatabaseUrl,
    advisoryLockId,
    statementTimeoutMs: integer(
      environment,
      "MIGRATION_STATEMENT_TIMEOUT_MS",
      60_000,
      { minimum: 1_000, maximum: 10 * 60_000 },
    ),
  };
}
