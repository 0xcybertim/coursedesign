"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { artworkTransform, backgroundColor } from "@/domain/artwork";
import type { RenderArtworkSlot, RenderManifest } from "@/domain/product/types";
import type { ArtworkUrlMap } from "./useArtworkAssets";

export function disposeMaterial(material: THREE.Material) {
  const values = Object.values(material) as unknown[];
  for (const value of values) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

function clearGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material))
          object.material.forEach(disposeMaterial);
        else disposeMaterial(object.material);
      }
    });
  }
}

function addBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  color: string,
  rotationZ = 0,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.58 }),
  );
  mesh.position.set(...position);
  mesh.rotation.z = rotationZ;
  group.add(mesh);
}

function applyManifest(
  root: THREE.Group,
  lowerGroup: THREE.Group,
  manifest: RenderManifest,
) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (/_(frame|foot)/.test(object.name)) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial)
          material.color.set(manifest.palette.frame);
      }
    }
  });

  clearGroup(lowerGroup);
  if (manifest.lowerElement === "decorative_panel") {
    addBox(lowerGroup, [2400, 360, 80], [0, 390, 55], manifest.palette.panel);
    addBox(lowerGroup, [2250, 70, 92], [0, 390, 100], "#FF5547", -0.13);
  } else if (manifest.lowerElement === "gate") {
    addBox(
      lowerGroup,
      [2500, 90, 90],
      [0, 400, 50],
      manifest.palette.hardware,
      0.27,
    );
    addBox(
      lowerGroup,
      [2500, 90, 90],
      [0, 400, 50],
      manifest.palette.hardware,
      -0.27,
    );
  } else if (manifest.lowerElement === "filler") {
    for (let index = 0; index < 9; index += 1) {
      addBox(
        lowerGroup,
        [65, 420, 80],
        [-960 + index * 240, 400, 50],
        manifest.palette.polePrimary,
      );
    }
  }
}

async function createPlacedArtworkTexture(
  slot: RenderArtworkSlot,
  url: string,
) {
  const image = await new THREE.ImageLoader().loadAsync(url);
  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = 1500;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  const background = backgroundColor(slot.placement.background);
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const transform = artworkTransform(slot.placement);
  const baseScale =
    slot.placement.fit === "contain"
      ? Math.min(canvas.width / image.width, canvas.height / image.height)
      : Math.max(canvas.width / image.width, canvas.height / image.height);
  const scale = baseScale * transform.scale;
  context.save();
  context.translate(
    canvas.width / 2 + transform.offsetX * canvas.width,
    canvas.height / 2 + transform.offsetY * canvas.height,
  );
  context.rotate((transform.rotationDeg * Math.PI) / 180);
  context.drawImage(
    image,
    (-image.width * scale) / 2,
    (-image.height * scale) / 2,
    image.width * scale,
    image.height * scale,
  );
  context.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.userData.phase1fArtwork = true;
  texture.needsUpdate = true;
  return texture;
}

async function applyArtworkTextures(
  root: THREE.Group,
  manifest: RenderManifest,
  artworkUrls: ArtworkUrlMap,
  previousTextures: Map<"left" | "right", THREE.Texture>,
  isCurrent: () => boolean,
) {
  for (const side of ["left", "right"] as const) {
    const slot = manifest.artworkSlots[side];
    const url = artworkUrls[slot.renderContentHash];
    if (!url) continue;
    const texture = await createPlacedArtworkTexture(slot, url);
    if (!isCurrent()) {
      texture.dispose();
      return;
    }
    const previous = previousTextures.get(side);
    previous?.dispose();
    previousTextures.set(side, texture);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.name.startsWith(`${side}_fixed_artwork_`)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.map = texture;
        material.color.set("#FFFFFF");
        material.transparent = true;
        material.needsUpdate = true;
      }
      object.userData.artifactHash = slot.renderContentHash;
      object.userData.artworkPlacement = slot.placement;
    });
  }
}

interface ThreeSceneProps {
  manifest: RenderManifest;
  reducedMotion: boolean;
  forceFailure: boolean;
  artworkUrls: ArtworkUrlMap;
  onReady: () => void;
  onFailure: (message: string) => void;
}

