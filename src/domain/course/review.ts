import {
  isProfileWingRevision,
  type LocalDesignRevision,
} from "../design/local-library";
import { stableHash } from "../design/stable-hash";
import { deriveCourseWarnings } from "./geometry";
import { aggregateCourseQuantities } from "./quantities";
import {
  COURSE_REVIEW_DISCLAIMER,
  COURSE_REVIEW_SCHEMA_VERSION,
  type CourseDraft,
  type CourseQuantitySummary,
  type CourseReviewHumanSpecification,
  type CourseReviewPlacement,
  type CourseReviewSnapshot,
  type CourseReviewWarning,
} from "./types";

export const COURSE_REVIEW_PROTOTYPE_EXCLUSIONS = [
  "No accounts, server persistence, cross-device sync, public sharing, or recovery.",
  "No automatic revision upgrades, downgrades, or revision mutation.",
  "No retail pricing, freight, tax, duty, margin, checkout, payment, or ordering.",
  "No supplier approval, production-ready export, fabrication, safety, federation, regulatory, or course-validity certification.",
] as const;

const WARNING_ORDER: Record<CourseReviewWarning["kind"], number> = {
  missing_revision: 0,
  out_of_bounds: 1,
  overlap: 2,
};

function compareText(left: string, right: string) {
  return left.localeCompare(right, "en");
}

function sortPlacements(
  placements: readonly CourseReviewPlacement[],
): CourseReviewPlacement[] {
  return [...placements].sort(
    (left, right) =>
      left.displayNumber - right.displayNumber ||
      compareText(left.instanceId, right.instanceId),
  );
}

function latestRevisionForDesign(
  revision: LocalDesignRevision,
  revisions: readonly LocalDesignRevision[],
) {
  return revisions
    .filter(
      (candidate) =>
        candidate.designId === revision.designId &&
        candidate.ordinal > revision.ordinal,
    )
    .sort(
      (left, right) =>
        right.ordinal - left.ordinal ||
        compareText(right.revisionId, left.revisionId),
    )[0];
}

function sortWarnings(
  warnings: readonly CourseReviewWarning[],
): CourseReviewWarning[] {
  return [...warnings].sort((left, right) => {
    const kindDifference = WARNING_ORDER[left.kind] - WARNING_ORDER[right.kind];
    if (kindDifference !== 0) return kindDifference;
    const leftNumbers = left.displayNumbers.join(",");
    const rightNumbers = right.displayNumbers.join(",");
    return (
      compareText(leftNumbers, rightNumbers) ||
      compareText(left.instanceIds.join(","), right.instanceIds.join(",")) ||
      compareText(left.message, right.message)
    );
  });
}

function quantityLines(quantities: CourseQuantitySummary): string[] {
  const lines = [
    `${quantities.obstacleInstances} obstacle instances`,
    `${quantities.printedWingAssemblies} wing assemblies or silhouette plates`,
    `${quantities.poles} poles`,
    `${quantities.cupsOrReleaseAdapters} cups or release adapters`,
    `${quantities.trackAssemblies} track assemblies`,
    `${quantities.footOrBallastAssemblies} foot or ballast assemblies`,
    `${quantities.flags} flags`,
    `${quantities.poleEndCaps} pole end caps`,
  ];
  for (const [kind, quantity] of Object.entries(quantities.lowerElements).sort(
    ([left], [right]) => compareText(left, right),
  )) {
    if (quantity > 0) lines.push(`${quantity} ${kind.replaceAll("_", " ")}`);
  }
  return lines;
}

function humanSpecification(
  placements: readonly CourseReviewPlacement[],
  warnings: readonly CourseReviewWarning[],
  quantities: CourseQuantitySummary,
): CourseReviewHumanSpecification {
  return {
    title: "Local course 01 · Course Review Sheet",
    arena: "60,000 × 40,000 mm prototype arena",
    placementLines: placements.map((placement) => {
      const revision = placement.pinnedRevision;
      return revision
        ? `Obstacle ${placement.displayNumber}: ${placement.xMm} × ${placement.yMm} mm at ${placement.rotationDeg}°, ${revision.name}, revision ${String(revision.ordinal).padStart(2, "0")}, ${revision.revisionId}, configuration ${revision.configurationHash}, ${revision.provenance}, ${revision.evidenceStatus.replaceAll("_", " ")}.`
        : `Obstacle ${placement.displayNumber}: ${placement.xMm} × ${placement.yMm} mm at ${placement.rotationDeg}°, missing pinned revision ${placement.obstacleDesignRevisionId}.`;
    }),
    warningLines:
      warnings.length === 0
        ? ["No overlap or boundary warnings in the current arrangement."]
        : warnings.map((warning) => warning.message),
    quantityLines: quantityLines(quantities),
    disclaimer: COURSE_REVIEW_DISCLAIMER,
  };
}

