import { NextResponse } from "next/server";

import { parseAuthenticationConfig } from "@/server/auth/auth-config";
import { getPersistenceConfig } from "@/server/config/persistence-config";
import { NO_STORE_HEADERS } from "@/server/http/persistence-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const persistence = getPersistenceConfig();
  if (persistence.mode !== "server") {
    return NextResponse.json(
      { emailDelivery: false, google: false, passkey: false },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  const authentication = parseAuthenticationConfig();
  return NextResponse.json(
    {
      provider: authentication.provider,
      hosted: true,
      methodsManagedByProvider: true,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
