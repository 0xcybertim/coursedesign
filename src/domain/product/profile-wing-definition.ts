import type { SilhouettePoint } from "../silhouette";
import type { BillOfMaterials, CourseFootprint, FrameColor } from "./types";

export const PROFILE_WING_C1_SCHEMA_VERSION = "1.0.0-phase1h-c1" as const;

export const PROFILE_WING_C1_DEFINITION = {
  schemaVersion: PROFILE_WING_C1_SCHEMA_VERSION,
  familyId: "profile-wing-vertical-v1",
  displayName: "Profile Wing Vertical",
  purpose: "non_sellable_generated_prototype_only",
  evidenceStatus: "inferred_not_supplier_confirmed",
  geometryMm: {
    poleSpan: 3500,
    poleDiameter: 100,
    overallHeight: 1800,
    overallDepth: 800,
    maximumProfileWidth: 1200,
    maximumProfileHeight: 1500,
    profileLowerClearance: 150,
    inferredPlateThickness: 40,
    poleCenterHeights: [650, 950, 1250, 1550],
  },
  warnings: [
    "All dimensions and support positions are deterministic prototype assumptions, not supplier geometry.",
    "The silhouette plate has not been structurally, materially, or aerodynamically validated.",
    "Generic component counts are workflow evidence only and are not production material quantities.",
  ],
} as const;

export interface ProfileWingPointMm {
  readonly x: number;
  readonly y: number;
}

export interface ProfileWingAppearance {
  readonly frameColor: FrameColor;
  readonly palette: {
    readonly wing: string;
    readonly supports: string;
    readonly polePrimary: "#0D43C7";
    readonly poleSecondary: "#F7F6F1";
    readonly hardware: "#252624";
  };
}

export interface ProfileWingInstance {
  readonly id: "left-wing" | "right-wing";
  readonly side: "left" | "right";
  readonly translateMm: readonly [number, number, number];
  readonly mirrorX: boolean;
}

export interface ProfileWingGenericQuantity {
  readonly componentKey:
    | "silhouette_wing_plate"
    | "prototype_pole"
    | "cup_or_release_adapter"
    | "prototype_track"
    | "foot_or_ballast"
    | "flag"
    | "pole_end_cap";
  readonly label: string;
  readonly quantity: number;
  readonly evidenceStatus: "inferred_not_supplier_confirmed";
}

export interface ProfileWingSharedGeometry {
  readonly coordinateSystem: {
    readonly units: "mm";
    readonly origin: "profile_horizontal_center_at_lower_clearance";
    readonly xAxis: "right";
    readonly yAxis: "up";
    readonly winding: "counterclockwise_cartesian";
  };
  readonly sourceNormalizedPolygon: readonly SilhouettePoint[];
  readonly fittedPolygonMm: readonly ProfileWingPointMm[];
  readonly fittedBoundsMm: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    readonly width: number;
    readonly height: number;
  };
  readonly inferredExtrusionDepthMm: 40;
  readonly geometrySha256: string;
}

export interface ProfileWingRenderManifest {
  readonly schemaVersion: typeof PROFILE_WING_C1_SCHEMA_VERSION;
  readonly rendererContract: "profile-wing-render-manifest-v1";
  readonly geometrySha256: string;
  readonly appearance?: ProfileWingAppearance;
  readonly sharedProfileGeometry: ProfileWingSharedGeometry;
  readonly wingInstances: readonly [ProfileWingInstance, ProfileWingInstance];
  readonly poles: readonly {
    readonly id: string;
    readonly centerHeightMm: number;
    readonly lengthMm: 3500;
    readonly diameterMm: 100;
  }[];
  readonly fixedSupports: {
    readonly tracks: readonly [
      { readonly xMm: number; readonly heightMm: 1800 },
      { readonly xMm: number; readonly heightMm: 1800 },
    ];
    readonly feet: readonly [
      { readonly xMm: number; readonly depthMm: 800 },
      { readonly xMm: number; readonly depthMm: 800 },
    ];
    readonly flags: readonly [
      { readonly xMm: number; readonly yMm: 1800 },
      { readonly xMm: number; readonly yMm: 1800 },
    ];
  };
  readonly projectionParity: {
    readonly twoDProfileGeometrySha256: string;
    readonly threeDExtrusionSourceGeometrySha256: string;
    readonly exactSharedGeometry: true;
  };
}

