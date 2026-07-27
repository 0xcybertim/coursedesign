import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { POST as requestAccountDeletion } from "@/app/api/account/delete/request/route";
import { GET as exportAccount } from "@/app/api/account/export/route";
import { POST as signOut } from "@/app/api/authentication/sign-out/route";
import { POST as workosWebhook } from "@/app/api/authentication/workos-webhook/route";
import {
  COURSE_DESIGN_CSRF_HEADER,
  COURSE_DESIGN_CSRF_VALUE,
} from "@/persistence";
import {
  setAuthenticationProviderAdminForTests,
  type AuthenticationProviderAdmin,
} from "@/server/auth/provider-admin";
import {
  setProviderSessionResolverForTests,
  type AuthenticatedProviderSession,
} from "@/server/auth/provider-session";
import {
  setAuthenticationProviderWebhookVerifierForTests,
  type AuthenticationProviderWebhookEvent,
} from "@/server/auth/provider-webhook";
import { authenticatedWorkspaceSession } from "@/server/auth/workspace-authorization";

import {
  migrateCourseDesignTestDatabase,
  TEST_MIGRATION_URL,
  truncateCourseDesignTestData,
  withTestClient,
} from "../support/course-design-test-database";

const ORIGIN = "http://localhost:3000";
const priorEnvironment = new Map<string, string | undefined>();
const sessions = new Map<string, AuthenticatedProviderSession>();
const webhookEvents = new Map<string, AuthenticationProviderWebhookEvent>();
let providerAdmin: AuthenticationProviderAdmin;

function setEnvironment(name: string, value: string) {
  if (!priorEnvironment.has(name))
    priorEnvironment.set(name, process.env[name]);
  process.env[name] = value;
}

function providerSession(input: {
  readonly id: string;
  readonly subject: string;
  readonly email: string;
  readonly tenantId?: string;
  readonly verified?: boolean;
  readonly authenticatedAt?: Date;
}): AuthenticatedProviderSession {
  return {
    identity: {
      provider: "workos",
      tenantId: input.tenantId ?? "client_course_design_test",
      subject: input.subject,
      email: input.email.toLowerCase(),
      emailVerified: input.verified ?? true,
      displayName: "Test Rider",
    },
    session: {
      source: "workos",
      id: input.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      authenticatedAt: input.authenticatedAt ?? new Date(),
    },
  };
}

