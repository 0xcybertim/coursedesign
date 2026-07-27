import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  acceptanceTestModeEnabled,
  setAcceptanceTestSessionCookie,
} from "@/server/auth/acceptance-test-session";
import { getPersistenceConfig } from "@/server/config/persistence-config";
import {
  NO_STORE_HEADERS,
  persistenceJson,
  readBoundedJson,
} from "@/server/http/persistence-route";
import { verifyMutationRequest } from "@/server/http/request-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json(
    { ok: false },
    { status: 404, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  if (!acceptanceTestModeEnabled()) return notFound();
  const url = new URL(request.url);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    return notFound();
  }
  const persistence = getPersistenceConfig();
  if (persistence.mode !== "server") return notFound();
  const mutation = verifyMutationRequest(request, persistence.allowedOrigins);
  if (!mutation.ok) return persistenceJson(mutation);
  const body = await readBoundedJson(request, 2_048);
  if (!body.ok) return persistenceJson(body);

  const subject = body.value.subject;
  const email = body.value.email;
  const displayName = body.value.displayName;
  const emailVerified = body.value.emailVerified;
  if (
    typeof subject !== "string" ||
    !/^acceptance_user_[A-Za-z0-9_-]{4,100}$/.test(subject) ||
    typeof email !== "string" ||
    !/^[^@\s]+@[^@\s]+\.test$/.test(email) ||
    typeof displayName !== "string" ||
    displayName.length < 1 ||
    displayName.length > 100 ||
    typeof emailVerified !== "boolean"
  ) {
    return NextResponse.json(
      { ok: false, message: "Invalid acceptance-test identity." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const now = new Date();
  const response = NextResponse.json(
    { ok: true },
    { status: 200, headers: NO_STORE_HEADERS },
  );
  setAcceptanceTestSessionCookie(response, {
    subject,
    email: email.toLowerCase(),
    displayName,
    emailVerified,
    sessionId: `acceptance_session_${randomUUID().replaceAll("-", "")}`,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1_000).toISOString(),
    authenticatedAt: now.toISOString(),
  });
  return response;
}
