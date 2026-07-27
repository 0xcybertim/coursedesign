import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { NextResponse } from "next/server";

import {
  parseAuthenticationConfig,
  privacyDigest,
} from "@/server/auth/auth-config";
import { verifyAuthenticationProviderWebhook } from "@/server/auth/provider-webhook";
import * as schema from "@/server/db/schema";
import { NO_STORE_HEADERS } from "@/server/http/persistence-route";
import { runtimePool } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 256 * 1_024;

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { ok: false },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }
  const payload = await request.text();
  if (new TextEncoder().encode(payload).byteLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { ok: false },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }
  const signature = request.headers.get("workos-signature");
  if (!signature) {
    return NextResponse.json(
      { ok: false },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let event;
  try {
    event = await verifyAuthenticationProviderWebhook(payload, signature);
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const config = parseAuthenticationConfig();
  const pool = runtimePool();
  if (!pool) {
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  const database = drizzle(pool, { schema });
  const now = new Date();
  const eventDigest = privacyDigest(
    config.cookiePassword,
    "workos-webhook-event",
    event.id,
  );

  await database.transaction(async (transaction) => {
    const [accepted] = await transaction
      .insert(schema.authWebhookEvents)
      .values({
        eventDigest,
        eventType: event.type === "ignored" ? event.providerType : event.type,
        processedAt: now,
      })
      .onConflictDoNothing({
        target: schema.authWebhookEvents.eventDigest,
      })
      .returning({ digest: schema.authWebhookEvents.eventDigest });
    if (!accepted) return;

    if (event.type === "session.revoked") {
      const sessionDigest = privacyDigest(
        config.cookiePassword,
        "workos-session",
        event.sessionId,
      );
      await transaction
        .insert(schema.authRevokedProviderSessions)
        .values({
          providerSessionDigest: sessionDigest,
          expiresAt: event.expiresAt,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: schema.authRevokedProviderSessions.providerSessionDigest,
        });
      const [identity] = await transaction
        .select({ id: schema.authIdentities.id })
        .from(schema.authIdentities)
        .where(
          and(
            eq(schema.authIdentities.provider, "workos"),
            eq(schema.authIdentities.providerTenantId, config.clientId),
            eq(schema.authIdentities.providerSubject, event.subject),
          ),
        )
        .limit(1);
      if (identity) {
        await transaction
          .update(schema.authSessionObservations)
          .set({ revokedAt: now, updatedAt: now })
          .where(
            eq(
              schema.authSessionObservations.providerSessionDigest,
              sessionDigest,
            ),
          );
        await transaction.insert(schema.authAuditEvents).values({
          actorAuthIdentityId: identity.id,
          providerSessionDigest: sessionDigest,
          eventType: "provider_session_revoked",
          outcome: "success",
          metadata: {},
        });
      }
      return;
    }

    if (event.type === "user.deleted") {
      const [identity] = await transaction
        .select({ id: schema.authIdentities.id })
        .from(schema.authIdentities)
        .where(
          and(
            eq(schema.authIdentities.provider, "workos"),
            eq(schema.authIdentities.providerTenantId, config.clientId),
            eq(schema.authIdentities.providerSubject, event.subject),
          ),
        )
        .limit(1);
      if (!identity) return;
      const [applicationUser] = await transaction
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.authIdentityId, identity.id))
        .limit(1);
      if (applicationUser) {
        const memberships = await transaction
          .select({
            workspaceId: schema.workspaceMemberships.workspaceId,
            role: schema.workspaceMemberships.role,
          })
          .from(schema.workspaceMemberships)
          .where(eq(schema.workspaceMemberships.userId, applicationUser.id));
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
      }
      await transaction
        .update(schema.authSessionObservations)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(schema.authSessionObservations.authIdentityId, identity.id));
      await transaction.insert(schema.authAuditEvents).values({
        actorAuthIdentityId: identity.id,
        eventType: "provider_user_deleted",
        outcome: "success",
        metadata: {},
      });
      await transaction
        .update(schema.authIdentities)
        .set({
          providerSubject: `deleted:${privacyDigest(
            config.cookiePassword,
            "deleted-workos-user",
            event.subject,
          )}`,
          email: null,
          displayName: null,
          emailVerified: false,
          state: "deleted",
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.authIdentities.id, identity.id));
    }
  });

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
