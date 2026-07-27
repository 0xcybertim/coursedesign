import "server-only";

import { parseAuthenticationConfig } from "./auth-config";
import {
  acceptanceTestModeEnabled,
  readAcceptanceTestSession,
} from "./acceptance-test-session";

export interface AuthenticatedProviderSession {
  readonly identity: {
    readonly provider: "workos";
    readonly tenantId: string;
    readonly subject: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly displayName: string | null;
  };
  readonly session: {
    readonly source: "workos" | "local-acceptance";
    readonly id: string;
    readonly expiresAt: Date;
    readonly authenticatedAt: Date;
  };
}

type ProviderSessionResolver = (
  headers: Headers,
) => Promise<AuthenticatedProviderSession | null>;

let testResolver: ProviderSessionResolver | undefined;

function claimDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value * 1_000);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function workosProviderSession(
  _headers: Headers,
): Promise<AuthenticatedProviderSession | null> {
  void _headers;
  const config = parseAuthenticationConfig();
  const { getTokenClaims, withAuth } =
    await import("@workos-inc/authkit-nextjs");
  const authenticated = await withAuth();
  if (!authenticated.user) return null;
  if (authenticated.impersonator) return null;

  const claims = await getTokenClaims(authenticated.accessToken);
  const expiresAt = claimDate(claims.exp);
  const authenticatedAt = claimDate(claims.auth_time);
  if (
    claims.sub !== authenticated.user.id ||
    !authenticated.sessionId ||
    !expiresAt ||
    expiresAt.getTime() <= Date.now() ||
    !authenticatedAt ||
    authenticatedAt.getTime() > Date.now() + 60_000
  ) {
    return null;
  }

  return {
    identity: {
      provider: "workos",
      tenantId: config.clientId,
      subject: authenticated.user.id,
      email: authenticated.user.email.trim().toLowerCase(),
      emailVerified: authenticated.user.emailVerified,
      displayName: authenticated.user.name,
    },
    session: {
      source: "workos",
      id: authenticated.sessionId,
      expiresAt,
      authenticatedAt,
    },
  };
}

export async function resolveProviderSession(
  headers: Headers,
): Promise<AuthenticatedProviderSession | null> {
  if (testResolver) return testResolver(headers);
  if (acceptanceTestModeEnabled()) {
    return readAcceptanceTestSession(headers);
  }
  return workosProviderSession(headers);
}

export function setProviderSessionResolverForTests(
  resolver: ProviderSessionResolver | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "The authentication test resolver is forbidden in production.",
    );
  }
  testResolver = resolver;
}
