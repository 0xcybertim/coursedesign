import "server-only";

import { NextResponse } from "next/server";

import type { ValidatedSessionContext } from "@/persistence";
import {
  PERSISTENCE_HTTP_STATUS,
  persistenceFailure,
  type PersistenceResult,
} from "@/persistence/result";
import {
  getPersistenceConfig,
  type ServerPersistenceConfig,
} from "@/server/config/persistence-config";
import { serializeSessionCookie } from "@/server/http/session-cookie";
import { identityService } from "@/server/runtime/persistence-runtime";

export const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const MAX_JSON_BYTES = 256 * 1024;

export interface RequestSession {
  readonly context: ValidatedSessionContext;
  readonly token: string;
  readonly config: ServerPersistenceConfig;
}

export function requestCookieValue(
  request: Request,
  name: string,
): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [candidate, ...value] = part.trim().split("=");
    if (candidate === name) return value.join("=");
  }
  return undefined;
}

export function persistenceJson<T>(
  result: PersistenceResult<T, unknown>,
  session?: Pick<RequestSession, "token" | "config">,
): NextResponse {
  const response = NextResponse.json(
    result,
    result.ok
      ? { status: 200, headers: NO_STORE_HEADERS }
      : {
          status: PERSISTENCE_HTTP_STATUS[result.error.kind],
          headers: NO_STORE_HEADERS,
        },
  );
  if (session) {
    response.headers.set(
      "Set-Cookie",
      serializeSessionCookie({
        token: session.token,
        maxAgeSeconds: session.config.session.ttlSeconds,
      }),
    );
  }
  return response;
}

export async function requestSession(
  request: Request,
): Promise<PersistenceResult<RequestSession>> {
  const config = getPersistenceConfig();
  if (config.mode !== "server") {
    return persistenceFailure(
      "session_invalid",
      "Server persistence is not enabled.",
    );
  }
  const token = requestCookieValue(request, config.session.cookieName);
  const identity = identityService();
  if (!token || !identity) {
    return persistenceFailure(
      "session_invalid",
      "Enter an email to open the public server workspace.",
    );
  }
  const validated = await identity.validateSession(token);
  return validated.ok
    ? {
        ok: true,
        value: { context: validated.value, token, config },
      }
    : validated;
}

export async function readBoundedJson(
  request: Request,
  maximumBytes = MAX_JSON_BYTES,
): Promise<PersistenceResult<Readonly<Record<string, unknown>>>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) {
    return persistenceFailure("validation", "The request body is too large.");
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maximumBytes) {
      return persistenceFailure("validation", "The request body is too large.");
    }
    const value = JSON.parse(text) as unknown;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value: value as Readonly<Record<string, unknown>> }
      : persistenceFailure("validation", "The request body must be an object.");
  } catch {
    return persistenceFailure(
      "validation",
      "The request body is invalid JSON.",
    );
  }
}
