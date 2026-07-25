import { NextResponse } from "next/server";

import { getPersistenceConfig } from "@/server/config/persistence-config";
import {
  NO_STORE_HEADERS,
  persistenceJson,
  readBoundedJson,
  requestCookieValue,
} from "@/server/http/persistence-route";
import {
  BoundedRateLimiter,
  verifyMutationRequest,
} from "@/server/http/request-policy";
import { serializeSessionCookie } from "@/server/http/session-cookie";
import { identityService } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new BoundedRateLimiter({
  maximum: 20,
  windowMs: 15 * 60 * 1_000,
  maximumKeys: 10_000,
});

export async function POST(request: Request) {
  const config = getPersistenceConfig();
  if (config.mode !== "server") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          kind: "session_invalid",
          message: "Server persistence is not enabled.",
          retryable: false,
        },
      },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  const mutation = verifyMutationRequest(request, config.allowedOrigins);
  if (!mutation.ok) return persistenceJson(mutation);
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown-client";
  if (!limiter.allow(clientKey)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          kind: "temporarily_unavailable",
          message: "Too many workspace attempts. Try again later.",
          retryable: true,
        },
      },
      { status: 429, headers: NO_STORE_HEADERS },
    );
  }
  const body = await readBoundedJson(request, 4_096);
  if (!body.ok) return persistenceJson(body);
  const identity = identityService();
  if (!identity) {
    return persistenceJson({
      ok: false,
      error: {
        kind: "temporarily_unavailable",
        message: "The public workspace service is unavailable.",
        retryable: true,
      },
    });
  }
  const previousSessionToken = requestCookieValue(
    request,
    config.session.cookieName,
  );
  const selected = await identity.selectWorkspace({
    email: body.value.email,
    ...(previousSessionToken ? { previousSessionToken } : {}),
  });
  if (!selected.ok) return persistenceJson(selected);
  const response = NextResponse.json(
    { ok: true, workspace: selected.value.workspace },
    { status: 200, headers: NO_STORE_HEADERS },
  );
  response.headers.set(
    "Set-Cookie",
    serializeSessionCookie({
      token: selected.value.sessionToken,
      maxAgeSeconds: config.session.ttlSeconds,
    }),
  );
  return response;
}
