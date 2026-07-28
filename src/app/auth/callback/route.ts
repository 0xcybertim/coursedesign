import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";

import {
  authenticationFailureUrl,
  parseAuthenticationConfig,
} from "@/server/auth/auth-config";

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
    onError() {
      return NextResponse.redirect(authenticationFailureUrl(config.baseUrl), 303);
    },
  })(request);
}
