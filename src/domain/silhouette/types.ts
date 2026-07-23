export const SILHOUETTE_NORMALIZED_SIZE = 10_000 as const;
export const SILHOUETTE_VECTORIZER_VERSION = "1.0.0-phase1h-b1" as const;
export const SILHOUETTE_VALIDATOR_VERSION = "1.0.0-phase1h-b1" as const;
export const SILHOUETTE_PROTOTYPE_FIT_VERSION =
  "1.1.0-profile-wing-creator-aspect-preserving-auto-fit" as const;

export interface RasterMaskInput {
  readonly width: number;
  readonly height: number;
  readonly values: Uint8Array;
  readonly sourceMaskSha256: string;
}

export interface SilhouettePoint {
  readonly x: number;
  readonly y: number;
}

export type SilhouetteFindingCode =
  | "empty_mask"
  | "multiple_significant_subjects"
  | "holes_not_supported"
  | "contour_trace_failed"
  | "too_few_vertices"
  | "too_many_vertices"
  | "area_below_minimum"
  | "area_above_maximum"
  | "feature_core_too_thin"
  | "outside_prototype_envelope"
  | "reserved_region_overlap"
  | "self_intersection"
  | "invalid_winding";

export interface SilhouetteFinding {
  readonly code: SilhouetteFindingCode;
  readonly message: string;
}

export interface SilhouetteCleanupEvidence {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly binaryThreshold: number;
  readonly removedIslandCount: number;
  readonly removedIslandPixels: number;
  readonly significantComponentCount: number;
  readonly retainedForegroundPixels: number;
  readonly retainedForegroundFraction: number;
  readonly enclosedHoleCount: number;
  readonly maximumCoreRadiusPixels: number;
}

export interface SilhouettePrototypeFitEvidence {
  readonly mode: "auto-fit";
  readonly version: typeof SILHOUETTE_PROTOTYPE_FIT_VERSION;
  readonly triggerFindingCodes: readonly SilhouetteFindingCode[];
  readonly scalePartsPerMillion: number;
  readonly sourceBounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly fittedBounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export interface WingSilhouette {
  readonly schemaVersion: "1.0.0-phase1h-b1-wing-silhouette";
  readonly coordinateSystem: {
    readonly width: typeof SILHOUETTE_NORMALIZED_SIZE;
    readonly height: typeof SILHOUETTE_NORMALIZED_SIZE;
    readonly origin: "top-left";
    readonly winding: "clockwise-screen-coordinates";
  };
  readonly points: readonly SilhouettePoint[];
  readonly polygonSha256: string;
  readonly sourceMaskSha256: string;
  readonly vectorizerVersion: typeof SILHOUETTE_VECTORIZER_VERSION;
  readonly validatorVersion: typeof SILHOUETTE_VALIDATOR_VERSION;
  readonly cleanup: SilhouetteCleanupEvidence;
  readonly prototypeFit?: SilhouettePrototypeFitEvidence;
  readonly validationFindings: readonly [];
}

export type SilhouetteVectorizationResult =
  | {
      readonly status: "accepted";
      readonly silhouette: WingSilhouette;
      readonly findings: readonly [];
    }
  | {
      readonly status: "rejected";
      readonly silhouette: null;
      readonly findings: readonly SilhouetteFinding[];
      readonly cleanup: SilhouetteCleanupEvidence;
    };
