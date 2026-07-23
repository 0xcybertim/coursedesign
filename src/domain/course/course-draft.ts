import {
  COURSE_SCHEMA_VERSION,
  type CourseDraft,
  type CourseFailure,
  type CourseInstance,
  type CourseResult,
} from "./types";

export const PROTOTYPE_ARENA = {
  units: "mm",
  width: 60000,
  height: 40000,
  gridSize: 5000,
} as const;
export const NORMAL_MOVE_MM = 500 as const;
export const LARGE_MOVE_MM = 2000 as const;
export const ROTATION_STEP_DEG = 15 as const;

function failure(
  kind: CourseFailure["error"]["kind"],
  message: string,
): CourseFailure {
  return { ok: false, error: { kind, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCoordinate(value: unknown): value is number {
  return Number.isInteger(value) && Number.isFinite(value);
}

export function normalizeRotation(rotationDeg: number): number {
  return ((rotationDeg % 360) + 360) % 360;
}

export function snapToMovementGrid(valueMm: number): number {
  return Math.round(valueMm / NORMAL_MOVE_MM) * NORMAL_MOVE_MM;
}

export function createCourseDraft(now: string): CourseDraft {
  return {
    schemaVersion: COURSE_SCHEMA_VERSION,
    courseId: "local-course-1",
    draftVersion: 1,
    arena: PROTOTYPE_ARENA,
    instances: [],
    updatedAt: now,
  };
}

function updateInstance(
  draft: CourseDraft,
  instanceId: string,
  now: string,
  update: (instance: CourseInstance) => CourseInstance,
): CourseResult<CourseDraft> {
  let found = false;
  const instances = draft.instances.map((instance) => {
    if (instance.instanceId !== instanceId) return instance;
    found = true;
    return update(instance);
  });
  if (!found) {
    return failure(
      "instance_not_found",
      "That course placement no longer exists.",
    );
  }
  return {
    ok: true,
    value: {
      ...draft,
      draftVersion: draft.draftVersion + 1,
      instances,
      updatedAt: now,
    },
  };
}

export function placeCourseInstance(
  draft: CourseDraft,
  input: {
    instanceId: string;
    obstacleDesignRevisionId: string;
    now: string;
    xMm?: number;
    yMm?: number;
    rotationDeg?: number;
  },
): CourseResult<CourseDraft> {
  if (
    !isNonEmptyString(input.instanceId) ||
    !isNonEmptyString(input.obstacleDesignRevisionId) ||
    draft.instances.some((instance) => instance.instanceId === input.instanceId)
  ) {
    return failure(
      "invalid_instance",
      "Course placements require unique identifiers and a saved revision source.",
    );
  }
  const xMm = input.xMm ?? draft.arena.width / 2;
  const yMm = input.yMm ?? draft.arena.height / 2;
  const rotationDeg = input.rotationDeg ?? 0;
  if (
    !isCoordinate(xMm) ||
    !isCoordinate(yMm) ||
    !isCoordinate(rotationDeg) ||
    normalizeRotation(rotationDeg) % ROTATION_STEP_DEG !== 0
  ) {
    return failure(
      "invalid_instance",
      "Course coordinates and 15-degree rotation must be valid whole numbers.",
    );
  }
  const displayNumber =
    draft.instances.reduce(
      (highest, instance) => Math.max(highest, instance.displayNumber),
      0,
    ) + 1;
  return {
    ok: true,
    value: {
      ...draft,
      draftVersion: draft.draftVersion + 1,
      instances: [
        ...draft.instances,
        {
          instanceId: input.instanceId,
          obstacleDesignRevisionId: input.obstacleDesignRevisionId,
          xMm: snapToMovementGrid(xMm),
          yMm: snapToMovementGrid(yMm),
          rotationDeg: normalizeRotation(rotationDeg),
          displayNumber,
        },
      ],
      updatedAt: input.now,
    },
  };
}

export function moveCourseInstance(
  draft: CourseDraft,
  instanceId: string,
  delta: { xMm: number; yMm: number },
  now: string,
): CourseResult<CourseDraft> {
  if (!isCoordinate(delta.xMm) || !isCoordinate(delta.yMm)) {
    return failure("invalid_instance", "Movement must use whole millimetres.");
  }
  return updateInstance(draft, instanceId, now, (instance) => ({
    ...instance,
    xMm: instance.xMm + delta.xMm,
    yMm: instance.yMm + delta.yMm,
  }));
}

export function moveCourseInstanceTo(
  draft: CourseDraft,
  instanceId: string,
  position: { xMm: number; yMm: number },
  now: string,
): CourseResult<CourseDraft> {
  if (!Number.isFinite(position.xMm) || !Number.isFinite(position.yMm)) {
    return failure("invalid_instance", "Pointer coordinates must be finite.");
  }
  return updateInstance(draft, instanceId, now, (instance) => ({
    ...instance,
    xMm: snapToMovementGrid(position.xMm),
    yMm: snapToMovementGrid(position.yMm),
  }));
}

export function rotateCourseInstance(
  draft: CourseDraft,
  instanceId: string,
  deltaDeg: number,
  now: string,
): CourseResult<CourseDraft> {
  if (!isCoordinate(deltaDeg) || deltaDeg % ROTATION_STEP_DEG !== 0) {
    return failure("invalid_instance", "Rotation must use 15-degree steps.");
  }
  return updateInstance(draft, instanceId, now, (instance) => ({
    ...instance,
    rotationDeg: normalizeRotation(instance.rotationDeg + deltaDeg),
  }));
}

export function removeCourseInstance(
  draft: CourseDraft,
  instanceId: string,
  now: string,
): CourseResult<CourseDraft> {
  if (!draft.instances.some((instance) => instance.instanceId === instanceId)) {
    return failure(
      "instance_not_found",
      "That course placement no longer exists.",
    );
  }
  return {
    ok: true,
    value: {
      ...draft,
      draftVersion: draft.draftVersion + 1,
      instances: draft.instances.filter(
        (instance) => instance.instanceId !== instanceId,
      ),
      updatedAt: now,
    },
  };
}

function parseInstance(value: unknown): CourseResult<CourseInstance> {
  if (!isRecord(value)) {
    return failure("invalid_instance", "A course placement is malformed.");
  }
  if (
    !isNonEmptyString(value.instanceId) ||
    !isNonEmptyString(value.obstacleDesignRevisionId) ||
    !isCoordinate(value.xMm) ||
    !isCoordinate(value.yMm) ||
    !isCoordinate(value.rotationDeg) ||
    normalizeRotation(value.rotationDeg) !== value.rotationDeg ||
    value.rotationDeg % ROTATION_STEP_DEG !== 0 ||
    !Number.isInteger(value.displayNumber) ||
    (value.displayNumber as number) < 1
  ) {
    return failure("invalid_instance", "A course placement is malformed.");
  }
  return {
    ok: true,
    value: {
      instanceId: value.instanceId,
      obstacleDesignRevisionId: value.obstacleDesignRevisionId,
      xMm: value.xMm,
      yMm: value.yMm,
      rotationDeg: value.rotationDeg,
      displayNumber: value.displayNumber as number,
    },
  };
}

export function parseCourseDraft(
  serialized: string,
): CourseResult<CourseDraft> {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return failure("invalid_course", "The local course is not valid JSON.");
  }
  if (!isRecord(value)) {
    return failure("invalid_course", "The local course is malformed.");
  }
  if (value.schemaVersion !== COURSE_SCHEMA_VERSION) {
    return failure(
      "unsupported_course_schema",
      "This course was created by an unsupported prototype version.",
    );
  }
  if (
    value.courseId !== "local-course-1" ||
    !Number.isInteger(value.draftVersion) ||
    (value.draftVersion as number) < 1 ||
    !isNonEmptyString(value.updatedAt) ||
    !isRecord(value.arena) ||
    value.arena.units !== PROTOTYPE_ARENA.units ||
    value.arena.width !== PROTOTYPE_ARENA.width ||
    value.arena.height !== PROTOTYPE_ARENA.height ||
    value.arena.gridSize !== PROTOTYPE_ARENA.gridSize ||
    !Array.isArray(value.instances)
  ) {
    return failure("invalid_course", "The local course is malformed.");
  }

  const instances: CourseInstance[] = [];
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const candidate of value.instances) {
    const parsed = parseInstance(candidate);
    if (!parsed.ok) return parsed;
    if (
      ids.has(parsed.value.instanceId) ||
      numbers.has(parsed.value.displayNumber)
    ) {
      return failure(
        "invalid_instance",
        "Course placement identifiers and display numbers must be unique.",
      );
    }
    ids.add(parsed.value.instanceId);
    numbers.add(parsed.value.displayNumber);
    instances.push(parsed.value);
  }

  return {
    ok: true,
    value: {
      schemaVersion: COURSE_SCHEMA_VERSION,
      courseId: "local-course-1",
      draftVersion: value.draftVersion as number,
      arena: PROTOTYPE_ARENA,
      instances,
      updatedAt: value.updatedAt,
    },
  };
}

export function serializeCourseDraft(draft: CourseDraft): string {
  return JSON.stringify(draft);
}
