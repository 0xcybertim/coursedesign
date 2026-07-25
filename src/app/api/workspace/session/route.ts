import { NextResponse } from "next/server";

import { getPersistenceConfig } from "@/server/config/persistence-config";
import {
  NO_STORE_HEADERS,
  persistenceJson,
  requestSession,
} from "@/server/http/persistence-route";
import { verifyMutationRequest } from "@/server/http/request-policy";
import { clearSessionCookie } from "@/server/http/session-cookie";
import {
  currentWorkspaceSummary,
  identityService,
} from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);
  const workspace = await currentWorkspaceSummary(session.value.context);
  return persistenceJson(workspace, session.value);
}

export async function DELETE(request: Request) {
  const config = getPersistenceConfig();
  if (config.mode !== "server") {
    return NextResponse.json(
      { ok: false },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  const mutation = verifyMutationRequest(request, config.allowedOrigins);
  if (!mutation.ok) return persistenceJson(mutation);
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);
  const identity = identityService();
  const cleared = identity
    ? await identity.clearSession(session.value.token)
    : {
        ok: false as const,
        error: {
          kind: "temporarily_unavailable" as const,
          message: "The public workspace service is unavailable.",
          retryable: true,
        },
      };
  const response = persistenceJson(cleared);
  if (cleared.ok) response.headers.set("Set-Cookie", clearSessionCookie());
  return response;
}
