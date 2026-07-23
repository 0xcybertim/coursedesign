import type { CourseDraft, CourseInstance } from "@/domain/course";

const MM_TO_METRES = 0.001;
const ARENA_HALF_WIDTH_METRES = 30;
const ARENA_HALF_DEPTH_METRES = 20;
const ARENA_MARGIN_METRES = 0.6;
const APPROACH_DISTANCE_METRES = 8;
const EXIT_DISTANCE_METRES = 6.5;
const TAKEOFF_DISTANCE_METRES = 2;
const LANDING_DISTANCE_METRES = 2.4;
const HORSE_EYE_HEIGHT_METRES = 1.68;
const HORSE_JUMP_LIFT_METRES = 1.02;
const PREVIEW_SPEED_METRES_PER_SECOND = 5.5;

export type HorsePovPhase =
  | "approach"
  | "takeoff"
  | "apex"
  | "landing"
  | "exit";

export interface HorsePovRoutePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly phase: HorsePovPhase;
  readonly displayNumber: number;
  readonly cumulativeDistance: number;
}

interface HorsePovPathSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly cumulativeDistance: number;
}

export interface HorsePovRoute {
  readonly points: readonly HorsePovRoutePoint[];
  readonly jumpDisplayNumbers: readonly number[];
  readonly totalDistance: number;
  readonly durationSeconds: number;
  readonly pathSamples: readonly HorsePovPathSample[];
}

export interface HorsePovRouteSample {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly lookAt: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly progress: number;
  readonly currentDisplayNumber: number | null;
  readonly motion: "approaching" | "jumping" | "finished";
  readonly completed: boolean;
}

interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

interface JumpCorridor {
  readonly instance: CourseInstance;
  readonly center: GroundPoint;
  readonly direction: GroundPoint;
  readonly approach: GroundPoint;
  readonly takeoff: GroundPoint;
  readonly landing: GroundPoint;
  readonly exit: GroundPoint;
}

function groundDistance(left: GroundPoint, right: GroundPoint) {
  return Math.hypot(right.x - left.x, right.z - left.z);
}

function pointDistance(
  left: Pick<HorsePovPathSample, "x" | "y" | "z">,
  right: Pick<HorsePovPathSample, "x" | "y" | "z">,
) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function pointAlong(
  center: GroundPoint,
  direction: GroundPoint,
  distanceMetres: number,
): GroundPoint {
  return {
    x: center.x + direction.x * distanceMetres,
    z: center.z + direction.z * distanceMetres,
  };
}

function clampGroundPoint(point: GroundPoint): GroundPoint {
  return {
    x: Math.max(
      -ARENA_HALF_WIDTH_METRES + ARENA_MARGIN_METRES,
      Math.min(ARENA_HALF_WIDTH_METRES - ARENA_MARGIN_METRES, point.x),
    ),
    z: Math.max(
      -ARENA_HALF_DEPTH_METRES + ARENA_MARGIN_METRES,
      Math.min(ARENA_HALF_DEPTH_METRES - ARENA_MARGIN_METRES, point.z),
    ),
  };
}

function distanceToArenaEdge(
  point: GroundPoint,
  direction: GroundPoint,
): number {
  const xLimit =
    Math.abs(direction.x) < Number.EPSILON
      ? Number.POSITIVE_INFINITY
      : ((direction.x > 0
          ? ARENA_HALF_WIDTH_METRES
          : -ARENA_HALF_WIDTH_METRES) -
          point.x) /
        direction.x;
  const zLimit =
    Math.abs(direction.z) < Number.EPSILON
      ? Number.POSITIVE_INFINITY
      : ((direction.z > 0
          ? ARENA_HALF_DEPTH_METRES
          : -ARENA_HALF_DEPTH_METRES) -
          point.z) /
        direction.z;
  return Math.max(0, Math.min(xLimit, zLimit) - ARENA_MARGIN_METRES);
}

