import { parseCourseDraft } from "@/domain/course";
import {
  LOCAL_WORKSPACE_SCHEMA_VERSION,
  LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION,
  parseObstacleDesignRevision,
  parseObstacleDraft,
  parseProfileWingDesignRevision,
  type ObstacleDesignRevision,
  type ProfileWingDesignRevision,
} from "@/domain/design";
import type { CourseRecord } from "@/persistence/course-repository";
import type { DesignRecord } from "@/persistence/design-repository";
import {
  persistenceFailure,
  type PersistenceResult,
} from "@/persistence/result";
import type * as schema from "@/server/db/schema";

type DesignRow = typeof schema.designs.$inferSelect;
type CourseRow = typeof schema.courses.$inferSelect;
type DesignRevisionRow = typeof schema.designRevisions.$inferSelect;

function schemaFailure<T>(message: string): PersistenceResult<T> {
  return persistenceFailure("unsupported_schema", message);
}

export function validateProfileRevisionRow(input: {
  readonly row: DesignRevisionRow;
  readonly legacyRouteKey: string;
  readonly familyId: string;
}): PersistenceResult<ProfileWingDesignRevision> {
  if (
    input.familyId !== "profile-wing-vertical-v1" ||
    !input.legacyRouteKey.startsWith("local-profile-wing-") ||
    input.row.domainSchemaVersion !== LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION ||
    input.row.renderArtworkHashes.length !== 1
  ) {
    return schemaFailure(
      "The saved Profile Wing revision uses an unsupported domain schema.",
    );
  }
  const parsed = parseProfileWingDesignRevision({
    schemaVersion: LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION,
    revisionId: input.row.id,
    designId: input.legacyRouteKey,
    familyId: "profile-wing-vertical-v1",
    ordinal: input.row.ordinal,
    name: input.row.name,
    createdAt: input.row.createdAt.toISOString(),
    configurationHash: input.row.configurationHash,
    snapshot: input.row.snapshot,
  });
  return parsed.ok
    ? parsed
    : persistenceFailure(
        "corrupt_record",
        "The saved Profile Wing revision failed domain validation.",
      );
}

export function validateDesignRow(
  row: DesignRow,
): PersistenceResult<DesignRecord> {
  if (
    row.legacyRouteKey !== "local-spj-04" ||
    row.familyId !== "spj-04-club-classic" ||
    row.domainSchemaVersion !== LOCAL_WORKSPACE_SCHEMA_VERSION
  ) {
    return schemaFailure("The saved design uses an unsupported domain schema.");
  }
  const parsed = parseObstacleDraft(row.draftSnapshot);
  if (!parsed.ok) {
    return persistenceFailure(
      parsed.error.kind === "unsupported_workspace_schema"
        ? "unsupported_schema"
        : "corrupt_record",
      "The saved design record failed domain validation.",
    );
  }
  return {
    ok: true,
    value: {
      routeKey: "local-spj-04",
      familyId: "spj-04-club-classic",
      displayName: row.displayName,
      draft: parsed.value,
      lockVersion: row.lockVersion,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

export function validateCourseRow(
  row: CourseRow,
): PersistenceResult<CourseRecord> {
  if (
    row.legacyRouteKey !== "local-course-1" ||
    row.domainSchemaVersion !== "1.0.0-phase1c"
  ) {
    return schemaFailure("The saved course uses an unsupported domain schema.");
  }
  const parsed = parseCourseDraft(JSON.stringify(row.draftSnapshot));
  if (!parsed.ok) {
    return persistenceFailure(
      parsed.error.kind === "unsupported_course_schema"
        ? "unsupported_schema"
        : "corrupt_record",
      "The saved course record failed domain validation.",
    );
  }
  return {
    ok: true,
    value: {
      routeKey: "local-course-1",
      name: "Local Course 01",
      draft: parsed.value,
      lockVersion: row.lockVersion,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

export function validateObstacleRevisionRow(input: {
  readonly row: DesignRevisionRow;
  readonly legacyRouteKey: string;
  readonly familyId: string;
}): PersistenceResult<ObstacleDesignRevision> {
  if (
    input.legacyRouteKey !== "local-spj-04" ||
    input.familyId !== "spj-04-club-classic" ||
    input.row.domainSchemaVersion !== LOCAL_WORKSPACE_SCHEMA_VERSION
  ) {
    return schemaFailure(
      "The saved revision uses an unsupported domain schema.",
    );
  }
  const parsed = parseObstacleDesignRevision(
    {
      schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
      revisionId: input.row.id,
      designId: "local-spj-04",
      ordinal: input.row.ordinal,
      name: input.row.name,
      createdAt: input.row.createdAt.toISOString(),
      configurationHash: input.row.configurationHash,
      snapshot: input.row.snapshot,
    },
    input.row.ordinal,
  );
  return parsed.ok
    ? parsed
    : persistenceFailure(
        parsed.error.kind === "unsupported_workspace_schema"
          ? "unsupported_schema"
          : "corrupt_record",
        "The saved revision record failed domain validation.",
      );
}
