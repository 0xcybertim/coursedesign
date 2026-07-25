import { PROVISIONAL_SESSION_COOKIE_NAME } from "@/server/config/persistence-config-values";
import { isOpaqueSessionToken } from "@/server/identity/session-token";

export function serializeSessionCookie(input: {
  readonly token: string;
  readonly maxAgeSeconds: number;
}): string {
  if (!isOpaqueSessionToken(input.token)) {
    throw new Error("Refusing to serialize an invalid session token.");
  }
  if (!Number.isSafeInteger(input.maxAgeSeconds) || input.maxAgeSeconds < 0) {
    throw new Error("Session cookie max age must be a non-negative integer.");
  }
  return [
    `${PROVISIONAL_SESSION_COOKIE_NAME}=${input.token}`,
    "Path=/",
    `Max-Age=${input.maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function clearSessionCookie(): string {
  return [
    `${PROVISIONAL_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}
