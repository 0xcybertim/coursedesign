import type { LocalDesignRevision } from "../design/local-library";
import { parseCourseDraft, serializeCourseDraft } from "./course-draft";
import { buildCourseReviewSnapshot } from "./review";
import type {
  CourseDraft,
  CourseQuantitySummary,
  CourseReviewSnapshot,
  CourseReviewWarning,
} from "./types";

export type CourseRevisionUpdateOperation =
  | {
      readonly kind: "update_one";
      readonly instanceId: string;
      readonly sourceRevisionId: string;
      readonly destinationRevisionId: string;
    }
  | {
      readonly kind: "replace_all_from_revision";
      readonly sourceRevisionId: string;
      readonly destinationRevisionId: string;
    };

export type CourseRevisionUpdateFailureKind =
  | "missing_course_instance"
  | "missing_source_revision"
  | "missing_destination_revision"
  | "incompatible_design"
  | "destination_not_newer"
  | "no_matching_placements"
  | "stale_course_precondition"
  | "invalid_resulting_course"
  | "storage_unavailable";

export interface CourseRevisionUpdateFailure {
  readonly ok: false;
  readonly error: {
    readonly kind: CourseRevisionUpdateFailureKind;
    readonly message: string;
  };
}

export interface CourseRevisionUpdateSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export type CourseRevisionUpdateResult<T> =
  | CourseRevisionUpdateSuccess<T>
  | CourseRevisionUpdateFailure;

export interface CourseRevisionUpdateReference {
  readonly revisionId: string;
  readonly designId: string;
  readonly ordinal: number;
  readonly name: string;
  readonly configurationHash: string;
}

export interface CourseRevisionAffectedPlacement {
  readonly instanceId: string;
  readonly displayNumber: number;
  readonly beforePinnedRevisionId: string;
  readonly afterPinnedRevisionId: string;
}

export interface CourseQuantityDelta {
  readonly obstacleInstances: number;
  readonly printedWingAssemblies: number;
  readonly poles: number;
  readonly cupsOrReleaseAdapters: number;
  readonly trackAssemblies: number;
  readonly footOrBallastAssemblies: number;
  readonly flags: number;
  readonly poleEndCaps: number;
  readonly lowerElements: {
    readonly decorative_panel: number;
    readonly gate: number;
    readonly filler: number;
  };
}

export interface CourseRevisionUpdatePreview {
  readonly operation: CourseRevisionUpdateOperation;
  readonly sourceRevision: CourseRevisionUpdateReference;
  readonly destinationRevision: CourseRevisionUpdateReference;
  readonly affectedPlacements: readonly CourseRevisionAffectedPlacement[];
  readonly affectedDisplayNumbers: readonly number[];
  readonly instanceCount: number;
  readonly quantities: {
    readonly before: CourseQuantitySummary;
    readonly after: CourseQuantitySummary;
    readonly delta: CourseQuantityDelta;
  };
  readonly geometryWarnings: {
    readonly before: readonly CourseReviewWarning[];
    readonly after: readonly CourseReviewWarning[];
  };
  readonly currentReviewHash: string;
  readonly proposedReviewHash: string;
  readonly proposedCourseDraftVersion: number;
  readonly precondition: {
    readonly courseId: CourseDraft["courseId"];
    readonly courseDraftVersion: number;
    readonly courseUpdatedAt: string;
    readonly currentReviewHash: string;
    readonly sourceRevisionConfigurationHash: string;
    readonly destinationRevisionConfigurationHash: string;
    readonly affectedPlacements: readonly CourseRevisionAffectedPlacement[];
  };
}

export interface CourseRevisionUpdateConfirmation {
  readonly courseDraft: CourseDraft;
  readonly review: CourseReviewSnapshot;
}

function failure(
  kind: CourseRevisionUpdateFailureKind,
  message: string,
): CourseRevisionUpdateFailure {
  return { ok: false, error: { kind, message } };
}

function compareAffectedPlacement(
  left: CourseRevisionAffectedPlacement,
  right: CourseRevisionAffectedPlacement,
) {
  return (
    left.displayNumber - right.displayNumber ||
    left.instanceId.localeCompare(right.instanceId, "en")
  );
}

function revisionReference(
  revision: LocalDesignRevision,
): CourseRevisionUpdateReference {
  return {
    revisionId: revision.revisionId,
    designId: revision.designId,
    ordinal: revision.ordinal,
    name: revision.name,
    configurationHash: revision.configurationHash,
  };
}

