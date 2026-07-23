"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CourseDraft } from "@/domain/course";
import {
  isProfileWingRevision,
  type LocalDesignRevision,
} from "@/domain/design";
import {
  buildHorsePovRoute,
  sampleHorsePovRoute,
  type HorsePovRoute,
} from "./horse-pov-route";

const MM_TO_WORLD = 0.001;
const ARENA_WIDTH_WORLD = 60;
const ARENA_DEPTH_WORLD = 40;
const ARENA_KEYBOARD_STEP_WORLD = 2;
const ARENA_KEYBOARD_FAST_STEP_WORLD = 5;
const OVERVIEW_CAMERA_FOV = 38;
const HORSE_POV_CAMERA_FOV = 68;

export interface HorsePovProgress {
  readonly progress: number;
  readonly currentDisplayNumber: number | null;
  readonly totalJumps: number;
  readonly durationSeconds: number;
  readonly motion: "approaching" | "jumping" | "finished";
}

function applyHorsePovCamera(
  camera: THREE.PerspectiveCamera,
  route: HorsePovRoute,
  progress: number,
) {
  const sample = sampleHorsePovRoute(route, progress);
  camera.position.set(sample.position.x, sample.position.y, sample.position.z);
  camera.lookAt(sample.lookAt.x, sample.lookAt.y, sample.lookAt.z);
  return sample;
}

function configureArenaCanvas(
  canvas: HTMLCanvasElement,
  mode: "overview" | "horse-pov",
) {
  if (mode === "horse-pov") {
    canvas.setAttribute(
      "aria-label",
      "Animated horse point-of-view preview through the inferred obstacle sequence.",
    );
    canvas.removeAttribute("aria-keyshortcuts");
  } else {
    canvas.setAttribute(
      "aria-label",
      "Interactive 3D overview of the 60 by 40 metre prototype arena. Use the arrow keys to move, drag to rotate, and scroll to zoom.",
    );
    canvas.setAttribute(
      "aria-keyshortcuts",
      "ArrowUp ArrowDown ArrowLeft ArrowRight",
    );
  }
}

export function moveCourseArenaCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  key: string,
  distance = ARENA_KEYBOARD_STEP_WORLD,
) {
  if (
    key !== "ArrowUp" &&
    key !== "ArrowDown" &&
    key !== "ArrowLeft" &&
    key !== "ArrowRight"
  )
    return false;

  const forward = camera.getWorldDirection(new THREE.Vector3());
  forward.y = 0;
  if (forward.lengthSq() < Number.EPSILON) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3()
    .crossVectors(forward, camera.up)
    .normalize();
  const requestedDelta = new THREE.Vector3();
  if (key === "ArrowUp") requestedDelta.copy(forward);
  if (key === "ArrowDown") requestedDelta.copy(forward).multiplyScalar(-1);
  if (key === "ArrowRight") requestedDelta.copy(right);
  if (key === "ArrowLeft") requestedDelta.copy(right).multiplyScalar(-1);
  requestedDelta.multiplyScalar(distance);

  const nextTargetX = THREE.MathUtils.clamp(
    target.x + requestedDelta.x,
    -ARENA_WIDTH_WORLD / 2,
    ARENA_WIDTH_WORLD / 2,
  );
  const nextTargetZ = THREE.MathUtils.clamp(
    target.z + requestedDelta.z,
    -ARENA_DEPTH_WORLD / 2,
    ARENA_DEPTH_WORLD / 2,
  );
  const appliedDelta = new THREE.Vector3(
    nextTargetX - target.x,
    0,
    nextTargetZ - target.z,
  );
  if (appliedDelta.lengthSq() < Number.EPSILON) return false;

  camera.position.add(appliedDelta);
  target.add(appliedDelta);
  return true;
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function captureCourseArenaNavigationKey(
  event: globalThis.KeyboardEvent,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  distance = ARENA_KEYBOARD_STEP_WORLD,
) {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    isEditableKeyboardTarget(event.target) ||
    (event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight")
  )
    return false;

  event.preventDefault();
  event.stopPropagation();
  moveCourseArenaCamera(camera, target, event.key, distance);
  return true;
}

function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material) as unknown[])
    if (value instanceof THREE.Texture) value.dispose();
  material.dispose();
}

