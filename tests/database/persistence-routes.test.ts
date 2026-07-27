import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PATCH as patchDesign } from "@/app/api/designs/local-spj-04/route";
import { GET as getDesign } from "@/app/api/designs/local-spj-04/route";
import { GET as getDesignRevisions } from "@/app/api/designs/local-spj-04/revisions/route";
import { GET as getCourse } from "@/app/api/courses/local-course-1/route";
import { POST as selectWorkspace } from "@/app/api/workspace/select/route";
import { updateLocalDraft, type ObstacleDraft } from "@/domain/design";
import {
  COURSE_DESIGN_CSRF_HEADER,
  COURSE_DESIGN_CSRF_VALUE,
} from "@/persistence";
import type { DesignRecord, PersistenceResult } from "@/persistence";
import {
  setProviderSessionResolverForTests,
  type AuthenticatedProviderSession,
} from "@/server/auth/provider-session";

import {
  migrateCourseDesignTestDatabase,
  TEST_MIGRATION_URL,
  truncateCourseDesignTestData,
} from "../support/course-design-test-database";

const ORIGIN = "http://localhost:3000";
const priorEnvironment = new Map<string, string | undefined>();
const sessions = new Map<string, AuthenticatedProviderSession>();

function setEnvironment(name: string, value: string) {
  if (!priorEnvironment.has(name)) {
    priorEnvironment.set(name, process.env[name]);
  }
  process.env[name] = value;
}

function mutationHeaders(cookie?: string) {
  return {
    "content-type": "application/json",
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
    [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE,
    ...(cookie ? { cookie } : {}),
  };
}

async function select(email: string) {
  const sessionId = `session_${crypto.randomUUID()}`;
  sessions.set(sessionId, {
    identity: {
      provider: "workos",
      tenantId: "client_course_design_test",
      subject: `user_${crypto.randomUUID()}`,
      email,
      emailVerified: true,
      displayName: "Persistence test user",
    },
    session: {
      source: "workos",
      id: sessionId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      authenticatedAt: new Date(),
    },
  });
  return { cookie: `test-workos-session=${sessionId}` };
}

beforeAll(async () => {
  setEnvironment("PERSISTENCE_MODE", "server");
  setEnvironment("DATABASE_URL", TEST_MIGRATION_URL);
  setEnvironment("DATABASE_POOL_MAX", "4");
  setEnvironment("GCS_PROJECT_ID", "course-design-test");
  setEnvironment("GCS_BUCKET", "course-design-test-private");
  setEnvironment("GCS_LOCATION", "europe-west3");
  setEnvironment("GCS_CLIENT_EMAIL", "test@example.test");
  setEnvironment("GCS_PRIVATE_KEY", "not-used-by-route-tests");
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
    const cookie = requestHeaders.get("cookie") ?? "";
    const id = cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("test-workos-session="))
      ?.slice("test-workos-session=".length);
    return id ? (sessions.get(id) ?? null) : null;
  });
  await migrateCourseDesignTestDatabase();
});

afterAll(async () => {
  setProviderSessionResolverForTests(undefined);
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
  await truncateCourseDesignTestData();
});

