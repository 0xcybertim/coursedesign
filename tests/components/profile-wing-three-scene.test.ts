import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  disposeProfileWingScene,
  profileShapePointsWorld,
} from "@/components/profile-wing/ProfileWingThreeScene";

describe("Phase 1H-C2 Three.js geometry ownership", () => {
  it("converts canonical millimetres to shared world coordinates without reshaping", () => {
    const points = profileShapePointsWorld([
      { x: -600, y: 150 },
      { x: 0, y: 1650 },
      { x: 600, y: 150 },
    ]);
    expect(points[0]!.x).toBeCloseTo(-0.6);
    expect(points[0]!.y).toBeCloseTo(0.15);
    expect(points[1]!.x).toBeCloseTo(0);
    expect(points[1]!.y).toBeCloseTo(1.65);
    expect(points[2]!.x).toBeCloseTo(0.6);
    expect(points[2]!.y).toBeCloseTo(0.15);
  });

  it("disposes every generated geometry and material on unmount", () => {
    const scene = new THREE.Scene();
    const firstGeometry = new THREE.BoxGeometry();
    const secondGeometry = new THREE.PlaneGeometry();
    const firstMaterial = new THREE.MeshStandardMaterial();
    const secondMaterial = new THREE.MeshStandardMaterial();
    scene.add(new THREE.Mesh(firstGeometry, firstMaterial));
    scene.add(new THREE.Mesh(secondGeometry, secondMaterial));
    const disposals = [
      vi.spyOn(firstGeometry, "dispose"),
      vi.spyOn(secondGeometry, "dispose"),
      vi.spyOn(firstMaterial, "dispose"),
      vi.spyOn(secondMaterial, "dispose"),
    ];

    disposeProfileWingScene(scene);

    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });
});