function quantityDelta(
  before: CourseQuantitySummary,
  after: CourseQuantitySummary,
): CourseQuantityDelta {
  return {
    obstacleInstances: after.obstacleInstances - before.obstacleInstances,
    printedWingAssemblies:
      after.printedWingAssemblies - before.printedWingAssemblies,
    poles: after.poles - before.poles,
    cupsOrReleaseAdapters:
      after.cupsOrReleaseAdapters - before.cupsOrReleaseAdapters,
    trackAssemblies: after.trackAssemblies - before.trackAssemblies,
    footOrBallastAssemblies:
      after.footOrBallastAssemblies - before.footOrBallastAssemblies,
    flags: after.flags - before.flags,
    poleEndCaps: after.poleEndCaps - before.poleEndCaps,
    lowerElements: {
      decorative_panel:
        after.lowerElements.decorative_panel -
        before.lowerElements.decorative_panel,
      gate: after.lowerElements.gate - before.lowerElements.gate,
      filler: after.lowerElements.filler - before.lowerElements.filler,
    },
  };
}

function findRevisions(
  operation: CourseRevisionUpdateOperation,
  revisions: readonly LocalDesignRevision[],
): CourseRevisionUpdateResult<{
  source: LocalDesignRevision;
  destination: LocalDesignRevision;
}> {
  const source = revisions.find(
    (revision) => revision.revisionId === operation.sourceRevisionId,
  );
  if (!source) {
    return failure(
      "missing_source_revision",
      `Source revision ${operation.sourceRevisionId} is unavailable. Nothing was changed.`,
    );
  }
  const destination = revisions.find(
    (revision) => revision.revisionId === operation.destinationRevisionId,
  );
  if (!destination) {
    return failure(
      "missing_destination_revision",
      `Destination revision ${operation.destinationRevisionId} is unavailable. Nothing was changed.`,
    );
  }
  if (source.designId !== destination.designId) {
    return failure(
      "incompatible_design",
      "The source and destination revisions belong to different obstacle designs. Nothing was changed.",
    );
  }
  if (destination.ordinal <= source.ordinal) {
    return failure(
      "destination_not_newer",
      "The destination must be a newer immutable revision. Downgrades are not available.",
    );
  }
  return { ok: true, value: { source, destination } };
}

function affectedPlacements(
  draft: CourseDraft,
  operation: CourseRevisionUpdateOperation,
): CourseRevisionUpdateResult<readonly CourseRevisionAffectedPlacement[]> {
  if (operation.kind === "update_one") {
    const instance = draft.instances.find(
      (candidate) => candidate.instanceId === operation.instanceId,
    );
    if (!instance) {
      return failure(
        "missing_course_instance",
        "That course placement no longer exists. Nothing was changed.",
      );
    }
    if (instance.obstacleDesignRevisionId !== operation.sourceRevisionId) {
      return failure(
        "stale_course_precondition",
        "That placement no longer uses the previewed source revision. Refresh the preview before confirming.",
      );
    }
    return {
      ok: true,
      value: [
        {
          instanceId: instance.instanceId,
          displayNumber: instance.displayNumber,
          beforePinnedRevisionId: operation.sourceRevisionId,
          afterPinnedRevisionId: operation.destinationRevisionId,
        },
      ],
    };
  }

  const matches = draft.instances
    .filter(
      (instance) =>
        instance.obstacleDesignRevisionId === operation.sourceRevisionId,
    )
    .map((instance) => ({
      instanceId: instance.instanceId,
      displayNumber: instance.displayNumber,
      beforePinnedRevisionId: operation.sourceRevisionId,
      afterPinnedRevisionId: operation.destinationRevisionId,
    }))
    .sort(compareAffectedPlacement);
  if (matches.length === 0) {
    return failure(
      "no_matching_placements",
      `No course placements are pinned to ${operation.sourceRevisionId}. Nothing was changed.`,
    );
  }
  return { ok: true, value: matches };
}

function replacementDraft(
  draft: CourseDraft,
  affected: readonly CourseRevisionAffectedPlacement[],
  updatedAt: string,
): CourseRevisionUpdateResult<CourseDraft> {
  const affectedById = new Map(
    affected.map((placement) => [placement.instanceId, placement]),
  );
  const nextDraft: CourseDraft = {
    ...draft,
    draftVersion: draft.draftVersion + 1,
    updatedAt,
    instances: draft.instances.map((instance) => {
      const replacement = affectedById.get(instance.instanceId);
      return replacement
        ? {
            ...instance,
            obstacleDesignRevisionId: replacement.afterPinnedRevisionId,
          }
        : instance;
    }),
  };
  const validated = parseCourseDraft(serializeCourseDraft(nextDraft));
  if (!validated.ok) {
    return failure(
      "invalid_resulting_course",
      `The complete replacement course failed validation: ${validated.error.message}`,
    );
  }
  return { ok: true, value: validated.value };
}

function sameAffectedPlacements(
  current: readonly CourseRevisionAffectedPlacement[],
  expected: readonly CourseRevisionAffectedPlacement[],
) {
  if (current.length !== expected.length) return false;
  return current.every((placement, index) => {
    const candidate = expected[index];
    return (
      candidate !== undefined &&
      placement.instanceId === candidate.instanceId &&
      placement.displayNumber === candidate.displayNumber &&
      placement.beforePinnedRevisionId === candidate.beforePinnedRevisionId &&
      placement.afterPinnedRevisionId === candidate.afterPinnedRevisionId
    );
  });
}