export default function ThreeScene({
  manifest,
  reducedMotion,
  forceFailure,
  artworkUrls,
  onReady,
  onFailure,
}: ThreeSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<THREE.Group | null>(null);
  const lowerGroupRef = useRef<THREE.Group | null>(null);
  const manifestRef = useRef(manifest);
  const artworkUrlsRef = useRef(artworkUrls);
  const artworkTexturesRef = useRef(new Map<"left" | "right", THREE.Texture>());
  const artworkGenerationRef = useRef(0);

  useEffect(() => {
    manifestRef.current = manifest;
    artworkUrlsRef.current = artworkUrls;
    if (!rootRef.current || !lowerGroupRef.current) return;
    applyManifest(rootRef.current, lowerGroupRef.current, manifest);
    const generation = ++artworkGenerationRef.current;
    void applyArtworkTextures(
      rootRef.current,
      manifest,
      artworkUrls,
      artworkTexturesRef.current,
      () => generation === artworkGenerationRef.current,
    ).catch(() => {
      if (generation === artworkGenerationRef.current) {
        onFailure(
          "The exact artwork texture could not be resolved. The accurate 2.5D view remains active.",
        );
      }
    });
  }, [artworkUrls, manifest, onFailure]);

  useEffect(() => {
    const container = containerRef.current;
    const artworkTextures = artworkTexturesRef.current;
    if (!container) return;
    if (forceFailure) {
      onFailure(
        "Interactive 3D was intentionally disabled for fallback verification.",
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
        "Interactive 3D is unavailable on this device. The accurate 2.5D view remains active.",
      );
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(31, 1, 0.05, 100);
    camera.position.set(5.8, 2.8, 6.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = !reducedMotion;
    controls.enablePan = false;
    controls.minDistance = 4.8;
    controls.maxDistance = 10;
    controls.maxPolarAngle = Math.PI * 0.58;
    controls.update();

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D view of the current SPJ-04 prototype configuration",
    );
    renderer.domElement.setAttribute("role", "img");
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(-4, 7, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb9ccff, 1.5);
    fillLight.position.set(5, 3, 1);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 12),
      new THREE.MeshStandardMaterial({ color: 0xf7f6f1, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    scene.add(floor);

    const grid = new THREE.GridHelper(12, 24, 0xd8d7d1, 0xe8e7e1);
    grid.position.y = 0;
    scene.add(grid);

    const lowerGroup = new THREE.Group();
    lowerGroupRef.current = lowerGroup;

    const loader = new GLTFLoader();
    loader.load(
      manifest.glbUrl,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;
        root.scale.setScalar(0.001);
        root.add(lowerGroup);
        rootRef.current = root;
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.material = Array.isArray(object.material)
            ? object.material.map((material) => material.clone())
            : object.material.clone();
        });
        applyManifest(root, lowerGroup, manifestRef.current);
        scene.add(root);
        const generation = ++artworkGenerationRef.current;
        void applyArtworkTextures(
          root,
          manifestRef.current,
          artworkUrlsRef.current,
          artworkTextures,
          () => !disposed && generation === artworkGenerationRef.current,
        )
          .then(() => {
            if (!disposed && generation === artworkGenerationRef.current)
              onReady();
          })
          .catch(() => {
            if (!disposed)
              onFailure(
                "The exact artwork texture could not be loaded. The accurate 2.5D view remains active.",
              );
          });
      },
      undefined,
      () => {
        if (!disposed)
          onFailure(
            "The SPJ-04 model could not be loaded. The accurate 2.5D view remains active.",
          );
      },
    );

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
        "The 3D graphics context was lost. The accurate 2.5D view remains active.",
      );
    };
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);

    const render = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      artworkGenerationRef.current += 1;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
      );
      controls.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material))
          object.material.forEach(disposeMaterial);
        else disposeMaterial(object.material);
      });
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      rootRef.current = null;
      lowerGroupRef.current = null;
      for (const texture of artworkTextures.values()) texture.dispose();
      artworkTextures.clear();
    };
  }, [forceFailure, manifest.glbUrl, onFailure, onReady, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className="three-canvas"
      data-testid="3d-view"
      data-left-artifact-hash={manifest.artworkSlots.left.renderContentHash}
      data-right-artifact-hash={manifest.artworkSlots.right.renderContentHash}
      data-left-artwork-placement={JSON.stringify(
        manifest.artworkSlots.left.placement,
      )}
      data-right-artwork-placement={JSON.stringify(
        manifest.artworkSlots.right.placement,
      )}
    />
  );
}
