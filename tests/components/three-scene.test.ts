import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { disposeMaterial } from "@/components/studio/ThreeScene";

describe("Three.js artwork resource ownership", () => {
  it("disposes mapped textures and their owning cloned material", () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const textureDispose = vi.spyOn(texture, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    disposeMaterial(material);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
