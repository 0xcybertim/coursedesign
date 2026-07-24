import type { CourseDraft } from "../course";
import type { LocalDesignLibrary } from "../design";
import type { LocalConceptWorkspace } from "../generation";
import type { LocalProfileWingCreationWorkspace } from "../profile-wing-creation";

export type WorkspaceSourceStatus =
  | "ready"
  | "empty"
  | "invalid"
  | "unavailable";

export interface WorkspaceSourceState<T> {
  readonly status: WorkspaceSourceStatus;
  readonly value: T | null;
  readonly error: string | null;
}

export interface WorkspaceSources {
  readonly designLibrary: WorkspaceSourceState<LocalDesignLibrary>;
  readonly concepts: WorkspaceSourceState<LocalConceptWorkspace>;
  readonly profileCreation: WorkspaceSourceState<LocalProfileWingCreationWorkspace>;
  readonly course: WorkspaceSourceState<CourseDraft>;
}

export interface DesignSummary {
  readonly designId: string;
  readonly family: "spj-04" | "profile-wing";
  readonly displayName: string;
  readonly revisionCount: number;
  readonly latestRevisionId: string | null;
  readonly latestOrdinal: number | null;
  readonly latestCreatedAt: string | null;
  readonly evidenceStatus: "configured" | "generated_inferred";
}

export interface CourseSummary {
  readonly courseId: "local-course-1";
  readonly placementCount: number;
  readonly updatedAt: string | null;
  readonly warningCount: number;
  readonly unavailableRevisionCount: number;
}

export interface ResumeItem {
  readonly id: string;
  readonly kind:
    | "spj-draft"
    | "concept-workspace"
    | "profile-creation"
    | "course";
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly updatedAt: string | null;
  readonly status: "ready" | "needs-attention";
}

export interface WorkspaceSourceError {
  readonly source:
    | "design-library"
    | "concept-history"
    | "profile-creation"
    | "course";
  readonly message: string;
  readonly href: string;
}

export interface WorkspaceSummary {
  readonly designs: readonly DesignSummary[];
  readonly recentDesigns: readonly DesignSummary[];
  readonly course: CourseSummary;
  readonly resumeItems: readonly ResumeItem[];
  readonly sourceErrors: readonly WorkspaceSourceError[];
}