export function disposeCourseArenaObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const renderObject = object as THREE.Object3D & {
      readonly geometry?: THREE.BufferGeometry;
      readonly material?: THREE.Material | readonly THREE.Material[];
    };
    renderObject.geometry?.dispose();
    if (!renderObject.material) return;
    const materials = Array.isArray(renderObject.material)
      ? renderObject.material
      : [renderObject.material];
    for (const material of materials) disposeMaterial(material);
  });
}

function clearGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeCourseArenaObject(child);
  }
}

function addBox(
  group: THREE.Group,
  sizeMm: readonly [number, number, number],
  positionMm: readonly [number, number, number],
  color: THREE.ColorRepresentation,
  name: string,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      sizeMm[0] * MM_TO_WORLD,
      sizeMm[1] * MM_TO_WORLD,
      sizeMm[2] * MM_TO_WORLD,
    ),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.62,
      metalness: 0.02,
    }),
  );
  mesh.name = name;
  mesh.position.set(
    positionMm[0] * MM_TO_WORLD,
    positionMm[1] * MM_TO_WORLD,
    positionMm[2] * MM_TO_WORLD,
  );
  group.add(mesh);
  return mesh;
}

function addPole(
  group: THREE.Group,
  input: {
    readonly id: string;
    readonly lengthMm: number;
    readonly diameterMm: number;
    readonly centerHeightMm: number;
    readonly color: THREE.ColorRepresentation;
  },
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      (input.diameterMm / 2) * MM_TO_WORLD,
      (input.diameterMm / 2) * MM_TO_WORLD,
      input.lengthMm * MM_TO_WORLD,
      18,
    ),
    new THREE.MeshStandardMaterial({
      color: input.color,
      roughness: 0.5,
    }),
  );
  mesh.name = input.id;
  mesh.rotation.z = Math.PI / 2;
  mesh.position.y = input.centerHeightMm * MM_TO_WORLD;
  group.add(mesh);
}

function buildSpjObstacle(
  revision: Exclude<
    LocalDesignRevision,
    { readonly familyId: "profile-wing-vertical-v1" }
  >,
) {
  const manifest = revision.snapshot.renderManifest;
  const group = new THREE.Group();
  const halfWidth = manifest.geometryMm.overallWidth / 2;
  const wingCenterX = halfWidth - manifest.geometryMm.wingFaceWidth / 2;
  const frame = manifest.palette.frame;

  addBox(
    group,
    [manifest.geometryMm.wingFaceWidth, manifest.geometryMm.wingFaceHeight, 90],
    [-wingCenterX, manifest.geometryMm.wingFaceHeight / 2, 0],
    frame,
    "spj-left-wing",
  );
  addBox(
    group,
    [manifest.geometryMm.wingFaceWidth, manifest.geometryMm.wingFaceHeight, 90],
    [wingCenterX, manifest.geometryMm.wingFaceHeight / 2, 0],
    frame,
    "spj-right-wing",
  );

  const trackX = manifest.geometryMm.poleLength / 2 + 75;
  for (const side of [-1, 1])
    addBox(
      group,
      [76, 1650, 90],
      [trackX * side, 825, 0],
      manifest.palette.hardware,
      `spj-track-${side}`,
    );

  [650, 950, 1250, 1550].forEach((centerHeightMm, index) =>
    addPole(group, {
      id: `spj-pole-${index + 1}`,
      lengthMm: manifest.geometryMm.poleLength,
      diameterMm: manifest.geometryMm.poleDiameter,
      centerHeightMm,
      color:
        index % 2 === 0
          ? manifest.palette.polePrimary
          : manifest.palette.poleSecondary,
    }),
  );

  for (const side of [-1, 1])
    addBox(
      group,
      [1200, 70, manifest.geometryMm.overallDepth],
      [wingCenterX * side, 35, 0],
      frame,
      `spj-foot-${side}`,
    );

  if (manifest.lowerElement === "decorative_panel")
    addBox(
      group,
      [2400, 360, 80],
      [0, 390, 55],
      manifest.palette.panel,
      "spj-decorative-panel",
    );
  else if (manifest.lowerElement === "gate") {
    const left = addBox(
      group,
      [2500, 90, 90],
      [0, 400, 50],
      manifest.palette.hardware,
      "spj-gate-left",
    );
    const right = addBox(
      group,
      [2500, 90, 90],
      [0, 400, 50],
      manifest.palette.hardware,
      "spj-gate-right",
    );
    left.rotation.z = 0.27;
    right.rotation.z = -0.27;
  } else if (manifest.lowerElement === "filler")
    for (let index = 0; index < 9; index += 1)
      addBox(
        group,
        [65, 420, 80],
        [-960 + index * 240, 400, 50],
        manifest.palette.polePrimary,
        `spj-filler-${index + 1}`,
      );

  group.userData.familyId = "spj-04-club-classic";
  group.userData.configurationHash = revision.configurationHash;
  return group;
}

