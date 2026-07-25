import { NextResponse } from "next/server";

import { getPersistenceConfig } from "@/server/config/persistence-config";
import { NO_STORE_HEADERS } from "@/server/http/persistence-route";
import { runtimePool } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getPersistenceConfig();
  if (config.mode === "browser") {
    return NextResponse.json(
      {
        ok: true,
        mode: "browser",
        database: "not_required",
        objectStorage: "not_required",
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }
  const pool = runtimePool();
  if (!pool) {
    return NextResponse.json(
      {
        ok: false,
        mode: "server",
        database: "unavailable",
        objectStorage: "configured_private_gcs",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const result = await pool.query<{
      migration_count: number;
      current_user: string;
    }>(
      `SELECT
        (SELECT count(*)::int FROM course_design_migrations) AS migration_count,
        current_user`,
    );
    return NextResponse.json(
      {
        ok: true,
        mode: "server",
        database: "reachable",
        migrations: result.rows[0]?.migration_count ?? 0,
        runtimeRole: result.rows[0]?.current_user ?? "unknown",
        objectStorage: "configured_private_gcs",
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        mode: "server",
        database: "unavailable",
        objectStorage: "configured_private_gcs",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