export interface ProfileWingAcceptanceDecision {
  readonly schemaVersion: string;
  readonly decisionId: string;
  readonly action:
    | "accepted_for_future_prototyping"
    | "retained_without_conversion";
  readonly createdAt: string;
  readonly decisionHash: string;
}

export interface DerivedProfileWingPrototype {
  readonly schemaVersion: typeof PROFILE_WING_C1_SCHEMA_VERSION;
  readonly prototypeSha256: string;
  readonly familyId: "profile-wing-vertical-v1";
  readonly displayName: "Profile Wing Vertical";
  readonly purpose: "non_sellable_generated_prototype_only";
  readonly evidenceStatus: "inferred_not_supplier_confirmed";
  readonly appearance?: ProfileWingAppearance;
  readonly source: {
    readonly fixtureId: string;
    readonly sourceMaskSha256: string;
    readonly sourcePolygonSha256: string;
    readonly resultIdentitySha256: string;
    readonly decisionHash: string;
    readonly decisionId: string;
    readonly sourceKind?:
      | "benchmark_fixture"
      | "user_upload"
      | "generated_concept";
    readonly sourceLabel?: string;
    readonly sourceContentHash?: string;
    readonly provider?: "remove-bg" | "deterministic-test";
  };
  readonly decision: ProfileWingAcceptanceDecision;
  readonly envelopeMm: {
    readonly width: 5900;
    readonly depth: 800;
    readonly height: 1800;
  };
  readonly footprint: {
    readonly units: "mm";
    readonly anchor: "midpoint_of_primary_pole_centerline";
    readonly polygon: readonly (readonly [number, number])[];
    readonly notForSurveyOrFabrication: true;
  };
  readonly genericQuantities: readonly ProfileWingGenericQuantity[];
  readonly renderManifest: ProfileWingRenderManifest;
  readonly warnings: readonly string[];
  readonly notForProduction: true;
  readonly notForOrdering: true;
}

export interface ProfileWingProductionSpecPreview {
  readonly schemaVersion: typeof PROFILE_WING_C1_SCHEMA_VERSION;
  readonly configurationHash: string;
  readonly evidenceStatus: "inferred_not_supplier_confirmed";
  readonly humanReadable: readonly string[];
  readonly machineReadable: {
    readonly documentStatus: "generated_prototype_not_for_production";
    readonly familyId: "profile-wing-vertical-v1";
    readonly sourceFixtureId: string;
    readonly sourcePolygonSha256: string;
    readonly geometrySha256: string;
    readonly prototypeAssumptions: {
      readonly envelopeMm: {
        readonly width: 5900;
        readonly depth: 800;
        readonly height: 1800;
      };
      readonly inferredPlateThicknessMm: 40;
    };
    readonly missingSupplierConfirmation: readonly string[];
  };
  readonly notForProduction: true;
}

export interface ProfileWingRevisionSnapshot {
  readonly kind: "profile-wing-generated";
  readonly prototype: DerivedProfileWingPrototype;
  readonly footprint: CourseFootprint;
  readonly billOfMaterials: BillOfMaterials;
  readonly productionSpec: ProfileWingProductionSpecPreview;
  readonly renderManifest: ProfileWingRenderManifest;
  readonly provenance: {
    readonly classification: "generated";
    readonly evidenceStatus: "inferred_not_supplier_confirmed";
    readonly sourceFixtureId: string;
    readonly sourceDecisionHash: string;
    readonly sourcePolygonSha256: string;
    readonly sourceKind?:
      | "benchmark_fixture"
      | "user_upload"
      | "generated_concept";
    readonly sourceLabel?: string;
    readonly sourceContentHash?: string;
    readonly provider?: "remove-bg" | "deterministic-test";
  };
}

export type ProfileWingDerivationFailureKind =
  | "malformed_input"
  | "invalid_review_decision"
  | "decision_does_not_accept"
  | "invalid_source_geometry";

export type ProfileWingDerivationResult =
  | { readonly ok: true; readonly value: DerivedProfileWingPrototype }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: ProfileWingDerivationFailureKind;
        readonly message: string;
      };
    };
