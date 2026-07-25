import { createHash, randomBytes } from "node:crypto";

export const SESSION_TOKEN_BYTES = 32;
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateOpaqueSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function digestSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isOpaqueSessionToken(token: unknown): token is string {
  return typeof token === "string" && SESSION_TOKEN_PATTERN.test(token);
}
