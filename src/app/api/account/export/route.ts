import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { NextResponse } from "next/server";

import {
  requestSession,
  NO_STORE_HEADERS,
} from "@/server/http/persistence-route";
import { runtimePool } from "@/server/runtime/persistence-runtime";
import * as schema from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requestSession(request);
  if (!session.ok) {
    return NextResponse.json(session, {
      status: 401,
      headers: NO_STORE_HEADERS,
    });
  }
  const pool = runtimePool();
  if (!pool) {
    return NextResponse.json(
      { ok: false, message: "Account export is unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  const database = drizzle(pool, { schema });
  const context = session.value.context;
  const [account] = await database
    .select({
      name: schema.authIdentities.displayName,
      email: schema.authIdentities.email,
      emailVerified: schema.authIdentities.emailVerified,
      createdAt: schema.authIdentities.createdAt,
    })
    .from(schema.users)
    .innerJoin(
      schema.authIdentities,
      eq(schema.authIdentities.id, schema.users.authIdentityId),
    )
    .where(
      and(
        eq(schema.users.id, context.userId),
        eq(schema.authIdentities.state, "active"),
      ),
    )
    .limit(1);
  const [workspace] = await database
    .select({
      id: schema.workspaces.id,
      displayName: schema.workspaces.displayName,
      createdAt: schema.workspaces.createdAt,
      updatedAt: schema.workspaces.updatedAt,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, context.workspaceId))
    .limit(1);
  if (!account || !workspace) {
    return NextResponse.json(
      { ok: false, message: "Account export is unavailable." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  const [designs, revisions, courses, artwork] = await Promise.all([
    database
      .select()
      .from(schema.designs)
      .where(eq(schema.designs.workspaceId, context.workspaceId)),
    database
      .select()
      .from(schema.designRevisions)
      .where(eq(schema.designRevisions.workspaceId, context.workspaceId)),
    database
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.workspaceId, context.workspaceId)),
    database
      .select({
        contentHash: schema.artworkAssets.contentHash,
        detectedMediaType: schema.artworkAssets.detectedMediaType,
        byteLength: schema.artworkAssets.byteLength,
        pixelWidth: schema.artworkAssets.pixelWidth,
        pixelHeight: schema.artworkAssets.pixelHeight,
        state: schema.artworkAssets.state,
        createdAt: schema.artworkAssets.createdAt,
        updatedAt: schema.artworkAssets.updatedAt,
      })
      .from(schema.artworkAssets)
      .where(eq(schema.artworkAssets.workspaceId, context.workspaceId)),
  ]);
  const memberships = await database
    .select({
      workspaceId: schema.workspaceMemberships.workspaceId,
      role: schema.workspaceMemberships.role,
      createdAt: schema.workspaceMemberships.createdAt,
    })
    .from(schema.workspaceMemberships)
    .where(
      and(
        eq(schema.workspaceMemberships.userId, context.userId),
        eq(schema.workspaceMemberships.workspaceId, context.workspaceId),
      ),
    );
  const response = NextResponse.json(
    {
      exportVersion: "course-design-account-export-v1",
      exportedAt: new Date().toISOString(),
      account,
      workspace,
      memberships,
      designs,
      revisions,
      courses,
      artwork,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
  response.headers.set(
    "Content-Disposition",
    'attachment; filename="course-design-account-export.json"',
  );
  return response;
}
