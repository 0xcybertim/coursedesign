import type {
  BillOfMaterials,
  CourseFootprint,
  LowerElement,
  ProductionSpecPreview,
} from "../product/types";
import type { ProfileWingProductionSpecPreview } from "../product/profile-wing-definition";

export const COURSE_SCHEMA_VERSION = "1.0.0-phase1c" as const;
export const COURSE_STORAGE_KEY = "course-design.local-course-1.v1" as const;
export const COURSE_REVIEW_SCHEMA_VERSION = "1.0.0-phase1d" as const;
export const COURSE_REVIEW_DISCLAIMER =
  "Browser-local non-sellable prototype. This review is not supplier-approved, safety-certified, federation-validated, suitable for fabrication, or ready for production or ordering." as const;

export interface ArenaDimensions {
  units: "mm";
  width: 60000;
  height: 40000;
  gridSize: 5000;
}

export interface CourseInstance {
  instanceId: string;
  obstacleDesignRevisionId: string;
  xMm: number;
  yMm: number;
  rotationDeg: number;
  displayNumber: number;
}

export interface CourseDraft {
  schemaVersion: typeof COURSE_SCHEMA_VERSION;
  courseId: "local-course-1";
  draftVersion: number;
  arena: ArenaDimensions;
  instances: readonly CourseInstance[];
  updatedAt: string;
}

export type CourseWarning =
  | {
      kind: "overlap";
      instanceIds: readonly [string, string];
      message: string;
    }
  | {
      kind: "out_of_bounds" | "missing_revision";
      instanceIds: readonly [string];
      message: string;
    };

export interface CourseQuantitySummary {
  obstacleInstances: number;
  printedWingAssemblies: number;
  poles: number;
  cupsOrReleaseAdapters: number;
  trackAssemblies: number;
  footOrBallastAssemblies: number;
  flags: number;
  poleEndCaps: number;
  lowerElements: Record<Exclude<LowerElement, "none">, number>;
}

export interface CourseReviewPinnedRevision {
  revisionId: string;
  designId: string;
  ordinal: number;
  name: string;
  configurationHash: string;
  familyId: "spj-04-club-classic" | "profile-wing-vertical-v1";
  provenance: "configured" | "generated";
  evidenceStatus:
    | "mixed_confirmed_and_inferred"
    | "inferred_not_supplier_confirmed";
}

export interface CourseReviewNewerRevision {
  revisionId: string;
  ordinal: number;
  name: string;
}

export interface CourseReviewPlacement {
  instanceId: string;
  displayNumber: number;
  xMm: number;
  yMm: number;
  rotationDeg: number;
  obstacleDesignRevisionId: string;
  pinnedRevision: CourseReviewPinnedRevision | null;
  pinnedFootprint: CourseFootprint | null;
  pinnedBillOfMaterials: BillOfMaterials | null;
  pinnedProductionSpec:
    | ProductionSpecPreview
    | ProfileWingProductionSpecPreview
    | null;
  newerRevisionAvailable: CourseReviewNewerRevision | null;
}

export interface CourseReviewWarning {
  kind: CourseWarning["kind"];
  instanceIds: readonly string[];
  displayNumbers: readonly number[];
  message: string;
}

export interface CourseReviewMissingRevision {
  instanceId: string;
  displayNumber: number;
  obstacleDesignRevisionId: string;
}

export interface CourseReviewHumanSpecification {
  title: "Local course 01 · Course Review Sheet";
  arena: "60,000 × 40,000 mm prototype arena";
  placementLines: readonly string[];
  warningLines: readonly string[];
  quantityLines: readonly string[];
  disclaimer: typeof COURSE_REVIEW_DISCLAIMER;
}

export interface CourseReviewSnapshot {
  schemaVersion: typeof COURSE_REVIEW_SCHEMA_VERSION;
  courseId: "local-course-1";
  courseDraftVersion: number;
  arena: ArenaDimensions;
  placements: readonly CourseReviewPlacement[];
  geometryWarnings: readonly CourseReviewWarning[];
  equipmentQuantities: CourseQuantitySummary;
  completeness: "complete" | "incomplete";
  missingRevisionReferences: readonly CourseReviewMissingRevision[];
  humanReadableSpecification: CourseReviewHumanSpecification;
  prototypeDisclaimer: typeof COURSE_REVIEW_DISCLAIMER;
  prototypeExclusions: readonly string[];
  hashAlgorithm: "sha256";
  reviewHash: string;
}

export interface CourseFailure {
  ok: false;
  error: {
    kind:
      | "invalid_course"
      | "unsupported_course_schema"
      | "invalid_instance"
      | "instance_not_found";
    message: string;
  };
}

export interface CourseSuccess<T> {
  ok: true;
  value: T;
}

export type CourseResult<T> = CourseSuccess<T> | CourseFailure;

export interface PointMm {
  x: number;
  y: number;
}
