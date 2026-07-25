import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PATCH as patchDesign } from "@/app/api/designs/local-spj-04/route";
import { GET as getDesign } from "@/app/api/designs/local-spj-04/route";
import { POST as selectWorkspace } from "@/app/api/workspace/select/route";
import { UNVERIFIED_WORKSPACE_WARNING } from "@/domain/identity";
import { updateLocalDraft, type ObstacleDraft } from "@/domain/design";
import {
  COURSE_DESIGN_CSRF_HEADER,
  COURSE_DESIGN_CSRF_VALUE,
} from "@/persistence";
import type { DesignRecord, PersistenceResult } from "@/persistence";

import {
  migrateCourseDesignTestDatabase,
  TEST_MIGRATION_URL,
  truncateCourseDesignTestData,
} from "../support/course-design-test-database";

const ORIGIN = "http://127.0.0.1:3000";
const priorEnvironment = new Map<string, string | undefined>();

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
    [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE,
    ...(cookie ? { cookie } : {}),
  };
}

async function select(email: string) {
  const response = await selectWorkspace(
    new Request(`${ORIGIN}/api/workspace/select`, {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify({
        email,
        workspaceId: "client-workspace-id-must-be-ignored",
        userId: "client-user-id-must-be-ignored",
      }),
    }),
  );
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Missing session cookie.");
  return {
    response,
    body: (await response.json()) as Record<string, unknown>,
    cookie: setCookie.split(";")[0]!,
  };
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
  await migrateCourseDesignTestDatabase();
});

afterAll(async () => {
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
  await truncateCourseDesignTestData();
});

describe("server persistence routes", () => {
  it("creates a clean public workspace without exposing the token", async () => {
    const selected = await select("route-a@example.test");
    expect(selected.response.status).toBe(200);
    expect(selected.body).toEqual({
      ok: true,
      workspace: {
        displayName: "Course Design workspace",
        warning: UNVERIFIED_WORKSPACE_WARNING,
      },
    });
    expect(JSON.stringify(selected.body)).not.toContain(
      "__Host-course-design-session",
    );
    const cookie = selected.response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain=");
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
