import canonicalObstacle from "../../../product-truth/canonical-obstacle.json";
import prototypeConfig from "../../../assets/spj-04/prototype-v1/prototype-config-v1.json";
import type { FrameColor, LowerElement } from "./types";

const profile = canonicalObstacle.prototype_profile;

export const FRAME_COLORS = profile.options
  .prototype_frame_colors as readonly FrameColor[];
export const LOWER_ELEMENTS = profile.options
  .lower_element_values as readonly LowerElement[];

export const SPJ04_DEFINITION = {
  supplierProductId: prototypeConfig.identity.supplier_product_id as "SPJ-04",
  presetName: prototypeConfig.identity.preset_name as "Club Classic",
  purpose: profile.purpose as "non_sellable_prototype_only",
  evidenceStatus: profile.evidence_status as "inferred",
  defaultFrameColor: profile.options.default_frame_color as FrameColor,
  poleTreatment: profile.options
    .pole_pattern as "two_color_alternating_segments",
  artworkMapping: profile.artwork
    .default_mapping as "same_artwork_on_both_wings",
  geometry: {
    overallWidth: profile.geometry_mm.overall_width as 5100,
    overallDepth: profile.geometry_mm.overall_depth as 800,
    overallHeight: profile.geometry_mm.overall_height as 1800,
    poleLength: profile.geometry_mm.pole_length as 3500,
    poleDiameter: profile.geometry_mm.pole_diameter as 100,
    wingFaceWidth: profile.geometry_mm.wing_face_width as 800,
    wingFaceHeight: profile.geometry_mm.wing_face_height as 1800,
  },
  artwork: {
    printableWidthMm: profile.artwork.printable_width_mm as 700,
    printableHeightMm: profile.artwork.printable_height_mm as 1500,
    placement: profile.artwork.placement as "fixed_slot_on_each_wing_panel",
  },
  compatibilityRules: profile.compatibility_rules,
  price: {
    amount: profile.price_display.amount as 9000,
    currency: profile.price_display.currency as "CNY",
    label: profile.price_display
      .ui_label as "Prototype supplier example · CNY 9,000 · excludes tax, freight and retail markup",
  },
} as const;

export const DEFAULT_OBSTACLE_INTENT = {
  schemaVersion: "1.0.0-phase1a",
  frameColor: SPJ04_DEFINITION.defaultFrameColor,
  poleTreatment: SPJ04_DEFINITION.poleTreatment,
  lowerElement: "none",
  artwork: "fixed_panel_artwork",
} as const;