function buildProfileObstacle(
  revision: Extract<
    LocalDesignRevision,
    { readonly familyId: "profile-wing-vertical-v1" }
  >,
) {
  const manifest = revision.snapshot.renderManifest;
  const group = new THREE.Group();
  const shape = new THREE.Shape(
    manifest.sharedProfileGeometry.fittedPolygonMm.map(
      (point) =>
        new THREE.Vector2(point.x * MM_TO_WORLD, point.y * MM_TO_WORLD),
    ),
  );
  const sharedGeometry = new THREE.ExtrudeGeometry(shape, {
    depth:
      manifest.sharedProfileGeometry.inferredExtrusionDepthMm * MM_TO_WORLD,
    bevelEnabled: false,
    curveSegments: 1,
  });
  sharedGeometry.translate(
    0,
    0,
    (-manifest.sharedProfileGeometry.inferredExtrusionDepthMm * MM_TO_WORLD) /
      2,
  );
  manifest.wingInstances.forEach((wing, index) => {
    const mesh = new THREE.Mesh(
      sharedGeometry.clone(),
      new THREE.MeshStandardMaterial({
        color: index === 0 ? 0xff5547 : 0xe8d51b,
        roughness: 0.58,
        side: THREE.DoubleSide,
      }),
    );
    mesh.name = wing.id;
    mesh.position.set(
      wing.translateMm[0] * MM_TO_WORLD,
      wing.translateMm[1] * MM_TO_WORLD,
      wing.translateMm[2] * MM_TO_WORLD,
    );
    if (wing.mirrorX) mesh.scale.x = -1;
    mesh.userData.sourceGeometrySha256 = manifest.geometrySha256;
    group.add(mesh);
  });
  sharedGeometry.dispose();

  manifest.poles.forEach((pole, index) =>
    addPole(group, {
      id: pole.id,
      lengthMm: pole.lengthMm,
      diameterMm: pole.diameterMm,
      centerHeightMm: pole.centerHeightMm,
      color: index % 2 === 0 ? 0x0d43c7 : 0xffffff,
    }),
  );
  manifest.fixedSupports.tracks.forEach((track) =>
    addBox(
      group,
      [76, track.heightMm, 90],
      [track.xMm, track.heightMm / 2, 0],
      0x252624,
      `profile-track-${track.xMm}`,
    ),
  );
  manifest.fixedSupports.feet.forEach((foot, index) =>
    addBox(
      group,
      [1200, 70, foot.depthMm],
      [foot.xMm, 35, 0],
      index === 0 ? 0xff5547 : 0xe8d51b,
      `profile-foot-${foot.xMm}`,
    ),
  );

  group.userData.familyId = revision.familyId;
  group.userData.configurationHash = revision.configurationHash;
  group.userData.geometrySha256 = manifest.geometrySha256;
  return group;
}

