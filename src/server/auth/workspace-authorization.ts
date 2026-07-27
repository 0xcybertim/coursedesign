import "server-only";

import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import type { ValidatedSessionContext } from "@/persistence";
import {
  persistenceFailure,
  type PersistenceResult,
} from "@/persistence/result";
import { bootstrapStarterRecords } from "@/server/db/starter-records";
import * as schema from "@/server/db/schema";
import { runtimePool } from "@/server/runtime/persistence-runtime";

import { parseAuthenticationConfig, privacyDigest } from "./auth-config";
import {
  resolveProviderSession,
  type AuthenticatedProviderSession,
} from "./provider-session";

function sessionInvalid(message = "Sign in to open your Course Design team.") {
  return persistenceFailure("session_invalid", message);
}

function retryableDatabaseError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && typeof error.code === "string") {
    return ["23505", "40001", "40P01"].includes(error.code);
  }
  return "cause" in error && retryableDatabaseError(error.cause);
}

async function resolveApplicationContext(
  authenticated: AuthenticatedProviderSession,
): Promise<ValidatedSessionContext> {
  const pool = runtimePool();
  if (!pool) {
    throw new Error("Course Design persistence is unavailable.");
  }
  const config = parseAuthenticationConfig();
  const providerSessionDigest = privacyDigest(
    config.cookiePassword,
    "workos-session",
    authenticated.session.id,
  );
  const database = drizzle(pool, { schema });

  return database.transaction(
    async (transaction) => {
      const now = new Date();
      await transaction
        .insert(schema.authIdentities)
        .values({
          provider: authenticated.identity.provider,
          providerTenantId: authenticated.identity.tenantId,
          providerSubject: authenticated.identity.subject,
          email: authenticated.identity.email,
          displayName: authenticated.identity.displayName,
          emailVerified: authenticated.identity.emailVerified,
          state: "active",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            schema.authIdentities.provider,
            schema.authIdentities.providerTenantId,
            schema.authIdentities.providerSubject,
          ],
        });

      let [identity] = await transaction
        .select({
          id: schema.authIdentities.id,
          state: schema.authIdentities.state,
        })
        .from(schema.authIdentities)
        .where(
          and(
            eq(schema.authIdentities.provider, authenticated.identity.provider),
            eq(
              schema.authIdentities.providerTenantId,
              authenticated.identity.tenantId,
            ),
            eq(
              schema.authIdentities.providerSubject,
              authenticated.identity.subject,
            ),
          ),
        )
        .limit(1);
      if (!identity || identity.state !== "active") {
        throw new Error("The authentication identity is not active.");
      }

      [identity] = await transaction
        .update(schema.authIdentities)
        .set({
          email: authenticated.identity.email,
          displayName: authenticated.identity.displayName,
          emailVerified: authenticated.identity.emailVerified,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.authIdentities.id, identity.id),
            eq(schema.authIdentities.state, "active"),
          ),
        )
        .returning({
          id: schema.authIdentities.id,
          state: schema.authIdentities.state,
        });
      if (!identity) {
        throw new Error("The authentication identity is not active.");
      }

      const [revokedProviderSession] = await transaction
        .select({
          digest: schema.authRevokedProviderSessions.providerSessionDigest,
        })
        .from(schema.authRevokedProviderSessions)
        .where(
          and(
            eq(
              schema.authRevokedProviderSessions.providerSessionDigest,
              providerSessionDigest,
            ),
            gt(schema.authRevokedProviderSessions.expiresAt, now),
          ),
        )
        .limit(1);
      if (revokedProviderSession) {
        throw new Error("The provider session is revoked.");
      }

      await transaction
        .insert(schema.authSessionObservations)
        .values({
          authIdentityId: identity.id,
          providerSessionDigest,
          expiresAt: authenticated.session.expiresAt,
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: schema.authSessionObservations.providerSessionDigest,
        });
      const [observation] = await transaction
        .select({
          authIdentityId: schema.authSessionObservations.authIdentityId,
          revokedAt: schema.authSessionObservations.revokedAt,
        })
        .from(schema.authSessionObservations)
        .where(
          eq(
            schema.authSessionObservations.providerSessionDigest,
            providerSessionDigest,
          ),
        )
        .limit(1);
      if (
        !observation ||
        observation.authIdentityId !== identity.id ||
        observation.revokedAt
      ) {
        throw new Error("The provider session is revoked.");
      }
      await transaction
        .update(schema.authSessionObservations)
        .set({
          expiresAt: authenticated.session.expiresAt,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(
              schema.authSessionObservations.providerSessionDigest,
              providerSessionDigest,
            ),
            isNull(schema.authSessionObservations.revokedAt),
          ),
        );

      let [applicationUser] = await transaction
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.authIdentityId, identity.id))
        .limit(1);
      if (!applicationUser) {
        [applicationUser] = await transaction
          .insert(schema.users)
          .values({
            authIdentityId: identity.id,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: schema.users.id });
      }
      if (!applicationUser) {
        throw new Error("The application user was not created.");
      }
      await transaction.execute(
        sql`select id
            from users
            where id = ${applicationUser.id}
            for update`,
      );

      const membershipColumns = {
        workspaceId: schema.workspaceMemberships.workspaceId,
        role: schema.workspaceMemberships.role,
      };
      let membership = (
        await transaction
          .select(membershipColumns)
          .from(schema.workspaceMemberships)
          .innerJoin(
            schema.workspaces,
            eq(schema.workspaces.id, schema.workspaceMemberships.workspaceId),
          )
          .where(
            and(
              eq(schema.workspaceMemberships.userId, applicationUser.id),
              isNull(schema.workspaces.retiredAt),
            ),
          )
          .orderBy(asc(schema.workspaceMemberships.createdAt))
          .limit(1)
      )[0];

      if (!membership) {
        const [workspace] = await transaction
          .insert(schema.workspaces)
          .values({
            displayName: "Course Design team",
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: schema.workspaces.id });
        if (!workspace) {
          throw new Error("The team workspace was not created.");
        }
        await transaction.insert(schema.workspaceMemberships).values({
          workspaceId: workspace.id,
          userId: applicationUser.id,
          role: "owner",
          createdAt: now,
          updatedAt: now,
        });
        await bootstrapStarterRecords(transaction, {
          workspaceId: workspace.id,
          now: now.toISOString(),
        });
        membership = { workspaceId: workspace.id, role: "owner" };
        await transaction.insert(schema.authAuditEvents).values({
          actorAuthIdentityId: identity.id,
          providerSessionDigest,
          eventType: "workspace_created",
          outcome: "success",
          metadata: {},
        });
      }

      if (membership.role !== "owner") {
        throw new Error("The workspace membership role is unsupported.");
      }
      return {
        authIdentityId: identity.id,
        sessionId: providerSessionDigest,
        userId: applicationUser.id,
        workspaceId: membership.workspaceId,
        membershipRole: "owner" as const,
        expiresAt: authenticated.session.expiresAt.toISOString(),
        authenticatedAt: authenticated.session.authenticatedAt.toISOString(),
      };
    },
    { isolationLevel: "serializable" },
  );
}

export async function authenticatedWorkspaceSession(
  headers: Headers,
): Promise<PersistenceResult<ValidatedSessionContext>> {
  let authenticated: AuthenticatedProviderSession | null;
  try {
    authenticated = await resolveProviderSession(headers);
  } catch {
    return persistenceFailure(
      "temporarily_unavailable",
      "Authentication could not be checked. Try again.",
    );
  }
  if (!authenticated) return sessionInvalid();
  if (!authenticated.identity.emailVerified) {
    return sessionInvalid("Verify your email before opening a team workspace.");
  }
  if (authenticated.session.expiresAt.getTime() <= Date.now()) {
    return sessionInvalid("Your session expired. Sign in again.");
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return {
        ok: true,
        value: await resolveApplicationContext(authenticated),
      };
    } catch (error) {
      if (attempt < 5 && retryableDatabaseError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      return persistenceFailure(
        "temporarily_unavailable",
        "Your team workspace could not be opened. Try again.",
      );
    }
  }
  return persistenceFailure(
    "temporarily_unavailable",
    "Your team workspace could not be opened. Try again.",
  );
}