function routeCandidate(
  instance: CourseInstance,
  sign: 1 | -1,
  previous: GroundPoint,
  previousDirection: GroundPoint | null,
) {
  const center = {
    x: instance.xMm * MM_TO_METRES - ARENA_HALF_WIDTH_METRES,
    z: instance.yMm * MM_TO_METRES - ARENA_HALF_DEPTH_METRES,
  };
  const rotation = (instance.rotationDeg * Math.PI) / 180;
  const direction = {
    x: -Math.sin(rotation) * sign,
    z: Math.cos(rotation) * sign,
  };
  const approachRoom = distanceToArenaEdge(center, {
    x: -direction.x,
    z: -direction.z,
  });
  const exitRoom = distanceToArenaEdge(center, direction);
  const approachDistance = Math.min(APPROACH_DISTANCE_METRES, approachRoom);
  const exitDistance = Math.min(EXIT_DISTANCE_METRES, exitRoom);
  const approach = pointAlong(center, direction, -approachDistance);
  const exit = pointAlong(center, direction, exitDistance);
  const constrainedPenalty =
    Math.max(0, 4 - approachDistance) * 8 + Math.max(0, 3 - exitDistance) * 8;
  const turnPenalty = previousDirection
    ? (1 -
        (previousDirection.x * direction.x +
          previousDirection.z * direction.z)) *
      2.5
    : 0;
  return {
    center,
    direction,
    approach,
    exit,
    approachDistance,
    exitDistance,
    cost: groundDistance(previous, approach) + constrainedPenalty + turnPenalty,
  };
}

function buildJumpCorridors(instances: readonly CourseInstance[]) {
  const corridors: JumpCorridor[] = [];
  let previous: GroundPoint = { x: 0, z: 0 };
  let previousDirection: GroundPoint | null = null;
  for (const instance of instances) {
    const positive = routeCandidate(instance, 1, previous, previousDirection);
    const negative = routeCandidate(instance, -1, previous, previousDirection);
    const candidate =
      negative.cost < positive.cost - Number.EPSILON ? negative : positive;
    const takeoffDistance = Math.min(
      TAKEOFF_DISTANCE_METRES,
      candidate.approachDistance * 0.55,
    );
    const landingDistance = Math.min(
      LANDING_DISTANCE_METRES,
      candidate.exitDistance * 0.55,
    );
    corridors.push({
      instance,
      center: candidate.center,
      direction: candidate.direction,
      approach: candidate.approach,
      takeoff: pointAlong(
        candidate.center,
        candidate.direction,
        -takeoffDistance,
      ),
      landing: pointAlong(
        candidate.center,
        candidate.direction,
        landingDistance,
      ),
      exit: candidate.exit,
    });
    previous = candidate.exit;
    previousDirection = candidate.direction;
  }
  return corridors;
}

function cubicBezier(
  start: GroundPoint,
  controlOne: GroundPoint,
  controlTwo: GroundPoint,
  end: GroundPoint,
  progress: number,
): GroundPoint {
  const inverse = 1 - progress;
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * progress * controlOne.x +
      3 * inverse * progress ** 2 * controlTwo.x +
      progress ** 3 * end.x,
    z:
      inverse ** 3 * start.z +
      3 * inverse ** 2 * progress * controlOne.z +
      3 * inverse * progress ** 2 * controlTwo.z +
      progress ** 3 * end.z,
  };
}