function headers(sessionId: string, mutation = false): Headers {
  return new Headers({
    "x-test-provider-session": sessionId,
    ...(mutation
      ? {
          origin: ORIGIN,
          "sec-fetch-site": "same-origin",
          [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE,
        }
      : {}),
  });
}

async function authorize(session: AuthenticatedProviderSession) {
  sessions.set(session.session.id, session);
  const result = await authenticatedWorkspaceSession(
    headers(session.session.id),
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

beforeAll(async () => {
  setEnvironment("PERSISTENCE_MODE", "server");
  setEnvironment("DATABASE_URL", TEST_MIGRATION_URL);
  setEnvironment("DATABASE_POOL_MAX", "4");
  setEnvironment("GCS_PROJECT_ID", "course-design-test");
  setEnvironment("GCS_BUCKET", "course-design-test-private");
  setEnvironment("GCS_LOCATION", "europe-west3");
  setEnvironment("GCS_CLIENT_EMAIL", "test@example.test");
  setEnvironment("GCS_PRIVATE_KEY", "not-used-by-auth-tests");
  setEnvironment("ALLOWED_ORIGINS", ORIGIN);
  setEnvironment("AUTH_BASE_URL", ORIGIN);
  setEnvironment("WORKOS_CLIENT_ID", "client_course_design_test");
  setEnvironment("WORKOS_API_KEY", "sk_test_course_design_test");
  setEnvironment("WORKOS_WEBHOOK_SECRET", "whsec_course_design_test");
  setEnvironment(
    "WORKOS_COOKIE_PASSWORD",
    "course-design-cookie-password-at-least-32-bytes",
  );
  setEnvironment("WORKOS_COOKIE_NAME", "course-design-auth");
  setEnvironment("WORKOS_COOKIE_MAX_AGE", "604800");
  setEnvironment("WORKOS_COOKIE_SAMESITE", "lax");
  setEnvironment("NEXT_PUBLIC_WORKOS_REDIRECT_URI", `${ORIGIN}/auth/callback`);
  setProviderSessionResolverForTests(async (requestHeaders) => {
    const id = requestHeaders.get("x-test-provider-session");
    return id ? (sessions.get(id) ?? null) : null;
  });
  setAuthenticationProviderWebhookVerifierForTests(
    async (payload, signature) => {
      if (signature !== "test-signature") throw new Error("Invalid signature.");
      const event = webhookEvents.get(payload);
      if (!event) throw new Error("Unknown test event.");
      return event;
    },
  );
  await migrateCourseDesignTestDatabase();
});

afterAll(async () => {
  setProviderSessionResolverForTests(undefined);
  setAuthenticationProviderWebhookVerifierForTests(undefined);
  setAuthenticationProviderAdminForTests(undefined);
  if (globalThis.courseDesignRuntimePool) {
    await globalThis.courseDesignRuntimePool.end();
    globalThis.courseDesignRuntimePool = undefined;
  }
  for (const [name, value] of priorEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(async () => {
  sessions.clear();
  webhookEvents.clear();
  providerAdmin = {
    deleteUser: vi.fn(async () => undefined),
    revokeSession: vi.fn(async () => undefined),
  };
  setAuthenticationProviderAdminForTests(providerAdmin);
  await truncateCourseDesignTestData();
});

describe("WorkOS authentication boundary", () => {
  it("maps a verified provider subject, stores only a session digest, and provisions one private team", async () => {
    const authenticated = providerSession({
      id: "session_raw_secret_1",
      subject: "user_workos_1",
      email: "Rider@Example.TEST",
    });
    const context = await authorize(authenticated);

    expect(context).toMatchObject({
      membershipRole: "owner",
      authenticatedAt: expect.any(String),
    });
    expect(context.sessionId).toMatch(/^[0-9a-f]{64}$/);
    expect(context.sessionId).not.toContain(authenticated.session.id);

    await withTestClient(async (client) => {
      const state = await client.query<{
        provider: string;
        tenant: string;
        subject: string;
        email: string;
        session_digest: string;
        workspaces: string;
        designs: string;
        courses: string;
      }>(`
        SELECT
          identity.provider,
          identity.provider_tenant_id AS tenant,
          identity.provider_subject AS subject,
          identity.email,
          observation.provider_session_digest AS session_digest,
          (SELECT count(*) FROM workspaces WHERE retired_at IS NULL) AS workspaces,
          (SELECT count(*) FROM designs) AS designs,
          (SELECT count(*) FROM courses) AS courses
        FROM auth_identities AS identity
        JOIN auth_session_observations AS observation
          ON observation.auth_identity_id = identity.id
      `);
      expect(state.rows[0]).toEqual({
        provider: "workos",
        tenant: "client_course_design_test",
        subject: "user_workos_1",
        email: "rider@example.test",
        session_digest: context.sessionId,
        workspaces: "1",
        designs: "1",
        courses: "1",
      });
      expect(JSON.stringify(state.rows)).not.toContain("session_raw_secret_1");
    });
  });

  it("never uses matching email addresses to claim or merge workspaces", async () => {
    const first = await authorize(
      providerSession({
        id: "session_email_1",
        subject: "user_email_1",
        email: "shared@example.test",
      }),
    );
    const second = await authorize(
      providerSession({
        id: "session_email_2",
        subject: "user_email_2",
        email: "shared@example.test",
      }),
    );

    expect(first.userId).not.toBe(second.userId);
    expect(first.workspaceId).not.toBe(second.workspaceId);
    await withTestClient(async (client) => {
      const count = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM auth_identities
         WHERE email = 'shared@example.test'`,
      );
      expect(count.rows[0]?.count).toBe(2);
    });
  });

  it("keeps WorkOS staging and production tenants distinct", async () => {
    const first = await authorize(
      providerSession({
        id: "session_tenant_1",
        subject: "user_same",
        email: "same@example.test",
        tenantId: "client_staging",
      }),
    );
    const second = await authorize(
      providerSession({
        id: "session_tenant_2",
        subject: "user_same",
        email: "same@example.test",
        tenantId: "client_production",
      }),
    );
    expect(first.authIdentityId).not.toBe(second.authIdentityId);
    expect(first.workspaceId).not.toBe(second.workspaceId);
  });

  it("rejects unverified and expired provider sessions before database ownership resolution", async () => {
    const unverified = providerSession({
      id: "session_unverified",
      subject: "user_unverified",
      email: "unverified@example.test",
      verified: false,
    });
    sessions.set(unverified.session.id, unverified);
    expect(
      await authenticatedWorkspaceSession(headers(unverified.session.id)),
    ).toMatchObject({
      ok: false,
      error: { kind: "session_invalid" },
    });

    const expired = providerSession({
      id: "session_expired",
      subject: "user_expired",
      email: "expired@example.test",
    });
    const expiredValue: AuthenticatedProviderSession = {
      ...expired,
      session: {
        ...expired.session,
        expiresAt: new Date(Date.now() - 1_000),
      },
    };
    sessions.set(expiredValue.session.id, expiredValue);
    expect(
      await authenticatedWorkspaceSession(headers(expiredValue.session.id)),
    ).toMatchObject({
      ok: false,
      error: { kind: "session_invalid" },
    });
  });

  it("exports only authorized application data and no provider/session secrets", async () => {
    const authenticated = providerSession({
      id: "session_export_secret",
      subject: "user_export_secret",
      email: "export@example.test",
    });
    const context = await authorize(authenticated);
    const response = await exportAccount(
      new Request(`${ORIGIN}/api/account/export`, {
        headers: headers(authenticated.session.id),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      exportVersion: "course-design-account-export-v1",
      account: { email: "export@example.test", emailVerified: true },
      workspace: { id: context.workspaceId },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /session_export_secret|user_export_secret|providerSubject|accessToken|refreshToken|cookiePassword/,
    );
  });

  it("deletes through WorkOS after fresh reauthentication, retires the team, and preserves immutable revisions", async () => {
    const authenticated = providerSession({
      id: "session_delete",
      subject: "user_delete",
      email: "delete@example.test",
    });
    const context = await authorize(authenticated);
    await withTestClient(async (client) => {
      await client.query(
        `INSERT INTO design_revisions (
           workspace_id, design_id, ordinal, name, configuration_hash,
           domain_schema_version, snapshot
         )
         SELECT workspace_id, id, 1, 'Preserved revision', $1,
           domain_schema_version, draft_snapshot
         FROM designs
         WHERE workspace_id = $2
         LIMIT 1`,
        ["d".repeat(64), context.workspaceId],
      );
    });

    const response = await requestAccountDeletion(
      new Request(`${ORIGIN}/api/account/delete/request`, {
        method: "POST",
        headers: headers(authenticated.session.id, true),
      }),
    );
    expect(response.status).toBe(200);
    expect(providerAdmin.deleteUser).toHaveBeenCalledWith("user_delete");
    expect(response.headers.get("set-cookie")).toContain(
      "course-design-auth=; Path=/",
    );

    await withTestClient(async (client) => {
      const state = await client.query<{
        state: string;
        email: string | null;
        provider_subject: string;
        retired: string;
        revisions: string;
      }>(
        `
        SELECT
          identity.state,
          identity.email,
          identity.provider_subject,
          (SELECT count(*) FROM workspaces
            WHERE retirement_reason = 'account_deletion_requested') AS retired,
          (SELECT count(*) FROM design_revisions) AS revisions
        FROM auth_identities AS identity
        WHERE identity.id = $1
      `,
        [context.authIdentityId],
      );
      expect(state.rows[0]).toMatchObject({
        state: "deleted",
        email: null,
        provider_subject: expect.stringMatching(/^deleted:[0-9a-f]{64}$/),
        retired: "1",
        revisions: "1",
      });
    });
  });

  it("fails closed in deletion_pending when WorkOS deletion fails", async () => {
    providerAdmin.deleteUser = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    const authenticated = providerSession({
      id: "session_delete_failure",
      subject: "user_delete_failure",
      email: "delete-failure@example.test",
    });
    const context = await authorize(authenticated);
    const response = await requestAccountDeletion(
      new Request(`${ORIGIN}/api/account/delete/request`, {
        method: "POST",
        headers: headers(authenticated.session.id, true),
      }),
    );
    expect(response.status).toBe(503);
    await withTestClient(async (client) => {
      const identity = await client.query<{ state: string }>(
        "SELECT state FROM auth_identities WHERE id = $1",
        [context.authIdentityId],
      );
      expect(identity.rows[0]?.state).toBe("deletion_pending");
    });
    expect(
      await authenticatedWorkspaceSession(headers(authenticated.session.id)),
    ).toMatchObject({ ok: false });
  });

  it("finishes deletion when the WorkOS webhook wins the finalization race", async () => {
    const authenticated = providerSession({
      id: "session_delete_webhook_race",
      subject: "user_delete_webhook_race",
      email: "delete-webhook-race@example.test",
    });
    const context = await authorize(authenticated);
    webhookEvents.set("delete-race-payload", {
      id: "event_delete_race_1",
      type: "user.deleted",
      subject: authenticated.identity.subject,
    });
    providerAdmin.deleteUser = vi.fn(async () => {
      const response = await workosWebhook(
        new Request(`${ORIGIN}/api/authentication/workos-webhook`, {
          method: "POST",
          headers: { "workos-signature": "test-signature" },
          body: "delete-race-payload",
        }),
      );
      expect(response.status).toBe(200);
    });

    const response = await requestAccountDeletion(
      new Request(`${ORIGIN}/api/account/delete/request`, {
        method: "POST",
        headers: headers(authenticated.session.id, true),
      }),
    );

    expect(response.status).toBe(200);
    expect(providerAdmin.deleteUser).toHaveBeenCalledWith(
      authenticated.identity.subject,
    );
    await withTestClient(async (client) => {
      const identity = await client.query<{
        state: string;
        provider_subject: string;
      }>(
        `SELECT state, provider_subject
         FROM auth_identities
         WHERE id = $1`,
        [context.authIdentityId],
      );
      expect(identity.rows[0]).toMatchObject({
        state: "deleted",
        provider_subject: expect.stringMatching(/^deleted:[0-9a-f]{64}$/),
      });
    });
  });

  it("requires exact same-origin CSRF protection for deletion", async () => {
    const authenticated = providerSession({
      id: "session_csrf",
      subject: "user_csrf",
      email: "csrf@example.test",
    });
    await authorize(authenticated);
    const response = await requestAccountDeletion(
      new Request(`${ORIGIN}/api/account/delete/request`, {
        method: "POST",
        headers: { "x-test-provider-session": authenticated.session.id },
      }),
    );
    expect(response.status).toBe(404);
    expect(providerAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it("revokes both the local observation and the WorkOS session on logout", async () => {
    const authenticated = providerSession({
      id: "session_logout",
      subject: "user_logout",
      email: "logout@example.test",
    });
    const context = await authorize(authenticated);
    const response = await signOut(
      new Request(`${ORIGIN}/api/authentication/sign-out`, {
        method: "POST",
        headers: headers(authenticated.session.id, true),
      }),
    );
    expect(response.status).toBe(200);
    expect(providerAdmin.revokeSession).toHaveBeenCalledWith("session_logout");
    await withTestClient(async (client) => {
      const observation = await client.query<{ revoked: boolean }>(
        `SELECT revoked_at IS NOT NULL AS revoked
         FROM auth_session_observations
         WHERE provider_session_digest = $1`,
        [context.sessionId],
      );
      expect(observation.rows[0]?.revoked).toBe(true);
    });
  });

  it("applies signed WorkOS revocation webhooks once and blocks the observed session", async () => {
    const authenticated = providerSession({
      id: "session_webhook_revoke",
      subject: "user_webhook_revoke",
      email: "webhook-revoke@example.test",
    });
    const context = await authorize(authenticated);
    webhookEvents.set("revoke-payload", {
      id: "event_revoke_1",
      type: "session.revoked",
      sessionId: authenticated.session.id,
      subject: authenticated.identity.subject,
      expiresAt: authenticated.session.expiresAt,
    });
    const request = () =>
      new Request(`${ORIGIN}/api/authentication/workos-webhook`, {
        method: "POST",
        headers: { "workos-signature": "test-signature" },
        body: "revoke-payload",
      });
    expect((await workosWebhook(request())).status).toBe(200);
    expect((await workosWebhook(request())).status).toBe(200);
    expect(
      await authenticatedWorkspaceSession(headers(authenticated.session.id)),
    ).toMatchObject({ ok: false });

    await withTestClient(async (client) => {
      const state = await client.query<{
        events: number;
        revoked: boolean;
      }>(
        `SELECT
           (SELECT count(*)::int FROM auth_webhook_events) AS events,
           revoked_at IS NOT NULL AS revoked
         FROM auth_session_observations
         WHERE provider_session_digest = $1`,
        [context.sessionId],
      );
      expect(state.rows[0]).toEqual({ events: 1, revoked: true });
    });
  });

  it("retires the local team when a signed WorkOS user-deleted webhook arrives", async () => {
    const authenticated = providerSession({
      id: "session_webhook_delete",
      subject: "user_webhook_delete",
      email: "webhook-delete@example.test",
    });
    const context = await authorize(authenticated);
    webhookEvents.set("delete-payload", {
      id: "event_delete_1",
      type: "user.deleted",
      subject: authenticated.identity.subject,
    });
    const response = await workosWebhook(
      new Request(`${ORIGIN}/api/authentication/workos-webhook`, {
        method: "POST",
        headers: { "workos-signature": "test-signature" },
        body: "delete-payload",
      }),
    );
    expect(response.status).toBe(200);
    await withTestClient(async (client) => {
      const state = await client.query<{
        state: string;
        email: string | null;
        reason: string;
      }>(
        `SELECT identity.state, identity.email,
                workspace.retirement_reason AS reason
         FROM auth_identities AS identity
         JOIN users AS app_user
           ON app_user.auth_identity_id = identity.id
         JOIN workspace_memberships AS membership
           ON membership.user_id = app_user.id
         JOIN workspaces AS workspace
           ON workspace.id = membership.workspace_id
         WHERE identity.id = $1`,
        [context.authIdentityId],
      );
      expect(state.rows[0]).toEqual({
        state: "deleted",
        email: null,
        reason: "account_deletion_requested",
      });
    });
  });

  it("rejects unsigned WorkOS webhooks without touching the database", async () => {
    const response = await workosWebhook(
      new Request(`${ORIGIN}/api/authentication/workos-webhook`, {
        method: "POST",
        body: "unsigned",
      }),
    );
    expect(response.status).toBe(400);
    await withTestClient(async (client) => {
      const count = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM auth_webhook_events",
      );
      expect(count.rows[0]?.count).toBe(0);
    });
  });
});
