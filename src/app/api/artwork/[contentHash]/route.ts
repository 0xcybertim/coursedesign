import {
  persistenceJson,
  requestSession,
} from "@/server/http/persistence-route";
import { persistenceRepositories } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ contentHash: string }> },
) {
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);
  const repositories = persistenceRepositories(session.value.context);
  const { contentHash } = await context.params;
  const result = await repositories.artwork.getRenderable(contentHash);
  return persistenceJson(result, session.value);
}