export function buildHorsePovRoute(
  course: CourseDraft,
  knownRevisionIds?: ReadonlySet<string>,
): HorsePovRoute {
  const instances = [...course.instances]
    .filter(
      (instance) =>
        !knownRevisionIds ||
        knownRevisionIds.has(instance.obstacleDesignRevisionId),
    )
    .sort(
      (left, right) =>
        left.displayNumber - right.displayNumber ||
        left.instanceId.localeCompare(right.instanceId),
    );
  if (instances.length === 0)
    return {
      points: [],
      jumpDisplayNumbers: [],
      totalDistance: 0,
      durationSeconds: 0,
      pathSamples: [],
    };

  const corridors = buildJumpCorridors(instances);
  const pathSamples: HorsePovPathSample[] = [];
  const points: HorsePovRoutePoint[] = [];
  let totalDistance = 0;

  const appendSample = (position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }) => {
    const previous = pathSamples[pathSamples.length - 1];
    if (previous && pointDistance(previous, position) < Number.EPSILON) return;
    if (previous) totalDistance += pointDistance(previous, position);
    pathSamples.push({ ...position, cumulativeDistance: totalDistance });
  };
  const appendGroundLine = (
    start: GroundPoint,
    end: GroundPoint,
    subdivisions: number,
  ) => {
    for (let index = 0; index <= subdivisions; index += 1) {
      const progress = index / subdivisions;
      appendSample({
        x: start.x + (end.x - start.x) * progress,
        y: HORSE_EYE_HEIGHT_METRES,
        z: start.z + (end.z - start.z) * progress,
      });
    }
  };
  const appendRoutePoint = (
    ground: GroundPoint,
    y: number,
    phase: HorsePovPhase,
    displayNumber: number,
  ) =>
    points.push({
      ...ground,
      y,
      phase,
      displayNumber,
      cumulativeDistance: totalDistance,
    });

  corridors.forEach((corridor, corridorIndex) => {
    const previousCorridor = corridors[corridorIndex - 1];
    if (previousCorridor) {
      const transitionDistance = groundDistance(
        previousCorridor.exit,
        corridor.approach,
      );
      const tangentLength = Math.min(5.5, transitionDistance * 0.34);
      const controlOne = clampGroundPoint(
        pointAlong(
          previousCorridor.exit,
          previousCorridor.direction,
          tangentLength,
        ),
      );
      const controlTwo = clampGroundPoint(
        pointAlong(corridor.approach, corridor.direction, -tangentLength),
      );
      const subdivisions = Math.max(24, Math.ceil(transitionDistance * 6));
      for (let index = 0; index <= subdivisions; index += 1) {
        const ground = cubicBezier(
          previousCorridor.exit,
          controlOne,
          controlTwo,
          corridor.approach,
          index / subdivisions,
        );
        appendSample({ ...ground, y: HORSE_EYE_HEIGHT_METRES });
      }
    } else {
      appendSample({
        ...corridor.approach,
        y: HORSE_EYE_HEIGHT_METRES,
      });
    }
    appendRoutePoint(
      corridor.approach,
      HORSE_EYE_HEIGHT_METRES,
      "approach",
      corridor.instance.displayNumber,
    );

    appendGroundLine(corridor.approach, corridor.takeoff, 18);
    appendRoutePoint(
      corridor.takeoff,
      HORSE_EYE_HEIGHT_METRES,
      "takeoff",
      corridor.instance.displayNumber,
    );

    const ascentSubdivisions = 20;
    for (let index = 0; index <= ascentSubdivisions; index += 1) {
      const progress = index / ascentSubdivisions;
      const smoothRise = progress ** 2 * (3 - 2 * progress);
      appendSample({
        x:
          corridor.takeoff.x +
          (corridor.center.x - corridor.takeoff.x) * progress,
        y: HORSE_EYE_HEIGHT_METRES + HORSE_JUMP_LIFT_METRES * smoothRise,
        z:
          corridor.takeoff.z +
          (corridor.center.z - corridor.takeoff.z) * progress,
      });
    }
    appendRoutePoint(
      corridor.center,
      HORSE_EYE_HEIGHT_METRES + HORSE_JUMP_LIFT_METRES,
      "apex",
      corridor.instance.displayNumber,
    );
    const descentSubdivisions = 24;
    for (let index = 1; index <= descentSubdivisions; index += 1) {
      const progress = index / descentSubdivisions;
      const smoothFall = progress ** 2 * (3 - 2 * progress);
      appendSample({
        x:
          corridor.center.x +
          (corridor.landing.x - corridor.center.x) * progress,
        y: HORSE_EYE_HEIGHT_METRES + HORSE_JUMP_LIFT_METRES * (1 - smoothFall),
        z:
          corridor.center.z +
          (corridor.landing.z - corridor.center.z) * progress,
      });
    }
    appendRoutePoint(
      corridor.landing,
      HORSE_EYE_HEIGHT_METRES,
      "landing",
      corridor.instance.displayNumber,
    );

    appendGroundLine(corridor.landing, corridor.exit, 16);
    appendRoutePoint(
      corridor.exit,
      HORSE_EYE_HEIGHT_METRES,
      "exit",
      corridor.instance.displayNumber,
    );
  });

  return {
    points,
    jumpDisplayNumbers: instances.map((instance) => instance.displayNumber),
    totalDistance,
    durationSeconds: totalDistance / PREVIEW_SPEED_METRES_PER_SECOND,
    pathSamples,
  };
}

