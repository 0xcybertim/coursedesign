import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  captureCourseArenaNavigationKey,
  disposeCourseArenaObject,
  moveCourseArenaCamera,
  populateCourseArena,
  populateCourseEnvironment,
} from "@/components/course/CourseArenaThreeScene";
import {
  addCourseScenery,
  createCourseDraft,
  placeCourseInstance,
  type CourseDraft,
} from "@/domain/course";
import {
  createLocalDesignLibrary,
  createLocalDesignWorkspace,
  deriveProfileWingPrototype,
  localDesignLibraryRevisions,
  saveLocalRevision,
  saveProfileWingRevision,
} from "@/domain/design";
import {
  appendSilhouetteDecision,
  createEmptySilhouetteReview,
} from "@/domain/silhouette";

const T0 = "2026-07-23T14:00:00.000Z";
const T1 = "2026-07-23T14:01:00.000Z";
const T2 = "2026-07-23T14:02:00.000Z";

function mixedRevisions() {
  const savedSpj = saveLocalRevision(
    createLocalDesignWorkspace({ draftId: "arena-3d-draft", now: T0 }),
    { revisionId: "spj-revision-3d", now: T1 },
  );
  if (!savedSpj.ok) throw new Error(savedSpj.error.message);
  const review = appendSilhouetteDecision(createEmptySilhouetteReview(), {
    decisionId: "arena-profile-decision",
    fixtureId: "clean-dog-side",
    action: "accepted_for_future_prototyping",
    createdAt: T1,
  });
  if (!review.ok) throw new Error(review.error.message);
  const prototype = deriveProfileWingPrototype({
    review: review.value,
    fixtureId: "clean-dog-side",
  });
  if (!prototype.ok) throw new Error(prototype.error.message);
  const savedProfile = saveProfileWingRevision(
    createLocalDesignLibrary({
      draftId: "unused",
      now: T1,
      legacyWorkspace: savedSpj.value,
    }),
    {
      prototype: prototype.value,
      revisionId: "profile-revision-3d",
      now: T2,
    },
  );
  if (!savedProfile.ok) throw new Error(savedProfile.error.message);
  return localDesignLibraryRevisions(savedProfile.value);
}

function mixedCourse(): CourseDraft {
  const first = placeCourseInstance(createCourseDraft(T0), {
    instanceId: "spj-instance-3d",
    obstacleDesignRevisionId: "spj-revision-3d",
    xMm: 12000,
    yMm: 10000,
    now: T1,
  });
  if (!first.ok) throw new Error(first.error.message);
  const second = placeCourseInstance(first.value, {
    instanceId: "profile-instance-3d",
    obstacleDesignRevisionId: "profile-revision-3d",
    xMm: 45000,
    yMm: 30000,
    now: T2,
  });
  if (!second.ok) throw new Error(second.error.message);
  return {
    ...second.value,
    instances: second.value.instances.map((instance) =>
      instance.instanceId === "profile-instance-3d"
        ? { ...instance, rotationDeg: 45 }
        : instance,
    ),
  };
}

