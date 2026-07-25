import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import {
  UNVERIFIED_WORKSPACE_WARNING,
  normalizeEmailSelector,
} from "@/domain/identity";
import type {
  ProvisionalIdentityService,
  ValidatedSessionContext,
  WorkspaceSelection,
} from "@/persistence/identity-service";
import {
  persistenceFailure,
  type PersistenceResult,
} from "@/persistence/result";
import { bootstrapStarterRecords } from "@/server/db/starter-records";
import * as schema from "@/server/db/schema";

import {
  digestSessionToken,
  generateOpaqueSessionToken,
  isOpaqueSessionToken,
} from "./session-token";

interface ProvisionalIdentityServiceOptions {
  readonly now?: () => Date;
  readonly generateToken?: () => string;
  readonly sessionTtlSeconds?: number;
}

interface SelectorAggregate {
  readonly userId: string;
  readonly workspaceId: string;
  readonly displayName: string;
}

function isRetryableTransactionError(error: unknown): boolean {
  const code = databaseErrorCode(error);
  return code === "23505" || code === "40001" || code === "40P01";
}

function databaseErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return databaseErrorCode(error.cause);
  return null;
}

function sessionInvalid(): PersistenceResult<never> {
  return persistenceFailure(
    "session_invalid",
    "This public workspace session is no longer valid. Enter the email again.",
  );
}

export class DatabaseProvisionalIdentityService implements ProvisionalIdentityService {
  private readonly database;
  private readonly now: () => Date;
  private readonly generateToken: () => string;
  private readonly sessionTtlSeconds: number;

  constructor(
    private readonly pool: Pool,
    options: ProvisionalIdentityServiceOptions = {},
  ) {
    this.database = drizzle(pool, { schema });
    this.now = options.now ?? (() => new Date());
    this.generateToken = options.generateToken ?? generateOpaqueSessionToken;
    this.sessionTtlSeconds = options.sessionTtlSeconds ?? 30 * 24 * 60 * 60;
  }

  private expiry(now: Date): Date {
    return new Date(now.getTime() + this.sessionTtlSeconds * 1_000);
  }

  private async selectWorkspaceAttempt(input: {
    readonly emailNormalized: string;
    readonly sessionToken: string;
    readonly previousSessionToken?: string;
    readonly now: Date;
  }): Promise<WorkspaceSelection> {
    return this.database.transaction(
      async (transaction) => {
        const [existing] = await transaction
          .select({
            userId: schema.provisionalEmailSelectors.userId,
            workspaceId: schema.provisionalEmailSelectors.workspaceId,
            displayName: schema.workspaces.displayName,
            status: schema.provisionalEmailSelectors.status,
          })
          .from(schema.provisionalEmailSelectors)
          .innerJoin(
            schema.workspaces,
            eq(
              schema.workspaces.id,
              schema.provisionalEmailSelectors.workspaceId,
            ),
          )
          .where(
            eq(
              schema.provisionalEmailSelectors.emailNormalized,
              input.emailNormalized,
            ),
          )
          .limit(1);

        let aggregate: SelectorAggregate;
        if (existing) {
          if (existing.status !== "active") {
            throw Object.assign(new Error("The selector is unavailable."), {
              persistenceKind: "forbidden" as const,
            });
          }
          aggregate = existing;
        } else {
          const [user] = await transaction
            .insert(schema.users)
            .values({
              createdAt: input.now,
              updatedAt: input.now,
            })
            .returning({ id: schema.users.id });
          const [workspace] = await transaction
            .insert(schema.workspaces)
            .values({
              displayName: "Course Design workspace",
              createdAt: input.now,
              updatedAt: input.now,
            })
            .returning({
              id: schema.workspaces.id,
              displayName: schema.workspaces.displayName,
            });
          if (!user || !workspace) {
            throw new Error("The workspace aggregate was not created.");
          }
          await transaction.insert(schema.workspaceMemberships).values({
            workspaceId: workspace.id,
            userId: user.id,
            role: "owner",
            createdAt: input.now,
            updatedAt: input.now,
          });
          await transaction.insert(schema.provisionalEmailSelectors).values({
            userId: user.id,
            workspaceId: workspace.id,
            emailNormalized: input.emailNormalized,
            status: "active",
            createdAt: input.now,
            updatedAt: input.now,
          });
          await bootstrapStarterRecords(transaction, {
            workspaceId: workspace.id,
            now: input.now.toISOString(),
          });
          aggregate = {
            userId: user.id,
            workspaceId: workspace.id,
            displayName: workspace.displayName,
          };
        }

        if (input.previousSessionToken) {
          await transaction
            .update(schema.provisionalSessions)
            .set({ revokedAt: input.now, updatedAt: input.now })
            .where(
              eq(
                schema.provisionalSessions.tokenDigest,
                digestSessionToken(input.previousSessionToken),
              ),
            );
        }

        const expiresAt = this.expiry(input.now);
        const [session] = await transaction
          .insert(schema.provisionalSessions)
          .values({
            workspaceId: aggregate.workspaceId,
            userId: aggregate.userId,
            tokenDigest: digestSessionToken(input.sessionToken),
            expiresAt,
            lastSeenAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning({ id: schema.provisionalSessions.id });
        if (!session) {
          throw new Error("The provisional session was not created.");
        }
        return {
          sessionToken: input.sessionToken,
          session: {
            sessionId: session.id,
            userId: aggregate.userId,
            workspaceId: aggregate.workspaceId,
            membershipRole: "owner",
            expiresAt: expiresAt.toISOString(),
          },
          workspace: {
            displayName: aggregate.displayName,
            warning: UNVERIFIED_WORKSPACE_WARNING,
          },
        };
      },
      { isolationLevel: "serializable" },
    );
  }

  async selectWorkspace(input: {
    readonly email: unknown;
    readonly previousSessionToken?: string;
  }): Promise<PersistenceResult<WorkspaceSelection>> {
    const normalized = normalizeEmailSelector(input.email);
    if (!normalized.ok) {
      return persistenceFailure("validation", normalized.error.message);
    }
    if (
      input.previousSessionToken !== undefined &&
      !isOpaqueSessionToken(input.previousSessionToken)
    ) {
      return sessionInvalid();
    }
    const sessionToken = this.generateToken();
    if (!isOpaqueSessionToken(sessionToken)) {
      return persistenceFailure(
        "temporarily_unavailable",
        "A secure public workspace session could not be created.",
      );
    }
    const now = this.now();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return {
          ok: true,
          value: await this.selectWorkspaceAttempt({
            emailNormalized: normalized.value,
            sessionToken,
            previousSessionToken: input.previousSessionToken,
            now,
          }),
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "persistenceKind" in error &&
          error.persistenceKind === "forbidden"
        ) {
          return persistenceFailure(
            "forbidden",
            "That public workspace selector is unavailable.",
          );
        }
        if (attempt < 2 && isRetryableTransactionError(error)) continue;
        return persistenceFailure(
          "temporarily_unavailable",
          "The public workspace could not be opened. Try again.",
        );
      }
    }
    return persistenceFailure(
      "temporarily_unavailable",
      "The public workspace could not be opened. Try again.",
    );
  }

