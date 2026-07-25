import type { DerivedProfileWingPrototype } from "@/domain/design";
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
  const body = await readBoundedJson(request, 512 * 1024);
  if (!body.ok) return persistenceJson(body, session.value);
  if (
    typeof body.value.idempotencyKey !== "string" ||
    typeof body.value.canonicalRenderHash !== "string" ||
    !body.value.prototype ||
    typeof body.value.prototype !== "object" ||
    (body.value.name !== undefined && typeof body.value.name !== "string")
  ) {
    return persistenceJson(
      {
        ok: false,
        error: {
          kind: "validation",
          message: "The final Profile Wing save request is invalid.",
          retryable: false,
        },
      },
      session.value,
    );
  }
  const repositories = persistenceRepositories(session.value.context);
  const result = await repositories.design.appendFinalProfileWingRevision({
    idempotencyKey: body.value.idempotencyKey,
    prototype: body.value.prototype as DerivedProfileWingPrototype,
    canonicalRenderHash: body.value.canonicalRenderHash,
    ...(typeof body.value.name === "string" ? { name: body.value.name } : {}),
  });
  return persistenceJson(result, session.value);
}
