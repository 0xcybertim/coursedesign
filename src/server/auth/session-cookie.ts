import "server-only";

import { NextResponse } from "next/server";

import { parseAuthenticationConfig } from "./auth-config";

export function clearWorkosSessionCookie(
  response: NextResponse,
  requestUrl: string,
): void {
  const config = parseAuthenticationConfig();
  response.cookies.set({
    name: config.cookieName,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: new URL(requestUrl).protocol === "https:",
    sameSite: "lax",
  });
}
