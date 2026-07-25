import { STARTER_DESIGN_ROUTE_KEY } from "@/persistence";
import {
  persistenceJson,
  readBoundedJson,
  requestSession,
} from "@/server/http/persistence-route";
import { verifyMutationRequest } from "@/server/http/request-policy";
import { persistenceRepositories } from "@/server/runtime/persistence-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);
  const repositories = persistenceRepositories(session.value.context);
  const url = new URL(request.url);
  const limitText = url.searchParams.get("limit");
  const limit = limitText ? Number(limitText) : undefined;
  const result = await repositories.design.listRevisions({
    ...(url.searchParams.get("cursor")
      ? { cursor: url.searchParams.get("cursor") ?? undefined }
      : {}),
    ...(Number.isSafeInteger(limit) ? { limit } : {}),
  });
  return persistenceJson(result, session.value);
}

export async function POST(request: Request) {
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);
  const mutation = verifyMutationRequest(
    request,
    session.value.config.allowedOrigins,
  );
  if (!mutation.ok) return persistenceJson(mutation, session.value);
  const body = await readBoundedJson(request);
  if (!body.ok) return persistenceJson(body, session.value);
  const hashes = body.value.referencedRenderableArtworkHashes;
  if (
    !Number.isSafeInteger(body.value.expectedLockVersion) ||
    typeof body.value.idempotencyKey !== "string" ||
    !Array.isArray(hashes) ||
    !hashes.every((hash) => typeof hash === "string") ||
    (body.value.name !== undefined && typeof body.value.name !== "string")
  ) {
    return persistenceJson(
      {
        ok: false,
        error: {
          kind: "validation",
          message: "The revision save request is invalid.",
          retryable: false,
        },
      },
      session.value,
    );
  }
  const repositories = persistenceRepositories(session.value.context);
  const result = await repositories.design.appendStarterRevision({
    routeKey: STARTER_DESIGN_ROUTE_KEY,
    expectedLockVersion: Number(body.value.expectedLockVersion),
    idempotencyKey: body.value.idempotencyKey,
    ...(typeof body.value.name === "string" ? { name: body.value.name } : {}),
    referencedRenderableArtworkHashes: hashes,
  });
  return persistenceJson(result, session.value);
}