function addPlacementIndicator(
  group: THREE.Group,
  input: {
    readonly selected: boolean;
    readonly warning: boolean;
    readonly widthMm: number;
    readonly depthMm: number;
    readonly displayNumber: number;
  },
) {
  if (input.selected || input.warning) {
    const highlight = new THREE.Mesh(
      new THREE.PlaneGeometry(
        input.widthMm * MM_TO_WORLD + 0.7,
        input.depthMm * MM_TO_WORLD + 0.7,
      ),
      new THREE.MeshBasicMaterial({
        color: input.warning ? 0xa85a00 : 0x0d43c7,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
      }),
    );
    highlight.name = "placement-highlight";
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.y = 0.015;
    group.add(highlight);
  }
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.06, 24),
    new THREE.MeshStandardMaterial({
      color: input.selected ? 0x0d43c7 : input.warning ? 0xa85a00 : 0x0b0b0b,
      roughness: 0.55,
    }),
  );
  marker.name = `placement-${input.displayNumber}`;
  marker.position.set(
    input.widthMm * MM_TO_WORLD * 0.47,
    0.08,
    input.depthMm * MM_TO_WORLD * 0.65,
  );
  marker.userData.displayNumber = input.displayNumber;
  group.add(marker);
}

export function populateCourseArena(
  root: THREE.Group,
  input: {
    readonly course: CourseDraft;
    readonly revisions: readonly LocalDesignRevision[];
    readonly selectedInstanceId: string | null;
    readonly warningInstanceIds: ReadonlySet<string>;
  },
) {
  clearGroup(root);
  for (const instance of input.course.instances) {
    const revision = input.revisions.find(
      (candidate) => candidate.revisionId === instance.obstacleDesignRevisionId,
    );
    if (!revision) continue;
    const obstacle = isProfileWingRevision(revision)
      ? buildProfileObstacle(revision)
      : buildSpjObstacle(revision);
    obstacle.name = `course-obstacle-${instance.instanceId}`;
    obstacle.position.set(
      instance.xMm * MM_TO_WORLD - ARENA_WIDTH_WORLD / 2,
      0,
      instance.yMm * MM_TO_WORLD - ARENA_DEPTH_WORLD / 2,
    );
    obstacle.rotation.y = THREE.MathUtils.degToRad(-instance.rotationDeg);
    obstacle.userData.instanceId = instance.instanceId;
    obstacle.userData.displayNumber = instance.displayNumber;
    obstacle.userData.revisionId = revision.revisionId;
    addPlacementIndicator(obstacle, {
      selected: instance.instanceId === input.selectedInstanceId,
      warning: input.warningInstanceIds.has(instance.instanceId),
      widthMm: revision.snapshot.footprint.width,
      depthMm: revision.snapshot.footprint.depth,
      displayNumber: instance.displayNumber,
    });
    root.add(obstacle);
  }
}

function createArenaGrid() {
  const points: THREE.Vector3[] = [];
  for (let x = -ARENA_WIDTH_WORLD / 2; x <= ARENA_WIDTH_WORLD / 2; x += 5)
    points.push(
      new THREE.Vector3(x, 0.008, -ARENA_DEPTH_WORLD / 2),
      new THREE.Vector3(x, 0.008, ARENA_DEPTH_WORLD / 2),
    );
  for (let z = -ARENA_DEPTH_WORLD / 2; z <= ARENA_DEPTH_WORLD / 2; z += 5)
    points.push(
      new THREE.Vector3(-ARENA_WIDTH_WORLD / 2, 0.008, z),
      new THREE.Vector3(ARENA_WIDTH_WORLD / 2, 0.008, z),
    );
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: 0xc9c6bb,
      transparent: true,
      opacity: 0.72,
    }),
  );
}

