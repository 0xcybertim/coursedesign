import { authkitProxy } from "@workos-inc/authkit-nextjs";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";

const workosProxy = authkitProxy({
  middlewareAuth: { enabled: false, unauthenticatedPaths: [] },
  signUpPaths: ["/account/sign-up"],
  refreshBufferSeconds: 60,
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (process.env.PERSISTENCE_MODE !== "server") {
    return NextResponse.next();
  }
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_ACCEPTANCE_TEST_MODE === "true"
  ) {
    return NextResponse.next();
  }
  return workosProxy(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