  async validateSession(
    sessionToken: string,
  ): Promise<PersistenceResult<ValidatedSessionContext>> {
    if (!isOpaqueSessionToken(sessionToken)) return sessionInvalid();
    const now = this.now();
    try {
      const [session] = await this.database
        .select({
          sessionId: schema.provisionalSessions.id,
          userId: schema.provisionalSessions.userId,
          workspaceId: schema.provisionalSessions.workspaceId,
          role: schema.workspaceMemberships.role,
          expiresAt: schema.provisionalSessions.expiresAt,
        })
        .from(schema.provisionalSessions)
        .innerJoin(
          schema.workspaceMemberships,
          and(
            eq(
              schema.workspaceMemberships.workspaceId,
              schema.provisionalSessions.workspaceId,
            ),
            eq(
              schema.workspaceMemberships.userId,
              schema.provisionalSessions.userId,
            ),
          ),
        )
        .where(
          and(
            eq(
              schema.provisionalSessions.tokenDigest,
              digestSessionToken(sessionToken),
            ),
            isNull(schema.provisionalSessions.revokedAt),
            gt(schema.provisionalSessions.expiresAt, now),
          ),
        )
        .limit(1);
      if (!session || session.role !== "owner") return sessionInvalid();

      const renewalThreshold =
        now.getTime() + (this.sessionTtlSeconds * 1_000) / 2;
      const expiresAt =
        session.expiresAt.getTime() <= renewalThreshold
          ? this.expiry(now)
          : session.expiresAt;
      await this.database
        .update(schema.provisionalSessions)
        .set({
          lastSeenAt: now,
          expiresAt,
          updatedAt: now,
        })
        .where(eq(schema.provisionalSessions.id, session.sessionId));
      return {
        ok: true,
        value: {
          sessionId: session.sessionId,
          userId: session.userId,
          workspaceId: session.workspaceId,
          membershipRole: "owner",
          expiresAt: expiresAt.toISOString(),
        },
      };
    } catch {
      return persistenceFailure(
        "temporarily_unavailable",
        "The public workspace session could not be checked. Try again.",
      );
    }
  }

  async clearSession(sessionToken: string): Promise<PersistenceResult<null>> {
    if (!isOpaqueSessionToken(sessionToken)) return sessionInvalid();
    const now = this.now();
    try {
      const revoked = await this.database
        .update(schema.provisionalSessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(
              schema.provisionalSessions.tokenDigest,
              digestSessionToken(sessionToken),
            ),
            isNull(schema.provisionalSessions.revokedAt),
          ),
        )
        .returning({ id: schema.provisionalSessions.id });
      return revoked.length === 0
        ? sessionInvalid()
        : { ok: true, value: null };
    } catch {
      return persistenceFailure(
        "temporarily_unavailable",
        "The public workspace session could not be cleared. Try again.",
      );
    }
  }
}
