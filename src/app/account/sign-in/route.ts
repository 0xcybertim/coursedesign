import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import { parseAuthenticationConfig } from "@/server/auth/auth-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  parseAuthenticationConfig();
  return NextResponse.redirect(await getSignInUrl({ returnTo: "/" }), 303);
}
