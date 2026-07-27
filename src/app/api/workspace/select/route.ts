import { NextResponse } from "next/server";

import { NO_STORE_HEADERS } from "@/server/http/persistence-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request?: Request) {
  void _request;
  return NextResponse.json(
    {
      ok: false,
      error: {
        kind: "forbidden",
        message:
          "Public email workspace selectors have been permanently retired. Sign in instead.",
        retryable: false,
      },
    },
    { status: 410, headers: NO_STORE_HEADERS },
  );
}