function hashableSnapshot(snapshot: Omit<CourseReviewSnapshot, "reviewHash">) {
  return {
    ...snapshot,
    placements: snapshot.placements.map(
      ({ newerRevisionAvailable, ...placement }) => {
        void newerRevisionAvailable;
        return placement;
      },
    ),
  };
}

export function buildCourseReviewSnapshot(
  draft: CourseDraft,
  revisions: readonly LocalDesignRevision[],
): CourseReviewSnapshot {
  const canonicalDraft: CourseDraft = {
    ...draft,
    instances: [...draft.instances].sort(
      (left, right) =>
        left.displayNumber - right.displayNumber ||
        compareText(left.instanceId, right.instanceId),
    ),
  };
  const revisionById = new Map(
    revisions.map((revision) => [revision.revisionId, revision]),
  );
  const displayNumberById = new Map(
    draft.instances.map((instance) => [
      instance.instanceId,
      instance.displayNumber,
    ]),
  );

  const placements = sortPlacements(
    draft.instances.map((instance): CourseReviewPlacement => {
      const revision = revisionById.get(instance.obstacleDesignRevisionId);
      const newerRevision = revision
        ? latestRevisionForDesign(revision, revisions)
        : undefined;
      return {
        instanceId: instance.instanceId,
        displayNumber: instance.displayNumber,
        xMm: instance.xMm,
        yMm: instance.yMm,
        rotationDeg: instance.rotationDeg,
        obstacleDesignRevisionId: instance.obstacleDesignRevisionId,
        pinnedRevision: revision
          ? {
              revisionId: revision.revisionId,
              designId: revision.designId,
              ordinal: revision.ordinal,
              name: revision.name,
              configurationHash: revision.configurationHash,
              familyId: isProfileWingRevision(revision)
                ? revision.familyId
                : "spj-04-club-classic",
              provenance: isProfileWingRevision(revision)
                ? "generated"
                : "configured",
              evidenceStatus: isProfileWingRevision(revision)
                ? "inferred_not_supplier_confirmed"
                : "mixed_confirmed_and_inferred",
            }
          : null,
        pinnedFootprint: revision?.snapshot.footprint ?? null,
        pinnedBillOfMaterials: revision?.snapshot.billOfMaterials ?? null,
        pinnedProductionSpec: revision?.snapshot.productionSpec ?? null,
        newerRevisionAvailable: newerRevision
          ? {
              revisionId: newerRevision.revisionId,
              ordinal: newerRevision.ordinal,
              name: newerRevision.name,
            }
          : null,
      };
    }),
  );

  const geometryWarnings = sortWarnings(
    deriveCourseWarnings(canonicalDraft, revisions).map((warning) => ({
      kind: warning.kind,
      instanceIds: [...warning.instanceIds],
      displayNumbers: warning.instanceIds
        .map((instanceId) => displayNumberById.get(instanceId) ?? 0)
        .sort((left, right) => left - right),
      message: warning.message,
    })),
  );
  const equipmentQuantities = aggregateCourseQuantities(
    canonicalDraft,
    revisions,
  );
  const missingRevisionReferences = placements
    .filter((placement) => placement.pinnedRevision === null)
    .map((placement) => ({
      instanceId: placement.instanceId,
      displayNumber: placement.displayNumber,
      obstacleDesignRevisionId: placement.obstacleDesignRevisionId,
    }));

  const snapshotWithoutHash: Omit<CourseReviewSnapshot, "reviewHash"> = {
    schemaVersion: COURSE_REVIEW_SCHEMA_VERSION,
    courseId: draft.courseId,
    courseDraftVersion: draft.draftVersion,
    arena: draft.arena,
    placements,
    geometryWarnings,
    equipmentQuantities,
    completeness:
      missingRevisionReferences.length === 0 ? "complete" : "incomplete",
    missingRevisionReferences,
    humanReadableSpecification: humanSpecification(
      placements,
      geometryWarnings,
      equipmentQuantities,
    ),
    prototypeDisclaimer: COURSE_REVIEW_DISCLAIMER,
    prototypeExclusions: COURSE_REVIEW_PROTOTYPE_EXCLUSIONS,
    hashAlgorithm: "sha256",
  };

  return {
    ...snapshotWithoutHash,
    reviewHash: stableHash(hashableSnapshot(snapshotWithoutHash)),
  };
}
