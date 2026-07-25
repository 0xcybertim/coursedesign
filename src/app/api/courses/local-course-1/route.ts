import { parseCourseDraft } from "@/domain/course";
import { STARTER_COURSE_ROUTE_KEY } from "@/persistence";
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
  const result = await repositories.course.loadCourse(STARTER_COURSE_ROUTE_KEY);
  return persistenceJson(result, session.value);
}

export async function PATCH(request: Request) {
  const session = await requestSession(request);
  if (!session.ok) return persistenceJson(session);
  const mutation = verifyMutationRequest(
    request,
    session.value.config.allowedOrigins,
  );
  if (!mutation.ok) return persistenceJson(mutation, session.value);
  const body = await readBoundedJson(request);
  if (!body.ok) return persistenceJson(body, session.value);
  const parsed = parseCourseDraft(JSON.stringify(body.value.draft));
  if (
    !parsed.ok ||
    !Number.isSafeInteger(body.value.expectedLockVersion) ||
    Number(body.value.expectedLockVersion) < 1
  ) {
    return persistenceJson(
      {
        ok: false,
        error: {
          kind: "validation",
          message: "The course save request is invalid.",
          retryable: false,
        },
      },
      session.value,
    );
  }
  const repositories = persistenceRepositories(session.value.context);
  const result = await repositories.course.saveCourse({
    routeKey: STARTER_COURSE_ROUTE_KEY,
    expectedLockVersion: Number(body.value.expectedLockVersion),
    draft: parsed.value,
  });
  return persistenceJson(result, session.value);
}
