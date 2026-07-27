import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { parseAuthenticationConfig } from "./auth-config";
import type { AuthenticatedProviderSession } from "./provider-session";

export const ACCEPTANCE_TEST_COOKIE_NAME =
  "course-design-auth-acceptance" as const;

interface AcceptanceTestPayload {
  readonly subject: string;
  readonly email: string;
  readonly displayName: string;
  readonly emailVerified: boolean;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly authenticatedAt: string;
}

function enabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_ACCEPTANCE_TEST_MODE === "true"
  );
}

function secret(): string {
  const value = process.env.AUTH_ACCEPTANCE_TEST_SECRET?.trim() || "";
  if (new TextEncoder().encode(value).byteLength < 32) {
    throw new Error(
      "AUTH_ACCEPTANCE_TEST_SECRET must contain at least 32 bytes.",
    );
  }
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret())
    .update(payload, "utf8")
    .digest("base64url");
}

function cookieValue(headers: Headers): string | undefined {
  const cookie = headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACCEPTANCE_TEST_COOKIE_NAME}=`))
    ?.slice(ACCEPTANCE_TEST_COOKIE_NAME.length + 1);
}

function validPayload(value: unknown): value is AcceptanceTestPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.subject === "string" &&
    /^acceptance_user_[A-Za-z0-9_-]{4,100}$/.test(candidate.subject) &&
    typeof candidate.email === "string" &&
    /^[^@\s]+@[^@\s]+\.test$/.test(candidate.email) &&
    typeof candidate.displayName === "string" &&
    candidate.displayName.length >= 1 &&
    candidate.displayName.length <= 100 &&
    typeof candidate.emailVerified === "boolean" &&
    typeof candidate.sessionId === "string" &&
    /^acceptance_session_[A-Za-z0-9_-]{4,100}$/.test(candidate.sessionId) &&
    typeof candidate.expiresAt === "string" &&
    typeof candidate.authenticatedAt === "string"
  );
}

export function readAcceptanceTestSession(
  headers: Headers,
): AuthenticatedProviderSession | null {
  if (!enabled()) return null;
  const value = cookieValue(headers);
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const actual = value.slice(separator + 1);
  const expected = signature(payload);
  if (actual.length !== expected.length) return null;
  if (
    !timingSafeEqual(Buffer.from(actual, "utf8"), Buffer.from(expected, "utf8"))
  ) {
    return null;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!validPayload(decoded)) return null;
  const expiresAt = new Date(decoded.expiresAt);
  const authenticatedAt = new Date(decoded.authenticatedAt);
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now() ||
    !Number.isFinite(authenticatedAt.getTime())
  ) {
    return null;
  }
  const config = parseAuthenticationConfig();
  return {
    identity: {
      provider: "workos",
      tenantId: config.clientId,
      subject: decoded.subject,
      email: decoded.email,
      emailVerified: decoded.emailVerified,
      displayName: decoded.displayName,
    },
    session: {
      source: "local-acceptance",
      id: decoded.sessionId,
      expiresAt,
      authenticatedAt,
    },
  };
}

export function setAcceptanceTestSessionCookie(
  response: NextResponse,
  payload: AcceptanceTestPayload,
): void {
  if (!enabled()) throw new Error("Acceptance test sessions are disabled.");
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  response.cookies.set({
    name: ACCEPTANCE_TEST_COOKIE_NAME,
    value: `${encoded}.${signature(encoded)}`,
    path: "/",
    maxAge: 60 * 60,
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  });
}

export function clearAcceptanceTestSessionCookie(response: NextResponse): void {
  if (!enabled()) return;
  response.cookies.set({
    name: ACCEPTANCE_TEST_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  });
}

export function acceptanceTestModeEnabled(): boolean {
  return enabled();
}
