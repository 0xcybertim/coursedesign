"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  ProfileWingPointMm,
  ProfileWingRenderManifest,
} from "@/domain/design";

const MM_TO_WORLD = 0.001;

export function profileShapePointsWorld(points: readonly ProfileWingPointMm[]) {
  return points.map(
    (point) => new THREE.Vector2(point.x * MM_TO_WORLD, point.y * MM_TO_WORLD),
  );
}

export function disposeProfileWingScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.dispose();
  });
}

function addBox(
  group: THREE.Group,
  sizeMm: readonly [number, number, number],
  positionMm: readonly [number, number, number],
  color: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      sizeMm[0] * MM_TO_WORLD,
      sizeMm[1] * MM_TO_WORLD,
      sizeMm[2] * MM_TO_WORLD,
    ),
    new THREE.MeshStandardMaterial({ color, roughness: 0.62 }),
  );
  mesh.position.set(
    positionMm[0] * MM_TO_WORLD,
    positionMm[1] * MM_TO_WORLD,
    positionMm[2] * MM_TO_WORLD,
  );
  group.add(mesh);
  return mesh;
}

interface ProfileWingThreeSceneProps {
  readonly manifest: ProfileWingRenderManifest;
  readonly reducedMotion: boolean;
  readonly forceFailure: boolean;
  readonly onReady: () => void;
  readonly onFailure: (message: string) => void;
}

export default function ProfileWingThreeScene({
  manifest,
  reducedMotion,
  forceFailure,
  onReady,
  onFailure,
}: ProfileWingThreeSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (forceFailure) {
      onFailure(
        "Interactive 3D was intentionally disabled. The exact shared-polygon 2.5D view remains active.",
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
        "Interactive 3D is unavailable on this device. The exact shared-polygon 2.5D view remains active.",
      );
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    camera.position.set(6.4, 3.4, 7.1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.85, 0);
    controls.enableDamping = !reducedMotion;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.58;
    controls.update();

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D view of the generated Profile Wing Vertical prototype",
    );
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.dataset.geometrySha256 = manifest.geometrySha256;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 2.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3);
    keyLight.position.set(-4, 7, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb9ccff, 1.4);
    fillLight.position.set(5, 4, 1);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 8),
      new THREE.MeshStandardMaterial({ color: 0xf7f6f1, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    scene.add(floor);
    const grid = new THREE.GridHelper(10, 20, 0xd8d7d1, 0xe8e7e1);
    scene.add(grid);

    const product = new THREE.Group();
    const shape = new THREE.Shape(
      profileShapePointsWorld(manifest.sharedProfileGeometry.fittedPolygonMm),
    );
    const wingGeometry = new THREE.ExtrudeGeometry(shape, {
      depth:
        manifest.sharedProfileGeometry.inferredExtrusionDepthMm * MM_TO_WORLD,
      bevelEnabled: false,
      curveSegments: 1,
    });
    wingGeometry.translate(
      0,
      0,
      (-manifest.sharedProfileGeometry.inferredExtrusionDepthMm * MM_TO_WORLD) /
        2,
    );
    manifest.wingInstances.forEach((wing, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: index === 0 ? 0xff5547 : 0xe8d51b,
        roughness: 0.58,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(wingGeometry.clone(), material);
      mesh.name = wing.id;
      mesh.position.set(
        wing.translateMm[0] * MM_TO_WORLD,
        wing.translateMm[1] * MM_TO_WORLD,
        wing.translateMm[2] * MM_TO_WORLD,
      );
      if (wing.mirrorX) mesh.scale.x = -1;
      mesh.userData.sourceGeometrySha256 = manifest.geometrySha256;
      product.add(mesh);
    });
    wingGeometry.dispose();

    manifest.poles.forEach((pole, index) => {
      const geometry = new THREE.CylinderGeometry(
        (pole.diameterMm / 2) * MM_TO_WORLD,
        (pole.diameterMm / 2) * MM_TO_WORLD,
        pole.lengthMm * MM_TO_WORLD,
        24,
      );
      const material = new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? 0x0d43c7 : 0xffffff,
        roughness: 0.48,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = pole.id;
      mesh.rotation.z = Math.PI / 2;
      mesh.position.y = pole.centerHeightMm * MM_TO_WORLD;
      product.add(mesh);
    });

    manifest.fixedSupports.tracks.forEach((track) => {
      addBox(
        product,
        [76, track.heightMm, 90],
        [track.xMm, track.heightMm / 2, 0],
        0x252624,
      );
    });
    manifest.fixedSupports.feet.forEach((foot, index) => {
      addBox(
        product,
        [1200, 70, foot.depthMm],
        [foot.xMm, 35, 0],
        index === 0 ? 0xff5547 : 0xe8d51b,
      );
    });
    manifest.fixedSupports.flags.forEach((flag, index) => {
      const flagShape = new THREE.Shape();
      flagShape.moveTo(0, 0);
      flagShape.lineTo(index === 0 ? -0.25 : 0.25, 0);
      flagShape.lineTo(index === 0 ? -0.19 : 0.19, 0.1);
      flagShape.lineTo(0, 0.1);
      const geometry = new THREE.ExtrudeGeometry(flagShape, {
        depth: 0.015,
        bevelEnabled: false,
      });
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: index === 0 ? 0xffffff : 0xff5547,
          side: THREE.DoubleSide,
        }),
      );
      mesh.position.set(flag.xMm * MM_TO_WORLD, flag.yMm * MM_TO_WORLD, 0);
      product.add(mesh);
    });
    scene.add(product);

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
        "The 3D graphics context was lost. The exact shared-polygon 2.5D view remains active.",
      );
    };
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    onReady();

    const render = () => {
      if (disposed) return;
      controls.update();
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
      controls.dispose();
      disposeProfileWingScene(scene);
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [forceFailure, manifest, onFailure, onReady, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className="profile-wing-three-canvas"
      data-testid="profile-wing-3d"
      data-geometry-sha256={manifest.geometrySha256}
    />
  );
}
