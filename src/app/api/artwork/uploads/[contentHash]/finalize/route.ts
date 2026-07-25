import {
  persistenceJson,
  requestSession,
} from "@/server/http/persistence-route";
import { verifyMutationRequest } from "@/server/http/request-policy";
import { persistenceRepositories } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ contentHash: string }> },
) {
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);
  const mutation = verifyMutationRequest(
    request,
    session.value.config.allowedOrigins,
  );
  if (!mutation.ok) return persistenceJson(mutation, session.value);
  const repositories = persistenceRepositories(session.value.context);
  const { contentHash } = await context.params;
  const result =
    await repositories.artwork.finalizeCanonicalUpload(contentHash);
  return persistenceJson(result, session.value);
}
