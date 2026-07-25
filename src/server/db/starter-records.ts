import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { COURSE_SCHEMA_VERSION, createCourseDraft } from "@/domain/course";
import {
  LOCAL_WORKSPACE_SCHEMA_VERSION,
  createLocalDesignWorkspace,
} from "@/domain/design";
import { STARTER_COURSE_ROUTE_KEY } from "@/persistence/course-repository";
import { STARTER_DESIGN_ROUTE_KEY } from "@/persistence/design-repository";

import * as schema from "./schema";

export type CourseDesignDatabase = NodePgDatabase<typeof schema>;

export interface StarterRecordIds {
  readonly designId: string;
  readonly courseId: string;
}

export async function bootstrapStarterRecords(
  database: CourseDesignDatabase,
  input: {
    readonly workspaceId: string;
    readonly now: string;
  },
): Promise<StarterRecordIds> {
  const designWorkspace = createLocalDesignWorkspace({
    draftId: `server-${input.workspaceId}-spj04-draft`,
    now: input.now,
  });
  const courseDraft = createCourseDraft(input.now);
  const timestamp = new Date(input.now);

  await database
    .insert(schema.designs)
    .values({
      workspaceId: input.workspaceId,
      legacyRouteKey: STARTER_DESIGN_ROUTE_KEY,
      familyId: "spj-04-club-classic",
      displayName: "SPJ-04 · Club Classic",
      draftSnapshot: designWorkspace.draft,
      domainSchemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
      lockVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing({
      target: [schema.designs.workspaceId, schema.designs.legacyRouteKey],
    });

  await database
    .insert(schema.courses)
    .values({
      workspaceId: input.workspaceId,
      legacyRouteKey: STARTER_COURSE_ROUTE_KEY,
      name: "Local Course 01",
      draftSnapshot: courseDraft,
      domainSchemaVersion: COURSE_SCHEMA_VERSION,
      lockVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing({
      target: [schema.courses.workspaceId, schema.courses.legacyRouteKey],
    });

  const [design] = await database
    .select({ id: schema.designs.id })
    .from(schema.designs)
    .where(
      and(
        eq(schema.designs.workspaceId, input.workspaceId),
        eq(schema.designs.legacyRouteKey, STARTER_DESIGN_ROUTE_KEY),
      ),
    )
    .limit(1);
  const [course] = await database
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.workspaceId, input.workspaceId),
        eq(schema.courses.legacyRouteKey, STARTER_COURSE_ROUTE_KEY),
      ),
    )
    .limit(1);
  if (!design || !course) {
    throw new Error("Course Design starter records were not bootstrapped.");
  }
  return { designId: design.id, courseId: course.id };
}