export default function CourseArenaThreeScene({
  course,
  revisions,
  selectedInstanceId,
  warningInstanceIds,
  active,
  mode,
  horsePovPlaying,
  horsePovRestartKey,
  horsePovSpeed,
  reducedMotion,
  forceFailure,
  resetViewKey,
  onReady,
  onFailure,
  onHorsePovProgress,
  onHorsePovComplete,
}: {
  readonly course: CourseDraft;
  readonly revisions: readonly LocalDesignRevision[];
  readonly selectedInstanceId: string | null;
  readonly warningInstanceIds: readonly string[];
  readonly active: boolean;
  readonly mode: "overview" | "horse-pov";
  readonly horsePovPlaying: boolean;
  readonly horsePovRestartKey: number;
  readonly horsePovSpeed: number;
  readonly reducedMotion: boolean;
  readonly forceFailure: boolean;
  readonly resetViewKey: number;
  readonly onReady: () => void;
  readonly onFailure: (message: string) => void;
  readonly onHorsePovProgress: (progress: HorsePovProgress) => void;
  readonly onHorsePovComplete: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const courseRootRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  const modeRef = useRef(mode);
  const horsePovPlayingRef = useRef(horsePovPlaying);
  const horsePovSpeedRef = useRef(horsePovSpeed);
  const horsePovElapsedRef = useRef(0);
  const horsePovCompletedRef = useRef(false);
  const onHorsePovProgressRef = useRef(onHorsePovProgress);
  const onHorsePovCompleteRef = useRef(onHorsePovComplete);
  const knownRevisionIds = useMemo(
    () => new Set(revisions.map((revision) => revision.revisionId)),
    [revisions],
  );
  const horsePovRoute = useMemo(
    () => buildHorsePovRoute(course, knownRevisionIds),
    [course, knownRevisionIds],
  );
  const horsePovRouteRef = useRef(horsePovRoute);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    horsePovPlayingRef.current = horsePovPlaying;
  }, [horsePovPlaying]);

  useEffect(() => {
    horsePovSpeedRef.current = horsePovSpeed;
  }, [horsePovSpeed]);

  useEffect(() => {
    onHorsePovProgressRef.current = onHorsePovProgress;
    onHorsePovCompleteRef.current = onHorsePovComplete;
  }, [onHorsePovComplete, onHorsePovProgress]);

  useEffect(() => {
    modeRef.current = mode;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const canvas = canvasRef.current;
    if (canvas) configureArenaCanvas(canvas, mode);
    if (!camera || !controls) return;
    if (mode === "horse-pov") {
      controls.enabled = false;
      camera.fov = HORSE_POV_CAMERA_FOV;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      const route = horsePovRouteRef.current;
      const progress =
        route.durationSeconds > 0
          ? horsePovElapsedRef.current / route.durationSeconds
          : 0;
      applyHorsePovCamera(camera, route, progress);
    } else {
      controls.enabled = true;
      camera.fov = OVERVIEW_CAMERA_FOV;
      camera.near = 0.1;
      camera.updateProjectionMatrix();
      controls.reset();
    }
  }, [mode]);

  useEffect(() => {
    horsePovRouteRef.current = horsePovRoute;
    horsePovElapsedRef.current = 0;
    horsePovCompletedRef.current = false;
    const camera = cameraRef.current;
    if (camera && modeRef.current === "horse-pov")
      applyHorsePovCamera(camera, horsePovRoute, 0);
    onHorsePovProgressRef.current({
      progress: 0,
      currentDisplayNumber: horsePovRoute.jumpDisplayNumbers[0] ?? null,
      totalJumps: horsePovRoute.jumpDisplayNumbers.length,
      durationSeconds: horsePovRoute.durationSeconds,
      motion: "approaching",
    });
  }, [horsePovRoute]);

  useEffect(() => {
    if (horsePovRestartKey <= 0) return;
    horsePovElapsedRef.current = 0;
    horsePovCompletedRef.current = false;
    const route = horsePovRouteRef.current;
    const camera = cameraRef.current;
    if (camera && modeRef.current === "horse-pov")
      applyHorsePovCamera(camera, route, 0);
    onHorsePovProgressRef.current({
      progress: 0,
      currentDisplayNumber: route.jumpDisplayNumbers[0] ?? null,
      totalJumps: route.jumpDisplayNumbers.length,
      durationSeconds: route.durationSeconds,
      motion: "approaching",
    });
  }, [horsePovRestartKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (forceFailure) {
      onFailure(
        "Interactive arena 3D was intentionally disabled. The editable 2D plan remains active.",
      );
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      onFailure(
        "Interactive arena 3D is unavailable on this device. The editable 2D plan remains active.",
      );
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f3ed);
    const camera = new THREE.PerspectiveCamera(
      OVERVIEW_CAMERA_FOV,
      1,
      0.1,
      250,
    );
    camera.position.set(42, 44, 45);
    cameraRef.current = camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.25, 0);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.minDistance = 24;
    controls.maxDistance = 110;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = 1.28;
    controls.update();
    controls.saveState();
    controlsRef.current = controls;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute("role", "application");
    configureArenaCanvas(renderer.domElement, modeRef.current);
    renderer.domElement.tabIndex = 0;
    canvasRef.current = renderer.domElement;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc8b8, 2.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(-24, 44, 22);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb9ccff, 1.25);
    fillLight.position.set(28, 20, -18);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_WIDTH_WORLD, ARENA_DEPTH_WORLD),
      new THREE.MeshStandardMaterial({ color: 0xeee9dd, roughness: 1 }),
    );
    floor.name = "prototype-arena-floor";
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    scene.add(createArenaGrid());

    const courseRoot = new THREE.Group();
    courseRoot.name = "course-placements";
    courseRootRef.current = courseRoot;
    scene.add(courseRoot);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onFailure(
        "The arena 3D graphics context was lost. The editable 2D plan remains active.",
      );
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!activeRef.current || modeRef.current !== "overview") return;
      const handled = captureCourseArenaNavigationKey(
        event,
        camera,
        controls.target,
        event.shiftKey
          ? ARENA_KEYBOARD_FAST_STEP_WORLD
          : ARENA_KEYBOARD_STEP_WORLD,
      );
      if (handled) controls.update();
    };
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    if (activeRef.current) renderer.domElement.focus({ preventScroll: true });
    if (modeRef.current === "horse-pov") {
      controls.enabled = false;
      camera.fov = HORSE_POV_CAMERA_FOV;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      applyHorsePovCamera(camera, horsePovRouteRef.current, 0);
    }
    onReady();

    let previousFrameTime = performance.now();
    let lastProgressNotificationTime = 0;
    const render = (frameTime = performance.now()) => {
      if (disposed) return;
      const deltaSeconds = Math.min(
        Math.max((frameTime - previousFrameTime) / 1000, 0),
        0.05,
      );
      previousFrameTime = frameTime;
      if (activeRef.current && modeRef.current === "horse-pov") {
        const route = horsePovRouteRef.current;
        if (
          horsePovPlayingRef.current &&
          route.durationSeconds > 0 &&
          !horsePovCompletedRef.current
        )
          horsePovElapsedRef.current += deltaSeconds * horsePovSpeedRef.current;
        const progress =
          route.durationSeconds > 0
            ? Math.min(horsePovElapsedRef.current / route.durationSeconds, 1)
            : 0;
        const sample = applyHorsePovCamera(camera, route, progress);
        if (
          frameTime - lastProgressNotificationTime >= 120 ||
          sample.completed
        ) {
          lastProgressNotificationTime = frameTime;
          onHorsePovProgressRef.current({
            progress,
            currentDisplayNumber: sample.currentDisplayNumber,
            totalJumps: route.jumpDisplayNumbers.length,
            durationSeconds: route.durationSeconds,
            motion: sample.motion,
          });
        }
        if (sample.completed && !horsePovCompletedRef.current) {
          horsePovCompletedRef.current = true;
          horsePovPlayingRef.current = false;
          onHorsePovCompleteRef.current();
        }
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
      );
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      controls.dispose();
      disposeCourseArenaObject(scene);
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      courseRootRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      canvasRef.current = null;
    };
  }, [forceFailure, onFailure, onReady, reducedMotion]);

  useEffect(() => {
    if (resetViewKey > 0 && modeRef.current === "overview")
      controlsRef.current?.reset();
  }, [resetViewKey]);

  useEffect(() => {
    const root = courseRootRef.current;
    if (!root) return;
    populateCourseArena(root, {
      course,
      revisions,
      selectedInstanceId,
      warningInstanceIds: new Set(warningInstanceIds),
    });
  }, [course, revisions, selectedInstanceId, warningInstanceIds]);

  return (
    <div
      ref={containerRef}
      className="course-arena-three-canvas"
      data-testid="course-arena-3d"
      data-course-version={course.draftVersion}
      data-placement-count={course.instances.length}
    />
  );
}