export function buildCourseRevisionUpdatePreview(
  draft: CourseDraft,
  revisions: readonly LocalDesignRevision[],
  operation: CourseRevisionUpdateOperation,
): CourseRevisionUpdateResult<CourseRevisionUpdatePreview> {
  const foundRevisions = findRevisions(operation, revisions);
  if (!foundRevisions.ok) return foundRevisions;
  const affected = affectedPlacements(draft, operation);
  if (!affected.ok) return affected;
  const proposedDraft = replacementDraft(
    draft,
    affected.value,
    draft.updatedAt,
  );
  if (!proposedDraft.ok) return proposedDraft;

  const currentReview = buildCourseReviewSnapshot(draft, revisions);
  const proposedReview = buildCourseReviewSnapshot(
    proposedDraft.value,
    revisions,
  );
  const sourceRevision = revisionReference(foundRevisions.value.source);
  const destinationRevision = revisionReference(
    foundRevisions.value.destination,
  );

  return {
    ok: true,
    value: {
      operation,
      sourceRevision,
      destinationRevision,
      affectedPlacements: affected.value,
      affectedDisplayNumbers: affected.value.map(
        (placement) => placement.displayNumber,
      ),
      instanceCount: affected.value.length,
      quantities: {
        before: currentReview.equipmentQuantities,
        after: proposedReview.equipmentQuantities,
        delta: quantityDelta(
          currentReview.equipmentQuantities,
          proposedReview.equipmentQuantities,
        ),
      },
      geometryWarnings: {
        before: currentReview.geometryWarnings,
        after: proposedReview.geometryWarnings,
      },
      currentReviewHash: currentReview.reviewHash,
      proposedReviewHash: proposedReview.reviewHash,
      proposedCourseDraftVersion: proposedDraft.value.draftVersion,
      precondition: {
        courseId: draft.courseId,
        courseDraftVersion: draft.draftVersion,
        courseUpdatedAt: draft.updatedAt,
        currentReviewHash: currentReview.reviewHash,
        sourceRevisionConfigurationHash: sourceRevision.configurationHash,
        destinationRevisionConfigurationHash:
          destinationRevision.configurationHash,
        affectedPlacements: affected.value,
      },
    },
  };
}

export function confirmCourseRevisionUpdate(
  currentDraft: CourseDraft,
  currentRevisions: readonly LocalDesignRevision[],
  preview: CourseRevisionUpdatePreview,
  now: string,
): CourseRevisionUpdateResult<CourseRevisionUpdateConfirmation> {
  const foundRevisions = findRevisions(preview.operation, currentRevisions);
  if (!foundRevisions.ok) return foundRevisions;
  if (
    foundRevisions.value.source.configurationHash !==
      preview.precondition.sourceRevisionConfigurationHash ||
    foundRevisions.value.destination.configurationHash !==
      preview.precondition.destinationRevisionConfigurationHash
  ) {
    return failure(
      "stale_course_precondition",
      "A previewed revision changed in browser storage. Refresh the preview before confirming.",
    );
  }

  const currentReview = buildCourseReviewSnapshot(
    currentDraft,
    currentRevisions,
  );
  if (
    currentDraft.courseId !== preview.precondition.courseId ||
    currentDraft.draftVersion !== preview.precondition.courseDraftVersion ||
    currentDraft.updatedAt !== preview.precondition.courseUpdatedAt ||
    currentReview.reviewHash !== preview.precondition.currentReviewHash
  ) {
    return failure(
      "stale_course_precondition",
      "The browser-local course changed after this preview opened. Nothing was written; refresh the preview before confirming.",
    );
  }

  const currentAffected = affectedPlacements(currentDraft, preview.operation);
  if (
    !currentAffected.ok ||
    !sameAffectedPlacements(
      currentAffected.value,
      preview.precondition.affectedPlacements,
    )
  ) {
    return failure(
      "stale_course_precondition",
      "The exact target placements no longer match this preview. Nothing was written; refresh the preview before confirming.",
    );
  }

  const nextDraft = replacementDraft(
    currentDraft,
    preview.precondition.affectedPlacements,
    now,
  );
  if (!nextDraft.ok) return nextDraft;
  const nextReview = buildCourseReviewSnapshot(
    nextDraft.value,
    currentRevisions,
  );
  if (nextReview.reviewHash !== preview.proposedReviewHash) {
    return failure(
      "stale_course_precondition",
      "The proposed review no longer matches this preview. Nothing was written; refresh the preview before confirming.",
    );
  }

  return {
    ok: true,
    value: { courseDraft: nextDraft.value, review: nextReview },
  };
}
