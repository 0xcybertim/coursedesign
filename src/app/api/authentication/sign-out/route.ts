import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { NextResponse } from "next/server";

import {
  parseAuthenticationConfig,
  privacyDigest,
} from "@/server/auth/auth-config";
import { clearAcceptanceTestSessionCookie } from "@/server/auth/acceptance-test-session";
import { authenticationProviderAdmin } from "@/server/auth/provider-admin";
import { resolveProviderSession } from "@/server/auth/provider-session";
import { clearWorkosSessionCookie } from "@/server/auth/session-cookie";
import { getPersistenceConfig } from "@/server/config/persistence-config";
import * as schema from "@/server/db/schema";
import {
  NO_STORE_HEADERS,
  persistenceJson,
} from "@/server/http/persistence-route";
import { verifyMutationRequest } from "@/server/http/request-policy";
import { clearSessionCookie } from "@/server/http/session-cookie";
import { runtimePool } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let authenticated;
  try {
    authenticated = await resolveProviderSession(request.headers);
  } catch {
    return NextResponse.json(
      { ok: false, message: "Sign-out is temporarily unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  if (!authenticated) {
    const response = NextResponse.json(
      { ok: true },
      { status: 200, headers: NO_STORE_HEADERS },
    );
    clearWorkosSessionCookie(response, request.url);
    clearAcceptanceTestSessionCookie(response);
    response.headers.append("Set-Cookie", clearSessionCookie());
    return response;
  }

  const config = parseAuthenticationConfig();
  const sessionDigest = privacyDigest(
    config.cookiePassword,
    "workos-session",
    authenticated.session.id,
  );
  const pool = runtimePool();
  if (!pool) {
    return NextResponse.json(
      { ok: false, message: "Sign-out is temporarily unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  const database = drizzle(pool, { schema });
  const now = new Date();
  await database
    .insert(schema.authRevokedProviderSessions)
    .values({
      providerSessionDigest: sessionDigest,
      expiresAt: authenticated.session.expiresAt,
      createdAt: now,
    })
    .onConflictDoNothing({
      target: schema.authRevokedProviderSessions.providerSessionDigest,
    });
  await database
    .update(schema.authSessionObservations)
    .set({ revokedAt: now, lastSeenAt: now, updatedAt: now })
    .where(
      eq(schema.authSessionObservations.providerSessionDigest, sessionDigest),
    );
  try {
    await authenticationProviderAdmin().revokeSession(authenticated.session.id);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "The local session is blocked, but WorkOS revocation must be retried.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  const response = NextResponse.json(
    { ok: true },
    { status: 200, headers: NO_STORE_HEADERS },
  );
  clearWorkosSessionCookie(response, request.url);
  clearAcceptanceTestSessionCookie(response);
  response.headers.append("Set-Cookie", clearSessionCookie());
  return response;
}
