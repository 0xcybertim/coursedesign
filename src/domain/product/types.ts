import type { ArtworkConfiguration, ArtworkPlacement } from "../artwork/types";

export const DOMAIN_SCHEMA_VERSION = "1.0.0-phase1a" as const;

export type EvidenceStatus =
  | "confirmed_current"
  | "confirmed_but_historical"
  | "conflicting"
  | "inferred"
  | "missing_supplier_confirmation";

export type FrameColor = "white" | "blue" | "red" | "yellow";
export type LowerElement = "none" | "decorative_panel" | "gate" | "filler";
export type PoleTreatment = "two_color_alternating_segments";
export type ArtworkSelection = "fixed_panel_artwork" | "custom_artwork";

export interface ObstacleIntent {
  schemaVersion?: string;
  frameColor?: FrameColor | string;
  poleTreatment?: PoleTreatment | string;
  lowerElement?: LowerElement | string;
  artwork?: ArtworkSelection | string;
  artworkConfiguration?: ArtworkConfiguration | unknown;
}

export interface ValidatedConfiguration {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  configurationId: "spj-04-phase1a";
  supplierProductId: "SPJ-04";
  presetName: "Club Classic";
  purpose: "non_sellable_prototype_only";
  evidenceStatus: "inferred";
  frameColor: FrameColor;
  poleTreatment: PoleTreatment;
  poleColors: readonly ["blue", "white"];
  lowerElement: LowerElement;
  artwork: ArtworkSelection;
  artworkMapping: "same_artwork_on_both_wings" | "independent_artwork_on_wings";
  artworkConfiguration?: ArtworkConfiguration;
}

export interface ValidationIssue {
  field:
    | "intent"
    | "schemaVersion"
    | "frameColor"
    | "poleTreatment"
    | "lowerElement"
    | "artwork"
    | "artworkConfiguration";
  code:
    | "malformed_intent"
    | "malformed_value"
    | "unknown_value"
    | "unsupported_schema";
  message: string;
  received?: unknown;
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationFailure {
  ok: false;
  error: {
    kind: "validation_failure";
    schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
    issues: ValidationIssue[];
  };
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface CompatibilityResult {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  configurationHash: string;
  compatible: true;
  evidenceStatus: "inferred";
  rules: readonly string[];
  warnings: readonly string[];
}

export interface BillOfMaterialsLine {
  componentKey:
    | "printed_wing_assembly"
    | "silhouette_wing_plate"
    | "aluminum_jump_pole"
    | "prototype_pole"
    | "cup_or_release_adapter"
    | "keyhole_track_assembly"
    | "prototype_track"
    | "foot_or_ballast_assembly"
    | "flag"
    | "pole_end_cap"
    | "lower_element";
  label: string;
  quantity: number;
  evidenceStatus: "inferred";
  selection?: LowerElement;
}

export interface BillOfMaterials {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  configurationHash: string;
  evidenceStatus: "inferred";
  lines: readonly BillOfMaterialsLine[];
  notForOrdering: true;
}

export interface PrototypePriceState {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  configurationHash: string;
  classification: "supplier_cost_example";
  amount: 9000;
  currency: "CNY";
  label: "Prototype supplier example · CNY 9,000 · excludes tax, freight and retail markup";
  evidenceStatus: "confirmed_current";
  provisional: true;
  customerRetailPrice: null;
  unknownSurcharges: readonly string[];
}

export interface CourseFootprint {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  configurationHash: string;
  units: "mm";
  width: 5100 | 5900;
  depth: 800;
  anchor: {
    x: 0;
    y: 0;
    definition: "midpoint_of_primary_pole_centerline";
  };
  polygon: readonly (readonly [number, number])[];
  evidenceStatus: "inferred";
  notForSurveyOrFabrication: true;
}

export interface RenderComponent {
  id: string;
  kind:
    | "wing"
    | "pole"
    | "cup"
    | "track"
    | "foot"
    | "flag"
    | "cap"
    | "lower_element";
  quantity: number;
  color?: string;
  material?: string;
  meshPattern?: string;
}

export interface RenderManifest {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  configurationHash: string;
  rendererContract: "spj-04-render-manifest-v1";
  assetRevision: "prototype-v1";
  glbUrl: "/prototype-assets/spj-04-prototype-v1.glb";
  artworkMapping: "same_artwork_on_both_wings" | "independent_artwork_on_wings";
  artworkSlots: {
    left: RenderArtworkSlot;
    right: RenderArtworkSlot;
  };
  geometryMm: {
    overallWidth: 5100;
    overallDepth: 800;
    overallHeight: 1800;
    poleLength: 3500;
    poleDiameter: 100;
    wingFaceWidth: 800;
    wingFaceHeight: 1800;
  };
  palette: {
    frame: string;
    polePrimary: "#0D43C7";
    poleSecondary: "#F7F6F1";
    hardware: "#0B0B0B";
    panel: "#09245C";
  };
  lowerElement: LowerElement;
  components: readonly RenderComponent[];
}

export interface RenderArtworkSlot {
  side: "left" | "right";
  source: "built_in" | "content_addressed";
  assetId: string;
  sourceContentHash: string;
  renderContentHash: string;
  builtInUrl: "/prototype-assets/panel-artwork.png" | null;
  placement: ArtworkPlacement;
}

export interface MachineProductionSpec {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  configurationHash: string;
  documentStatus: "prototype_preview_not_for_production";
  supplierConfirmed: {
    supplierProductId: "SPJ-04";
    frameMaterial: "aluminum alloy";
    jumpPoleCount: 4;
    supplierCostEvidence: { amount: 9000; currency: "CNY" };
  };
  prototypeAssumptions: {
    evidenceStatus: "inferred";
    configuration: ValidatedConfiguration;
    footprintMm: { width: 5100; depth: 800 };
    artwork: {
      placement: "fixed_slot_on_each_wing_panel";
      mapping: "same_artwork_on_both_wings" | "independent_artwork_on_wings";
      printableWidthMm: 700;
      printableHeightMm: 1500;
      configuration?: ArtworkConfiguration;
    };
  };
  missingSupplierConfirmation: readonly string[];
}

export interface ProductionSpecPreview {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  configurationHash: string;
  evidenceStatus: "inferred";
  humanReadable: readonly string[];
  machineReadable: MachineProductionSpec;
  notForProduction: true;
}

export interface DerivedConfiguration {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  configurationHash: string;
  configuration: ValidatedConfiguration;
  compatibility: CompatibilityResult;
  billOfMaterials: BillOfMaterials;
  renderManifest: RenderManifest;
  price: PrototypePriceState;
  footprint: CourseFootprint;
  productionSpec: ProductionSpecPreview;
}

export type DerivationResult =
  | ValidationSuccess<DerivedConfiguration>
  | ValidationFailure;