function samplePosition(
  route: HorsePovRoute,
  targetDistance: number,
): { x: number; y: number; z: number } {
  if (route.pathSamples.length === 0)
    return { x: 0, y: HORSE_EYE_HEIGHT_METRES, z: 0 };
  if (route.pathSamples.length === 1) {
    const [point] = route.pathSamples;
    return { x: point.x, y: point.y, z: point.z };
  }
  const clampedDistance = Math.max(
    0,
    Math.min(targetDistance, route.totalDistance),
  );
  const endIndex = route.pathSamples.findIndex(
    (point) => point.cumulativeDistance >= clampedDistance,
  );
  if (endIndex <= 0) {
    const [point] = route.pathSamples;
    return { x: point.x, y: point.y, z: point.z };
  }
  if (endIndex === -1) {
    const point = route.pathSamples[route.pathSamples.length - 1];
    return { x: point.x, y: point.y, z: point.z };
  }
  const start = route.pathSamples[endIndex - 1];
  const end = route.pathSamples[endIndex];
  const segmentDistance = end.cumulativeDistance - start.cumulativeDistance;
  const segmentProgress =
    segmentDistance < Number.EPSILON
      ? 1
      : (clampedDistance - start.cumulativeDistance) / segmentDistance;
  return {
    x: start.x + (end.x - start.x) * segmentProgress,
    y: start.y + (end.y - start.y) * segmentProgress,
    z: start.z + (end.z - start.z) * segmentProgress,
  };
}

export function sampleHorsePovRoute(
  route: HorsePovRoute,
  progress: number,
): HorsePovRouteSample {
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const targetDistance = route.totalDistance * clampedProgress;
  const position = samplePosition(route, targetDistance);
  const lookAheadDistance = Math.min(route.totalDistance, targetDistance + 1.5);
  let lookAt = samplePosition(route, lookAheadDistance);
  if (lookAheadDistance - targetDistance < 0.25) {
    const behind = samplePosition(route, Math.max(0, targetDistance - 1.5));
    lookAt = {
      x: position.x + (position.x - behind.x),
      y: position.y + (position.y - behind.y),
      z: position.z + (position.z - behind.z),
    };
  }
  const nextApex = route.points.find(
    (point) =>
      point.phase === "apex" &&
      point.cumulativeDistance >= targetDistance - Number.EPSILON,
  );
  const activeJump = route.jumpDisplayNumbers.find((displayNumber) => {
    const takeoff = route.points.find(
      (point) =>
        point.displayNumber === displayNumber && point.phase === "takeoff",
    );
    const landing = route.points.find(
      (point) =>
        point.displayNumber === displayNumber && point.phase === "landing",
    );
    return (
      takeoff &&
      landing &&
      targetDistance >= takeoff.cumulativeDistance &&
      targetDistance <= landing.cumulativeDistance
    );
  });
  const completed = clampedProgress >= 1;
  return {
    position,
    lookAt,
    progress: clampedProgress,
    currentDisplayNumber:
      activeJump ??
      nextApex?.displayNumber ??
      route.jumpDisplayNumbers[route.jumpDisplayNumbers.length - 1] ??
      null,
    motion: completed ? "finished" : activeJump ? "jumping" : "approaching",
    completed,
  };
}
