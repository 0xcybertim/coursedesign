import "server-only";

import { createHmac } from "node:crypto";

import {
  parsePersistenceConfig,
  PersistenceConfigError,
} from "@/server/config/persistence-config";

type Environment = Readonly<Record<string, string | undefined>>;

export interface AuthenticationConfig {
  readonly provider: "workos";
  readonly clientId: string;
  readonly apiKey: string;
  readonly webhookSecret: string;
  readonly cookiePassword: string;
  readonly cookieName: string;
  readonly cookieMaxAgeSeconds: 604800;
  readonly cookieSameSite: "lax";
  readonly redirectUri: string;
  readonly baseUrl: string;
  readonly trustedOrigins: readonly string[];
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new PersistenceConfigError(
      `Required authentication configuration ${name} is missing.`,
    );
  }
  return value;
}

function exactOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PersistenceConfigError(`${name} must be an absolute URL.`);
  }
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (
    url.origin !== value ||
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password
  ) {
    throw new PersistenceConfigError(
      `${name} must be an exact HTTPS origin or a local HTTP origin.`,
    );
  }
  return url.origin;
}

export function parseAuthenticationConfig(
  environment: Environment = process.env,
): AuthenticationConfig {
  const persistence = parsePersistenceConfig(environment);
  if (persistence.mode !== "server") {
    throw new PersistenceConfigError(
      "Authentication requires server persistence.",
    );
  }

  const baseUrl = exactOrigin(
    environment.AUTH_BASE_URL?.trim() || persistence.allowedOrigins[0]!,
    "AUTH_BASE_URL",
  );
  const redirectUri = required(environment, "NEXT_PUBLIC_WORKOS_REDIRECT_URI");
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new PersistenceConfigError(
      "NEXT_PUBLIC_WORKOS_REDIRECT_URI must be an absolute URL.",
    );
  }
  if (
    redirect.origin !== baseUrl ||
    redirect.pathname !== "/auth/callback" ||
    redirect.search ||
    redirect.hash ||
    redirect.username ||
    redirect.password
  ) {
    throw new PersistenceConfigError(
      "NEXT_PUBLIC_WORKOS_REDIRECT_URI must be AUTH_BASE_URL plus /auth/callback.",
    );
  }

  const clientId = required(environment, "WORKOS_CLIENT_ID");
  if (!/^client_[A-Za-z0-9_-]+$/.test(clientId)) {
    throw new PersistenceConfigError(
      "WORKOS_CLIENT_ID must be a WorkOS client identifier.",
    );
  }
  const apiKey = required(environment, "WORKOS_API_KEY");
  if (!/^sk_(?:test|live)_[A-Za-z0-9_-]+$/.test(apiKey)) {
    throw new PersistenceConfigError(
      "WORKOS_API_KEY must be a WorkOS test or live secret key.",
    );
  }
  const webhookSecret = required(environment, "WORKOS_WEBHOOK_SECRET");
  if (!/^whsec_[A-Za-z0-9_-]+$/.test(webhookSecret)) {
    throw new PersistenceConfigError(
      "WORKOS_WEBHOOK_SECRET must be a WorkOS webhook signing secret.",
    );
  }
  const cookiePassword = required(environment, "WORKOS_COOKIE_PASSWORD");
  if (new TextEncoder().encode(cookiePassword).byteLength < 32) {
    throw new PersistenceConfigError(
      "WORKOS_COOKIE_PASSWORD must contain at least 32 bytes.",
    );
  }

  const isHttps = baseUrl.startsWith("https://");
  const expectedCookieName = isHttps
    ? "__Host-course-design-auth"
    : "course-design-auth";
  const cookieName =
    environment.WORKOS_COOKIE_NAME?.trim() || expectedCookieName;
  if (cookieName !== expectedCookieName) {
    throw new PersistenceConfigError(
      `WORKOS_COOKIE_NAME must be ${expectedCookieName} for this origin.`,
    );
  }
  if (environment.WORKOS_COOKIE_DOMAIN?.trim()) {
    throw new PersistenceConfigError(
      "WORKOS_COOKIE_DOMAIN must remain unset so the session cookie is host-only.",
    );
  }
  const cookieMaxAge = environment.WORKOS_COOKIE_MAX_AGE?.trim() || "604800";
  if (cookieMaxAge !== "604800") {
    throw new PersistenceConfigError(
      "WORKOS_COOKIE_MAX_AGE must be 604800 seconds (seven days).",
    );
  }
  const sameSite =
    environment.WORKOS_COOKIE_SAMESITE?.trim().toLowerCase() || "lax";
  if (sameSite !== "lax") {
    throw new PersistenceConfigError(
      "WORKOS_COOKIE_SAMESITE must be lax for the hosted authentication callback.",
    );
  }

  return {
    provider: "workos",
    clientId,
    apiKey,
    webhookSecret,
    cookiePassword,
    cookieName,
    cookieMaxAgeSeconds: 604800,
    cookieSameSite: "lax",
    redirectUri: redirect.toString(),
    baseUrl,
    trustedOrigins: persistence.allowedOrigins,
  };
}

export function privacyDigest(
  secret: string,
  purpose: string,
  value: string,
): string {
  return createHmac("sha256", secret)
    .update(`${purpose}\0${value}`, "utf8")
    .digest("hex");
}
