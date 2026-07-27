import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { NextResponse } from "next/server";

import {
  parseAuthenticationConfig,
  privacyDigest,
} from "@/server/auth/auth-config";
import { clearAcceptanceTestSessionCookie } from "@/server/auth/acceptance-test-session";
import { authenticationProviderAdmin } from "@/server/auth/provider-admin";
import { reauthenticationUrl } from "@/server/auth/provider-flows";
import { clearWorkosSessionCookie } from "@/server/auth/session-cookie";
import { getPersistenceConfig } from "@/server/config/persistence-config";
import * as schema from "@/server/db/schema";
import {
  NO_STORE_HEADERS,
  persistenceJson,
  requestSession,
} from "@/server/http/persistence-route";
import { verifyMutationRequest } from "@/server/http/request-policy";
import { clearSessionCookie } from "@/server/http/session-cookie";
import { runtimePool } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRESH_AUTH_SECONDS = 5 * 60;

export async function POST(request: Request) {
  const persistence = getPersistenceConfig();
  if (persistence.mode !== "server") {
    return NextResponse.json(
      { ok: false },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  const mutation = verifyMutationRequest(request, persistence.allowedOrigins);
  if (!mutation.ok) return persistenceJson(mutation);
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);

  const authenticatedAt = new Date(
    session.value.context.authenticatedAt,
  ).getTime();
  if (
    !Number.isFinite(authenticatedAt) ||
    Date.now() - authenticatedAt > FRESH_AUTH_SECONDS * 1_000
  ) {
    return NextResponse.json(
      {
        ok: false,
        reauthenticateUrl: await reauthenticationUrl({
          maxAge: FRESH_AUTH_SECONDS,
          returnTo: "/",
        }),
        message: "Reauthenticate before deleting the account.",
      },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  const pool = runtimePool();
  if (!pool) {
    return NextResponse.json(
      { ok: false, message: "Account deletion is unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  const config = parseAuthenticationConfig();
  const database = drizzle(pool, { schema });
  const context = session.value.context;
  const now = new Date();

  const pending = await database.transaction(
    async (transaction) => {
      const [identity] = await transaction
        .select({
          subject: schema.authIdentities.providerSubject,
          tenantId: schema.authIdentities.providerTenantId,
        })
        .from(schema.authIdentities)
        .where(
          and(
            eq(schema.authIdentities.id, context.authIdentityId),
            eq(schema.authIdentities.state, "active"),
          ),
        )
        .limit(1);
      if (!identity || identity.tenantId !== config.clientId) return null;

      const [marked] = await transaction
        .update(schema.authIdentities)
        .set({ state: "deletion_pending", updatedAt: now })
        .where(
          and(
            eq(schema.authIdentities.id, context.authIdentityId),
            eq(schema.authIdentities.state, "active"),
          ),
        )
        .returning({ id: schema.authIdentities.id });
      if (!marked) return null;

      const memberships = await transaction
        .select({
          workspaceId: schema.workspaceMemberships.workspaceId,
          role: schema.workspaceMemberships.role,
        })
        .from(schema.workspaceMemberships)
        .where(eq(schema.workspaceMemberships.userId, context.userId));
      for (const membership of memberships) {
        if (membership.role !== "owner") continue;
        await transaction
          .update(schema.workspaces)
          .set({
            retiredAt: now,
            retirementReason: "account_deletion_requested",
            updatedAt: now,
          })
          .where(eq(schema.workspaces.id, membership.workspaceId));
      }
      await transaction
        .update(schema.authSessionObservations)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          eq(
            schema.authSessionObservations.authIdentityId,
            context.authIdentityId,
          ),
        );
      await transaction.insert(schema.authAuditEvents).values({
        actorAuthIdentityId: context.authIdentityId,
        providerSessionDigest: context.sessionId,
        eventType: "account_deletion_requested",
        outcome: "requested",
        metadata: {},
      });
      return identity.subject;
    },
    { isolationLevel: "serializable" },
  );
  if (!pending) {
    return NextResponse.json(
      { ok: false, message: "The account is no longer active." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  try {
    await authenticationProviderAdmin().deleteUser(pending);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "The account is blocked locally. Provider deletion is pending a safe retry.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const deletedAt = new Date();
  const deletedSubject = `deleted:${privacyDigest(
    config.cookiePassword,
    "deleted-workos-user",
    pending,
  )}`;
  await database.transaction(async (transaction) => {
    const [finalized] = await transaction
      .update(schema.authIdentities)
      .set({
        providerSubject: deletedSubject,
        email: null,
        displayName: null,
        emailVerified: false,
        state: "deleted",
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(
        and(
          eq(schema.authIdentities.id, context.authIdentityId),
          eq(schema.authIdentities.state, "deletion_pending"),
        ),
      )
      .returning({ id: schema.authIdentities.id });
    if (!finalized) {
      const [alreadyFinalized] = await transaction
        .select({
          providerSubject: schema.authIdentities.providerSubject,
          state: schema.authIdentities.state,
        })
        .from(schema.authIdentities)
        .where(eq(schema.authIdentities.id, context.authIdentityId))
        .limit(1);
      if (
        alreadyFinalized?.state !== "deleted" ||
        alreadyFinalized.providerSubject !== deletedSubject
      ) {
        throw new Error("The pending deletion could not be finalized.");
      }
      return;
    }
    await transaction.insert(schema.authAuditEvents).values({
      actorAuthIdentityId: context.authIdentityId,
      providerSessionDigest: context.sessionId,
      eventType: "account_deleted",
      outcome: "success",
      metadata: {},
    });
  });

  const response = NextResponse.json(
    {
      ok: true,
      message:
        "The WorkOS account was deleted and its team workspaces were retired. Browser-local data was not changed.",
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
  clearWorkosSessionCookie(response, request.url);
  clearAcceptanceTestSessionCookie(response);
  response.headers.append("Set-Cookie", clearSessionCookie());
  return response;
}
