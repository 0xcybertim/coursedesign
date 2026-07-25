import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { parseCourseDraft, type CourseDraft } from "@/domain/course";
import {
  STARTER_COURSE_ROUTE_KEY,
  type CourseRecord,
  type CourseRepository,
  type SaveCourseInput,
} from "@/persistence/course-repository";
import type { ValidatedSessionContext } from "@/persistence/identity-service";
import {
  persistenceFailure,
  staleVersionFailure,
  type PersistenceResult,
} from "@/persistence/result";
import * as schema from "@/server/db/schema";

import { validateCourseRow } from "./record-validation";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeTemporaryFailure<T>(): PersistenceResult<T> {
  return persistenceFailure(
    "temporarily_unavailable",
    "Server course persistence is temporarily unavailable. Try again.",
  );
}

function validateCourseDraft(
  value: CourseDraft,
): PersistenceResult<CourseDraft> {
  const parsed = parseCourseDraft(JSON.stringify(value));
  return parsed.ok
    ? parsed
    : persistenceFailure(
        "validation",
        "The course draft failed domain validation.",
      );
}

export class DatabaseCourseRepository implements CourseRepository {
  private readonly database;
  private readonly now: () => Date;

  constructor(
    pool: Pool,
    private readonly session: ValidatedSessionContext,
    options: { readonly now?: () => Date } = {},
  ) {
    this.database = drizzle(pool, { schema });
    this.now = options.now ?? (() => new Date());
  }

  private async loadCourseRow() {
    const [row] = await this.database
      .select()
      .from(schema.courses)
      .where(
        and(
          eq(schema.courses.workspaceId, this.session.workspaceId),
          eq(schema.courses.legacyRouteKey, STARTER_COURSE_ROUTE_KEY),
          isNull(schema.courses.archivedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async loadCourse(
    routeKey: typeof STARTER_COURSE_ROUTE_KEY,
  ): Promise<PersistenceResult<CourseRecord>> {
    if (routeKey !== STARTER_COURSE_ROUTE_KEY) {
      return persistenceFailure(
        "missing_reference",
        "That course is unavailable.",
      );
    }
    try {
      const row = await this.loadCourseRow();
      return row
        ? validateCourseRow(row)
        : persistenceFailure(
            "missing_reference",
            "That course is unavailable.",
          );
    } catch {
      return safeTemporaryFailure();
    }
  }

  async saveCourse(
    input: SaveCourseInput,
  ): Promise<PersistenceResult<CourseRecord, CourseRecord>> {
    const validatedDraft = validateCourseDraft(input.draft);
    if (!validatedDraft.ok) return validatedDraft;
    const revisionIds = [
      ...new Set(
        validatedDraft.value.instances.map(
          (instance) => instance.obstacleDesignRevisionId,
        ),
      ),
    ];
    if (revisionIds.some((id) => !UUID_PATTERN.test(id))) {
      return persistenceFailure(
        "missing_reference",
        "A pinned design revision is unavailable in this workspace.",
      );
    }
    const now = this.now();
    try {
      return await this.database.transaction(async (transaction) => {
        if (revisionIds.length > 0) {
          const references = await transaction
            .select({ id: schema.designRevisions.id })
            .from(schema.designRevisions)
            .innerJoin(
              schema.designs,
              and(
                eq(schema.designs.id, schema.designRevisions.designId),
                eq(
                  schema.designs.workspaceId,
                  schema.designRevisions.workspaceId,
                ),
              ),
            )
            .where(
              and(
                eq(
                  schema.designRevisions.workspaceId,
                  this.session.workspaceId,
                ),
                inArray(schema.designRevisions.id, revisionIds),
                isNull(schema.designs.archivedAt),
              ),
            );
          if (references.length !== revisionIds.length) {
            return persistenceFailure(
              "missing_reference",
              "A pinned design revision is unavailable in this workspace.",
            );
          }
        }
        const [updated] = await transaction
          .update(schema.courses)
          .set({
            draftSnapshot: validatedDraft.value,
            lockVersion: input.expectedLockVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.courses.workspaceId, this.session.workspaceId),
              eq(schema.courses.legacyRouteKey, input.routeKey),
              eq(schema.courses.lockVersion, input.expectedLockVersion),
              isNull(schema.courses.archivedAt),
            ),
          )
          .returning();
        if (updated) return validateCourseRow(updated);

        const [latestRow] = await transaction
          .select()
          .from(schema.courses)
          .where(
            and(
              eq(schema.courses.workspaceId, this.session.workspaceId),
              eq(schema.courses.legacyRouteKey, input.routeKey),
              isNull(schema.courses.archivedAt),
            ),
          )
          .limit(1);
        if (!latestRow) {
          return persistenceFailure(
            "missing_reference",
            "That course is unavailable.",
          );
        }
        const latest = validateCourseRow(latestRow);
        if (!latest.ok) return latest;
        return staleVersionFailure({
          expectedLockVersion: input.expectedLockVersion,
          actualLockVersion: latest.value.lockVersion,
          latest: latest.value,
        });
      });
    } catch {
      return safeTemporaryFailure();
    }
  }
}
