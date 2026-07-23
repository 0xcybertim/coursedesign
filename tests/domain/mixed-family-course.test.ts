import { describe, expect, it } from "vitest";
import {
  aggregateCourseQuantities,
  buildCourseRevisionUpdatePreview,
  buildCourseReviewSnapshot,
  createCourseDraft,
  deriveCourseWarnings,
  placeCourseInstance,
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

const T0 = "2026-07-23T09:00:00.000Z";
const T1 = "2026-07-23T09:01:00.000Z";
const T2 = "2026-07-23T09:02:00.000Z";

function mixedRevisions() {
  const spj = saveLocalRevision(
    createLocalDesignWorkspace({ draftId: "mixed-draft", now: T0 }),
    { revisionId: "spj-revision-1", now: T1 },
  );
  if (!spj.ok) throw new Error(spj.error.message);
  let library = createLocalDesignLibrary({
    draftId: "unused",
    now: T1,
    legacyWorkspace: spj.value,
  });
  const review = appendSilhouetteDecision(createEmptySilhouetteReview(), {
    decisionId: "mixed-profile-decision",
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
  const saved = saveProfileWingRevision(library, {
    prototype: prototype.value,
    revisionId: "profile-revision-1",
    now: T2,
  });
  if (!saved.ok) throw new Error(saved.error.message);
  library = saved.value;
  return localDesignLibraryRevisions(library);
}

function mixedCourse() {
  let course = createCourseDraft(T0);
  const first = placeCourseInstance(course, {
    instanceId: "spj-instance",
    obstacleDesignRevisionId: "spj-revision-1",
    xMm: 12000,
    yMm: 12000,
    now: T1,
  });
  if (!first.ok) throw new Error(first.error.message);
  course = first.value;
  const second = placeCourseInstance(course, {
    instanceId: "profile-instance",
    obstacleDesignRevisionId: "profile-revision-1",
    xMm: 44000,
    yMm: 28000,
    now: T2,
  });
  if (!second.ok) throw new Error(second.error.message);
  return second.value;
}

describe("Phase 1H mixed-family course projections", () => {
  it("aggregates quantities only from each exact pinned revision", () => {
    expect(aggregateCourseQuantities(mixedCourse(), mixedRevisions())).toEqual({
      obstacleInstances: 2,
      printedWingAssemblies: 4,
      poles: 8,
      cupsOrReleaseAdapters: 16,
      trackAssemblies: 4,
      footOrBallastAssemblies: 4,
      flags: 4,
      poleEndCaps: 16,
      lowerElements: { decorative_panel: 0, gate: 0, filler: 0 },
    });
  });

  it("uses the 5,100 and 5,900 mm pinned footprints independently", () => {
    const revisions = mixedRevisions();
    const review = buildCourseReviewSnapshot(mixedCourse(), revisions);
    expect(
      review.placements.map((item) => item.pinnedFootprint?.width),
    ).toEqual([5100, 5900]);
    expect(deriveCourseWarnings(mixedCourse(), revisions)).toEqual([]);
  });

  it("surfaces configured versus generated non-supplier provenance", () => {
    const review = buildCourseReviewSnapshot(mixedCourse(), mixedRevisions());
    expect(
      review.placements.map((item) => ({
        familyId: item.pinnedRevision?.familyId,
        provenance: item.pinnedRevision?.provenance,
        evidenceStatus: item.pinnedRevision?.evidenceStatus,
      })),
    ).toEqual([
      {
        familyId: "spj-04-club-classic",
        provenance: "configured",
        evidenceStatus: "mixed_confirmed_and_inferred",
      },
      {
        familyId: "profile-wing-vertical-v1",
        provenance: "generated",
        evidenceStatus: "inferred_not_supplier_confirmed",
      },
    ]);
    expect(review.humanReadableSpecification.placementLines[1]).toContain(
      "generated, inferred not supplier confirmed",
    );
  });

  it("never allows update-one or replace-all across designs", () => {
    expect(
      buildCourseRevisionUpdatePreview(mixedCourse(), mixedRevisions(), {
        kind: "update_one",
        instanceId: "spj-instance",
        sourceRevisionId: "spj-revision-1",
        destinationRevisionId: "profile-revision-1",
      }),
    ).toMatchObject({ ok: false, error: { kind: "incompatible_design" } });
    expect(
      buildCourseRevisionUpdatePreview(mixedCourse(), mixedRevisions(), {
        kind: "replace_all_from_revision",
        sourceRevisionId: "spj-revision-1",
        destinationRevisionId: "profile-revision-1",
      }),
    ).toMatchObject({ ok: false, error: { kind: "incompatible_design" } });
  });
});
