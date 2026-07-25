import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { UNVERIFIED_WORKSPACE_WARNING } from "@/domain/identity";
import { DatabaseProvisionalIdentityService } from "@/server/identity/provisional-identity-service";
import { digestSessionToken } from "@/server/identity/session-token";

import {
  migrateCourseDesignTestDatabase,
  TEST_MIGRATION_URL,
  truncateCourseDesignTestData,
  withTestClient,
} from "../support/course-design-test-database";

let tokenOrdinal = 0;
let currentTime = new Date("2026-07-25T09:00:00.000Z");
let pool: Pool;

function nextToken() {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const character = alphabet[tokenOrdinal++ % alphabet.length];
  return character.repeat(43);
}

function service() {
  return new DatabaseProvisionalIdentityService(pool, {
    now: () => new Date(currentTime),
    generateToken: nextToken,
    sessionTtlSeconds: 30 * 24 * 60 * 60,
  });
}

beforeAll(async () => {
  await migrateCourseDesignTestDatabase();
  pool = new Pool({ connectionString: TEST_MIGRATION_URL, max: 8 });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateCourseDesignTestData();
  tokenOrdinal = 0;
  currentTime = new Date("2026-07-25T09:00:00.000Z");
});

describe("database-backed provisional identity", () => {
  it("creates one durable aggregate, clean starter records, and only a token digest", async () => {
    const selected = await service().selectWorkspace({
      email: "  Workspace-A@Example.TEST ",
    });
    expect(selected).toMatchObject({
      ok: true,
      value: {
        workspace: {
          displayName: "Course Design workspace",
          warning: UNVERIFIED_WORKSPACE_WARNING,
        },
        session: { membershipRole: "owner" },
      },
    });
    if (!selected.ok) return;

    const state = await withTestClient(async (client) => {
      const counts = await client.query<{
        users: string;
        workspaces: string;
        memberships: string;
        selectors: string;
        sessions: string;
        designs: string;
        courses: string;
      }>(`
        SELECT
          (SELECT count(*) FROM users) AS users,
          (SELECT count(*) FROM workspaces) AS workspaces,
          (SELECT count(*) FROM workspace_memberships) AS memberships,
          (SELECT count(*) FROM provisional_email_selectors) AS selectors,
          (SELECT count(*) FROM provisional_sessions) AS sessions,
          (SELECT count(*) FROM designs) AS designs,
          (SELECT count(*) FROM courses) AS courses
      `);
      const selector = await client.query<{ email_normalized: string }>(
        "SELECT email_normalized FROM provisional_email_selectors",
      );
      const session = await client.query<{ token_digest: string }>(
        "SELECT token_digest FROM provisional_sessions",
      );
      return {
        counts: counts.rows[0],
        selector: selector.rows[0],
        session: session.rows[0],
      };
    });
    expect(state.counts).toEqual({
      users: "1",
      workspaces: "1",
      memberships: "1",
      selectors: "1",
      sessions: "1",
      designs: "1",
      courses: "1",
    });
    expect(state.selector.email_normalized).toBe("workspace-a@example.test");
    expect(state.session.token_digest).toBe(
      digestSessionToken(selected.value.sessionToken),
    );
    expect(state.session.token_digest).not.toBe(selected.value.sessionToken);
  });

  it("resolves concurrent same-email requests to exactly one aggregate", async () => {
    const identity = service();
    const [first, second] = await Promise.all([
      identity.selectWorkspace({ email: "same@example.test" }),
      identity.selectWorkspace({ email: " SAME@example.test " }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.session.workspaceId).toBe(
      second.value.session.workspaceId,
    );
    await withTestClient(async (client) => {
      const result = await client.query<{
        users: string;
        workspaces: string;
        selectors: string;
        sessions: string;
      }>(`
        SELECT
          (SELECT count(*) FROM users) AS users,
          (SELECT count(*) FROM workspaces) AS workspaces,
          (SELECT count(*) FROM provisional_email_selectors) AS selectors,
          (SELECT count(*) FROM provisional_sessions) AS sessions
      `);
      expect(result.rows[0]).toEqual({
        users: "1",
        workspaces: "1",
        selectors: "1",
        sessions: "2",
      });
    });
  });

  it("keeps different email selectors completely isolated", async () => {
    const identity = service();
    const first = await identity.selectWorkspace({
      email: "first@example.test",
    });
    const second = await identity.selectWorkspace({
      email: "second@example.test",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.session.workspaceId).not.toBe(
      second.value.session.workspaceId,
    );
    expect(first.value.session.userId).not.toBe(second.value.session.userId);
  });

  it("rotates on switch, revokes on clear, and validates ownership server-side", async () => {
    const identity = service();
    const first = await identity.selectWorkspace({
      email: "first@example.test",
    });
    if (!first.ok) throw new Error(first.error.message);
    const switched = await identity.selectWorkspace({
      email: "second@example.test",
      previousSessionToken: first.value.sessionToken,
    });
    if (!switched.ok) throw new Error(switched.error.message);

    expect(
      await identity.validateSession(first.value.sessionToken),
    ).toMatchObject({ ok: false, error: { kind: "session_invalid" } });
    expect(
      await identity.validateSession(switched.value.sessionToken),
    ).toMatchObject({
      ok: true,
      value: {
        workspaceId: switched.value.session.workspaceId,
        userId: switched.value.session.userId,
      },
    });
    expect(await identity.clearSession(switched.value.sessionToken)).toEqual({
      ok: true,
      value: null,
    });
    expect(
      await identity.validateSession(switched.value.sessionToken),
    ).toMatchObject({ ok: false, error: { kind: "session_invalid" } });
  });

  it("expires old sessions and renews one existing session inside the 30-day window", async () => {
    const identity = service();
    const selected = await identity.selectWorkspace({
      email: "renew@example.test",
    });
    if (!selected.ok) throw new Error(selected.error.message);
    currentTime = new Date("2026-08-14T09:00:00.000Z");
    const renewed = await identity.validateSession(selected.value.sessionToken);
    expect(renewed).toMatchObject({ ok: true });
    if (!renewed.ok) return;
    expect(renewed.value.expiresAt).toBe("2026-09-13T09:00:00.000Z");
    await withTestClient(async (client) => {
      expect(
        await client.query("SELECT id FROM provisional_sessions"),
      ).toMatchObject({ rowCount: 1 });
    });

    currentTime = new Date("2026-09-14T09:00:00.000Z");
    expect(
      await identity.validateSession(selected.value.sessionToken),
    ).toMatchObject({ ok: false, error: { kind: "session_invalid" } });
  });
});
