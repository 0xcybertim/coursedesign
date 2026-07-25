import { NextResponse } from "next/server";

import { localFakeObjectStorage } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = await localFakeObjectStorage().acceptUpload({
      token,
      headers: request.headers,
      bytes,
    });
    return new NextResponse(null, {
      status: result === "stored" ? 200 : 412,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return unavailable();
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const object = localFakeObjectStorage().read(token);
    if (!object) return unavailable();
    return new NextResponse(Uint8Array.from(object.bytes).buffer, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": object.contentType,
      },
    });
  } catch {
    return unavailable();
  }
}
