import {
  persistenceJson,
  requestSession,
} from "@/server/http/persistence-route";
import { currentWorkspaceSummary } from "@/server/runtime/persistence-runtime";
import { POST as signOut } from "@/app/api/authentication/sign-out/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);
  const workspace = await currentWorkspaceSummary(session.value.context);
  return persistenceJson(workspace);
}

export async function DELETE(request: Request) {
  return signOut(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
    }),
  );
}
