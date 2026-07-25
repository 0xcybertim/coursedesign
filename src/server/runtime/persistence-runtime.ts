import "server-only";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { UNVERIFIED_WORKSPACE_WARNING } from "@/domain/identity";
import type {
  ProvisionalWorkspaceSummary,
  ValidatedSessionContext,
} from "@/persistence";
import {
  persistenceFailure,
  type PersistenceResult,
} from "@/persistence/result";
import { getPersistenceConfig } from "@/server/config/persistence-config";
import * as schema from "@/server/db/schema";
import { DatabaseProvisionalIdentityService } from "@/server/identity/provisional-identity-service";
import {
  DatabaseArtworkRepository,
  DatabaseCourseRepository,
  DatabaseDesignRepository,
} from "@/server/persistence";
import { GcsPrivateObjectStorage } from "@/server/storage/gcs-object-storage";
import { LocalHttpFakeObjectStorage } from "@/server/storage/local-http-fake-object-storage";

declare global {
  var courseDesignRuntimePool: Pool | undefined;
  var courseDesignLocalFakeObjectStorage:
    | LocalHttpFakeObjectStorage
    | undefined;
}

function serverConfig() {
  const config = getPersistenceConfig();
  return config.mode === "server" ? config : null;
}

export function persistenceRuntimeMode(): "browser" | "server" {
  return serverConfig() ? "server" : "browser";
}

export function runtimePool(): Pool | null {
  const config = serverConfig();
  if (!config) return null;
  if (!globalThis.courseDesignRuntimePool) {
    globalThis.courseDesignRuntimePool = new Pool({
      connectionString: config.database.connectionString,
      max: config.database.poolMax,
      connectionTimeoutMillis: config.database.timeouts.connectionTimeoutMs,
      idleTimeoutMillis: config.database.timeouts.idleTimeoutMs,
      statement_timeout: config.database.timeouts.statementTimeoutMs,
      query_timeout: config.database.timeouts.transactionTimeoutMs,
      application_name: "course-design-runtime",
    });
  }
  return globalThis.courseDesignRuntimePool;
}

export function identityService(): DatabaseProvisionalIdentityService | null {
  const config = serverConfig();
  const pool = runtimePool();
  return config && pool
    ? new DatabaseProvisionalIdentityService(pool, {
        sessionTtlSeconds: config.session.ttlSeconds,
      })
    : null;
}

export function persistenceRepositories(session: ValidatedSessionContext) {
  const config = serverConfig();
  const pool = runtimePool();
  if (!config || !pool) {
    throw new Error("Server persistence repositories are unavailable.");
  }
  const storage =
    process.env.NODE_ENV !== "production" &&
    process.env.PERSISTENCE_LOCAL_FAKE_STORAGE === "true"
      ? localFakeObjectStorage()
      : new GcsPrivateObjectStorage(config.gcs);
  return {
    design: new DatabaseDesignRepository(pool, session),
    course: new DatabaseCourseRepository(pool, session),
    artwork: new DatabaseArtworkRepository(pool, session, storage, config),
  };
}

export function localFakeObjectStorage(): LocalHttpFakeObjectStorage {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.PERSISTENCE_LOCAL_FAKE_STORAGE !== "true"
  ) {
    throw new Error("Local fake object storage is disabled.");
  }
  if (!globalThis.courseDesignLocalFakeObjectStorage) {
    globalThis.courseDesignLocalFakeObjectStorage =
      new LocalHttpFakeObjectStorage();
  }
  return globalThis.courseDesignLocalFakeObjectStorage;
}

export async function currentWorkspaceSummary(
  session: ValidatedSessionContext,
): Promise<PersistenceResult<ProvisionalWorkspaceSummary>> {
  const pool = runtimePool();
  if (!pool) {
    return persistenceFailure(
      "session_invalid",
      "Server persistence is not enabled.",
    );
  }
  try {
    const database = drizzle(pool, { schema });
    const [workspace] = await database
      .select({ displayName: schema.workspaces.displayName })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, session.workspaceId))
      .limit(1);
    return workspace
      ? {
          ok: true,
          value: {
            displayName: workspace.displayName,
            warning: UNVERIFIED_WORKSPACE_WARNING,
          },
        }
      : persistenceFailure(
          "session_invalid",
          "This public workspace session is no longer valid. Enter the email again.",
        );
  } catch {
    return persistenceFailure(
      "temporarily_unavailable",
      "The public workspace could not be checked. Try again.",
    );
  }
}
