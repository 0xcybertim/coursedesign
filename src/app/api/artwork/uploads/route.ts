import type { CanonicalArtworkUploadInput } from "@/persistence";
import {
  persistenceJson,
  readBoundedJson,
  requestSession,
} from "@/server/http/persistence-route";
import { verifyMutationRequest } from "@/server/http/request-policy";
import { persistenceRepositories } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);
  const mutation = verifyMutationRequest(
    request,
    session.value.config.allowedOrigins,
  );
  if (!mutation.ok) return persistenceJson(mutation, session.value);
  const body = await readBoundedJson(request, 16_384);
  if (!body.ok) return persistenceJson(body, session.value);
  const descriptor = body.value as unknown as CanonicalArtworkUploadInput;
  const repositories = persistenceRepositories(session.value.context);
  const result = await repositories.artwork.beginCanonicalUpload(descriptor);
  return persistenceJson(result, session.value);
}