describe("server persistence routes", () => {
  it("permanently rejects the retired public email selector", async () => {
    const response = await selectWorkspace(
      new Request(`${ORIGIN}/api/workspace/select`, {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({ email: "retired@example.test" }),
      }),
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { kind: "forbidden", retryable: false },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("requires a validated session and ignores client ownership identifiers", async () => {
    const missing = await getDesign(
      new Request(`${ORIGIN}/api/designs/local-spj-04`),
    );
    expect(missing.status).toBe(401);

    const selected = await select("route-a@example.test");
    const response = await getDesign(
      new Request(`${ORIGIN}/api/designs/local-spj-04`, {
        headers: { cookie: selected.cookie },
      }),
    );
    const body = (await response.json()) as PersistenceResult<DesignRecord>;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      value: {
        routeKey: "local-spj-04",
        lockVersion: 1,
        draft: { designId: "local-spj-04" },
      },
    });
  });

  it("maps database compare-and-swap conflicts without overwriting", async () => {
    const selected = await select("route-a@example.test");
    const loadedResponse = await getDesign(
      new Request(`${ORIGIN}/api/designs/local-spj-04`, {
        headers: { cookie: selected.cookie },
      }),
    );
    const loaded =
      (await loadedResponse.json()) as PersistenceResult<DesignRecord>;
    if (!loaded.ok) throw new Error(loaded.error.message);
    const changed = updateLocalDraft(
      {
        schemaVersion: "1.0.0-phase1b",
        designId: "local-spj-04",
        draft: loaded.value.draft,
        revisions: [],
      },
      { ...loaded.value.draft.intent, frameColor: "red" },
      "2026-07-25T11:00:00.000Z",
    );
    if (!changed.ok) throw new Error(changed.error.message);
    const request = (draft: ObstacleDraft) =>
      new Request(`${ORIGIN}/api/designs/local-spj-04`, {
        method: "PATCH",
        headers: mutationHeaders(selected.cookie),
        body: JSON.stringify({
          expectedLockVersion: 1,
          draft,
          workspaceId: "different-client-workspace",
          userId: "different-client-user",
        }),
      });
    const first = await patchDesign(request(changed.value.draft));
    expect(first.status).toBe(200);

    const staleDraft = updateLocalDraft(
      {
        schemaVersion: "1.0.0-phase1b",
        designId: "local-spj-04",
        draft: loaded.value.draft,
        revisions: [],
      },
      { ...loaded.value.draft.intent, frameColor: "yellow" },
      "2026-07-25T11:00:01.000Z",
    );
    if (!staleDraft.ok) throw new Error(staleDraft.error.message);
    const stale = await patchDesign(request(staleDraft.value.draft));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      ok: false,
      error: {
        kind: "stale_version",
        actualLockVersion: 2,
        latest: { draft: { intent: { frameColor: "red" } } },
      },
    });
  });

  it("isolates two authenticated users even when they request the same public route key", async () => {
    const firstUser = await select("isolation-a@example.test");
    const secondUser = await select("isolation-b@example.test");
    const firstLoadedResponse = await getDesign(
      new Request(`${ORIGIN}/api/designs/local-spj-04`, {
        headers: { cookie: firstUser.cookie },
      }),
    );
    const firstLoaded =
      (await firstLoadedResponse.json()) as PersistenceResult<DesignRecord>;
    if (!firstLoaded.ok) throw new Error(firstLoaded.error.message);
    const firstChanged = updateLocalDraft(
      {
        schemaVersion: "1.0.0-phase1b",
        designId: "local-spj-04",
        draft: firstLoaded.value.draft,
        revisions: [],
      },
      { ...firstLoaded.value.draft.intent, frameColor: "red" },
      "2026-07-25T11:00:00.000Z",
    );
    if (!firstChanged.ok) throw new Error(firstChanged.error.message);
    const saved = await patchDesign(
      new Request(`${ORIGIN}/api/designs/local-spj-04`, {
        method: "PATCH",
        headers: mutationHeaders(firstUser.cookie),
        body: JSON.stringify({
          expectedLockVersion: firstLoaded.value.lockVersion,
          draft: firstChanged.value.draft,
        }),
      }),
    );
    expect(saved.status).toBe(200);

    const secondLoadedResponse = await getDesign(
      new Request(`${ORIGIN}/api/designs/local-spj-04`, {
        headers: { cookie: secondUser.cookie },
      }),
    );
    const secondLoaded =
      (await secondLoadedResponse.json()) as PersistenceResult<DesignRecord>;
    expect(secondLoaded).toMatchObject({
      ok: true,
      value: {
        lockVersion: 1,
        draft: { intent: { frameColor: "white" } },
      },
    });
  });

  it("provisions one new team under concurrent authenticated page loads", async () => {
    const selected = await select("concurrent@example.test");
    const requests = Array.from({ length: 3 }, () => [
      getDesign(
        new Request(`${ORIGIN}/api/designs/local-spj-04`, {
          headers: { cookie: selected.cookie },
        }),
      ),
      getDesignRevisions(
        new Request(`${ORIGIN}/api/designs/local-spj-04/revisions?limit=100`, {
          headers: { cookie: selected.cookie },
        }),
      ),
      getCourse(
        new Request(`${ORIGIN}/api/courses/local-course-1`, {
          headers: { cookie: selected.cookie },
        }),
      ),
    ]).flat();
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 9 }, () => 200),
    );
  });

  it("rejects missing Origin and CSRF protection before mutation", async () => {
    const selected = await select("route-a@example.test");
    const response = await patchDesign(
      new Request(`${ORIGIN}/api/designs/local-spj-04`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: selected.cookie,
        },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { kind: "forbidden" },
    });
  });
});
