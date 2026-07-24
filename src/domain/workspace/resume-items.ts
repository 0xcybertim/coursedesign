import {
  currentProfileWingCreationDecision,
  type LocalProfileWingCreationWorkspace,
} from "../profile-wing-creation";
import type { LocalDesignLibrary } from "../design";
import type { LocalConceptWorkspace } from "../generation";
import type { CourseDraft } from "../course";
import type { ResumeItem } from "./types";

const KIND_ORDER: Record<ResumeItem["kind"], number> = {
  "spj-draft": 0,
  "concept-workspace": 1,
  "profile-creation": 2,
  course: 3,
};

function time(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortResumeItems(items: readonly ResumeItem[]) {
  return [...items].sort((left, right) => {
    const leftTime = time(left.updatedAt);
    const rightTime = time(right.updatedAt);
    if (leftTime !== null || rightTime !== null) {
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      if (leftTime !== rightTime) return rightTime - leftTime;
    }
    return KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
  });
}

export function deriveResumeItems(input: {
  readonly designLibrary: LocalDesignLibrary | null;
  readonly concepts: LocalConceptWorkspace | null;
  readonly profileCreation: LocalProfileWingCreationWorkspace | null;
  readonly course: CourseDraft | null;
}): readonly ResumeItem[] {
  const items: ResumeItem[] = [];
  const { designLibrary, concepts, profileCreation, course } = input;

  if (designLibrary) {
    const draft = designLibrary.spj04Workspace.draft;
    items.push({
      id: `spj-draft:${draft.draftId}`,
      kind: "spj-draft",
      title: "SPJ-04 working draft",
      detail: draft.basedOnRevisionId
        ? "Continue a draft based on a saved revision."
        : "Continue controlled options and artwork.",
      href: "/designs/local-spj-04/edit",
      updatedAt: draft.updatedAt,
      status: "ready",
    });
  }

  if (
    concepts &&
    (concepts.requests.length > 0 ||
      concepts.batches.length > 0 ||
      concepts.selectedConceptId !== null ||
      concepts.acceptedConceptId !== null)
  ) {
    const accepted = concepts.concepts.find(
      (concept) => concept.conceptId === concepts.acceptedConceptId,
    );
    const consumed =
      accepted !== undefined &&
      profileCreation?.candidates.some(
        (candidate) =>
          candidate.source.sourceKind === "generated_concept" &&
          candidate.source.contentHash === accepted.contentHash,
      );
    items.push({
      id: "concept-workspace",
      kind: "concept-workspace",
      title: "Custom Profile Wing concept",
      detail: accepted
        ? consumed
          ? "Accepted concept prepared for Profile Wing creation."
          : "Accepted concept is ready to continue."
        : concepts.selectedConceptId
          ? "A concept is selected for review."
          : "Continue the latest concept batch.",
      href: "/designs/local-spj-04/edit?wing=description",
      updatedAt: concepts.updatedAt,
      status: "ready",
    });
  }

  if (profileCreation?.currentCandidateId) {
    const candidate = profileCreation.candidates.find(
      (item) => item.candidateId === profileCreation.currentCandidateId,
    );
    const decision = candidate
      ? currentProfileWingCreationDecision(
          profileCreation,
          candidate.candidateId,
        )
      : null;
    const exactSaved = candidate
      ? designLibrary?.profileWingRevisions.some(
          (revision) =>
            revision.snapshot.provenance.sourceContentHash ===
              candidate.source.contentHash &&
            revision.snapshot.provenance.sourceDecisionHash ===
              decision?.decisionHash,
        )
      : false;
    if (!exactSaved) {
      items.push({
        id: `profile-creation:${profileCreation.currentCandidateId}`,
        kind: "profile-creation",
        title: "Custom Profile Wing",
        detail:
          decision?.action === "retained_without_conversion"
            ? "Result retained without conversion."
            : decision?.action === "accepted_for_future_prototyping"
              ? "Accepted prototype is ready to save."
              : "Inspect the current silhouette result.",
        href: "/designs/local-spj-04/edit?wing=image",
        updatedAt: profileCreation.updatedAt,
        status:
          decision?.action === "retained_without_conversion"
            ? "needs-attention"
            : "ready",
      });
    }
  }

  if (course && course.instances.length > 0) {
    items.push({
      id: `course:${course.courseId}`,
      kind: "course",
      title: "Local Course 01",
      detail: `${course.instances.length} ${
        course.instances.length === 1 ? "placement" : "placements"
      } ready to continue.`,
      href: "/courses/local-course-1",
      updatedAt: course.updatedAt,
      status: "ready",
    });
  }

  return sortResumeItems(items);
}