describe("Course arena Three.js projection", () => {
  it("moves the camera and orbit target together with view-relative arrow keys", () => {
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3(0, 0.25, 0);
    camera.position.set(10, 12, 10);
    camera.lookAt(target);
    const originalOffset = camera.position.clone().sub(target);

    expect(moveCourseArenaCamera(camera, target, "ArrowUp")).toBe(true);
    expect(target.x).toBeCloseTo(-Math.SQRT2);
    expect(target.y).toBe(0.25);
    expect(target.z).toBeCloseTo(-Math.SQRT2);
    expect(camera.position.clone().sub(target).toArray()).toEqual(
      originalOffset.toArray(),
    );
    expect(moveCourseArenaCamera(camera, target, "Enter")).toBe(false);
  });

  it("keeps arrow-key navigation inside the arena floor bounds", () => {
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3(29.5, 0.25, 0);
    camera.position.set(29.5, 12, 10);
    camera.lookAt(target);

    expect(moveCourseArenaCamera(camera, target, "ArrowRight", 2)).toBe(true);
    expect(target.x).toBe(30);
    expect(camera.position.x).toBe(30);
    expect(moveCourseArenaCamera(camera, target, "ArrowRight", 2)).toBe(false);
    expect(target.x).toBe(30);
  });

  it("captures arrow keys even when the camera cannot move farther", () => {
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3(30, 0.25, 0);
    camera.position.set(30, 12, 10);
    camera.lookAt(target);
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      cancelable: true,
    });

    expect(captureCourseArenaNavigationKey(event, camera, target, 2)).toBe(
      true,
    );
    expect(event.defaultPrevented).toBe(true);
    expect(target.x).toBe(30);
    expect(camera.position.x).toBe(30);
  });

  it("projects mixed pinned revisions into their exact course positions and rotations", () => {
    const root = new THREE.Group();
    populateCourseArena(root, {
      course: mixedCourse(),
      revisions: mixedRevisions(),
      selectedInstanceId: "profile-instance-3d",
      warningInstanceIds: new Set(["spj-instance-3d"]),
    });

    const spj = root.getObjectByName(
      "course-obstacle-spj-instance-3d",
    ) as THREE.Group;
    const profile = root.getObjectByName(
      "course-obstacle-profile-instance-3d",
    ) as THREE.Group;
    expect(spj.userData).toMatchObject({
      instanceId: "spj-instance-3d",
      familyId: "spj-04-club-classic",
      revisionId: "spj-revision-3d",
    });
    expect(spj.position.toArray()).toEqual([-18, 0, -10]);
    expect(spj.getObjectByName("placement-highlight")).toBeDefined();
    expect(profile.userData).toMatchObject({
      instanceId: "profile-instance-3d",
      familyId: "profile-wing-vertical-v1",
      revisionId: "profile-revision-3d",
    });
    expect(profile.position.toArray()).toEqual([15, 0, 10]);
    expect(profile.rotation.y).toBeCloseTo(-Math.PI / 4);
    expect(profile.userData.geometrySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(profile.getObjectByName("placement-highlight")).toBeDefined();
    let sharedGeometryMeshFound = false;
    profile.traverse((object) => {
      if (
        object.userData.sourceGeometrySha256 === profile.userData.geometrySha256
      )
        sharedGeometryMeshFound = true;
    });
    expect(sharedGeometryMeshFound).toBe(true);

    disposeCourseArenaObject(root);
  });

  it("projects palm, leafy-tree, and flower-box scenery outside the obstacle group", () => {
    let course = createCourseDraft(T0);
    for (const kind of ["palm_tree", "leafy_tree", "flower_box"] as const) {
      const itemIndex = course.environment.scenery.length;
      const result = addCourseScenery(course, {
        sceneryId: `scenery-${itemIndex + 1}`,
        kind,
        now: T1,
      });
      if (!result.ok) throw new Error(result.error.message);
      course = result.value;
    }
    const root = new THREE.Group();
    populateCourseEnvironment(root, course.environment);

    expect(root.children).toHaveLength(3);
    expect(root.getObjectByName("course-scenery-scenery-1")).toMatchObject({
      position: expect.objectContaining({ x: -25, y: 0, z: -15 }),
      userData: { sceneryId: "scenery-1", kind: "palm_tree" },
    });
    expect(root.getObjectByName("course-scenery-scenery-2")).toBeDefined();
    expect(root.getObjectByName("course-scenery-scenery-3")).toBeDefined();
    disposeCourseArenaObject(root);
  });

  it("disposes mesh and arena-line resources together", () => {
    const root = new THREE.Group();
    const meshGeometry = new THREE.BoxGeometry();
    const meshMaterial = new THREE.MeshStandardMaterial();
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial();
    root.add(new THREE.Mesh(meshGeometry, meshMaterial));
    root.add(new THREE.LineSegments(lineGeometry, lineMaterial));
    const disposals = [
      vi.spyOn(meshGeometry, "dispose"),
      vi.spyOn(meshMaterial, "dispose"),
      vi.spyOn(lineGeometry, "dispose"),
      vi.spyOn(lineMaterial, "dispose"),
    ];

    disposeCourseArenaObject(root);

    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });
});
