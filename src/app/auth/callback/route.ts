import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { parseAuthenticationConfig } from "@/server/auth/auth-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = parseAuthenticationConfig();
  return handleAuth({
    baseURL: config.baseUrl,
    returnPathname: "/",
    onSuccess({ impersonator, user }) {
      if (impersonator) {
        throw new Error("Impersonated sessions are not supported.");
      }
      if (!user.emailVerified) {
        throw new Error("A verified email is required.");
      }
    },
    onError({ request: callbackRequest }) {
      return NextResponse.redirect(
        new URL("/?authError=authentication-failed", callbackRequest.url),
        303,
      );
    },
  })(request);
}
