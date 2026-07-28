import { describe, expect, it } from "vitest";

import {
  authenticationFailureUrl,
  parseAuthenticationConfig,
  privacyDigest,
} from "@/server/auth/auth-config";

const SERVER_ENVIRONMENT = {
  PERSISTENCE_MODE: "server",
  DATABASE_URL: "postgresql://example.invalid/course_design",
  GCS_PROJECT_ID: "course-design-test",
  GCS_BUCKET: "course-design-test-private",
  GCS_LOCATION: "europe-west3",
  GCS_CLIENT_EMAIL: "service@example.test",
  GCS_PRIVATE_KEY: "test-private-key",
  ALLOWED_ORIGINS: "https://coursedesign.onrender.com",
  AUTH_BASE_URL: "https://coursedesign.onrender.com",
  WORKOS_CLIENT_ID: "client_course_design_test",
  WORKOS_API_KEY: "sk_test_course_design_test",
  WORKOS_WEBHOOK_SECRET: "whsec_course_design_test",
  WORKOS_COOKIE_PASSWORD: "course-design-cookie-password-at-least-32-bytes",
  WORKOS_COOKIE_NAME: "__Host-course-design-auth",
  WORKOS_COOKIE_MAX_AGE: "604800",
  WORKOS_COOKIE_SAMESITE: "lax",
  NEXT_PUBLIC_WORKOS_REDIRECT_URI:
    "https://coursedesign.onrender.com/auth/callback",
} as const;

describe("WorkOS authentication configuration", () => {
  it("keeps callback failures on the configured public origin", () => {
    expect(
      authenticationFailureUrl("https://coursedesign.onrender.com").href,
    ).toBe(
      "https://coursedesign.onrender.com/?authError=authentication-failed",
    );
  });

  it("locks the provider, tenant, redirect and seven-day host-only cookie", () => {
    expect(parseAuthenticationConfig(SERVER_ENVIRONMENT)).toMatchObject({
      provider: "workos",
      baseUrl: "https://coursedesign.onrender.com",
      clientId: "client_course_design_test",
      cookieName: "__Host-course-design-auth",
      cookieMaxAgeSeconds: 604800,
      cookieSameSite: "lax",
      redirectUri: "https://coursedesign.onrender.com/auth/callback",
    });
  });

  it("accepts the opaque signing-secret format currently issued by WorkOS", () => {
    expect(
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        WORKOS_WEBHOOK_SECRET: "AbCdEfGhIjKlMnOpQrStUvWxY",
      }).webhookSecret,
    ).toBe("AbCdEfGhIjKlMnOpQrStUvWxY");
    expect(() =>
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        WORKOS_WEBHOOK_SECRET: "too-short",
      }),
    ).toThrow("WorkOS webhook signing secret");
  });

  it("rejects browser persistence and unsafe or incomplete WorkOS settings", () => {
    expect(() =>
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        PERSISTENCE_MODE: "browser",
      }),
    ).toThrow("Authentication requires server persistence.");
    expect(() =>
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        WORKOS_COOKIE_PASSWORD: "too-short",
      }),
    ).toThrow("at least 32 bytes");
    expect(() =>
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        AUTH_BASE_URL: "http://coursedesign.onrender.com",
      }),
    ).toThrow("exact HTTPS origin");
    expect(() =>
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        NEXT_PUBLIC_WORKOS_REDIRECT_URI:
          "https://attacker.example/auth/callback",
      }),
    ).toThrow("must be AUTH_BASE_URL");
    expect(() =>
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        WORKOS_COOKIE_DOMAIN: ".onrender.com",
      }),
    ).toThrow("host-only");
  });

  it("supports local HTTP with a non-Host cookie and purpose-separated privacy digests", () => {
    const config = parseAuthenticationConfig({
      ...SERVER_ENVIRONMENT,
      ALLOWED_ORIGINS: "http://localhost:3000",
      AUTH_BASE_URL: "http://localhost:3000",
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3000/auth/callback",
      WORKOS_COOKIE_NAME: "course-design-auth",
    });
    const first = privacyDigest(
      config.cookiePassword,
      "workos-session",
      "same-value",
    );
    const second = privacyDigest(
      config.cookiePassword,
      "deleted-workos-user",
      "same-value",
    );
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });

  it("rejects cookie widening and duration drift", () => {
    expect(() =>
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        WORKOS_COOKIE_NAME: "wos-session",
      }),
    ).toThrow("__Host-course-design-auth");
    expect(() =>
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        WORKOS_COOKIE_MAX_AGE: "34560000",
      }),
    ).toThrow("seven days");
    expect(() =>
      parseAuthenticationConfig({
        ...SERVER_ENVIRONMENT,
        WORKOS_COOKIE_SAMESITE: "none",
      }),
    ).toThrow("must be lax");
  });
});
