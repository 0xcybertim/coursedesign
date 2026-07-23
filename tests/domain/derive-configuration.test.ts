import { describe, expect, it } from "vitest";
import {
  DEFAULT_OBSTACLE_INTENT,
  FRAME_COLORS,
  LOWER_ELEMENTS,
  deriveConfiguration,
} from "@/domain/design";

function validValue(intent: unknown = DEFAULT_OBSTACLE_INTENT) {
  const result = deriveConfiguration(intent);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected valid derivation");
  return result.value;
}

describe("deriveConfiguration", () => {
  it("derives the valid default SPJ-04 prototype", () => {
    const derived = validValue();

    expect(derived.configuration).toMatchObject({
      supplierProductId: "SPJ-04",
      presetName: "Club Classic",
      purpose: "non_sellable_prototype_only",
      frameColor: "white",
      poleTreatment: "two_color_alternating_segments",
      lowerElement: "none",
      artworkMapping: "same_artwork_on_both_wings",
    });
    expect(derived.compatibility.compatible).toBe(true);
  });

  it.each(FRAME_COLORS)(
    "supports the %s prototype frame color",
    (frameColor) => {
      const derived = validValue({ ...DEFAULT_OBSTACLE_INTENT, frameColor });
      expect(derived.configuration.frameColor).toBe(frameColor);
      expect(derived.renderManifest.palette.frame).toMatch(/^#[0-9A-F]{6}$/i);
    },
  );

  it.each(LOWER_ELEMENTS)(
    "supports exactly one %s lower-element selection",
    (lowerElement) => {
      const derived = validValue({ ...DEFAULT_OBSTACLE_INTENT, lowerElement });
      const line = derived.billOfMaterials.lines.find(
        (item) => item.componentKey === "lower_element",
      );
      expect(line).toMatchObject({
        quantity: lowerElement === "none" ? 0 : 1,
        selection: lowerElement,
      });
      expect(derived.renderManifest.lowerElement).toBe(lowerElement);
    },
  );

  it("keeps the only supported pole treatment and fixed artwork mapping", () => {
    const derived = validValue({
      ...DEFAULT_OBSTACLE_INTENT,
      poleTreatment: "two_color_alternating_segments",
      artwork: "fixed_panel_artwork",
    });
    expect(derived.configuration.poleColors).toEqual(["blue", "white"]);
    expect(derived.renderManifest.artworkMapping).toBe(
      "same_artwork_on_both_wings",
    );
  });

  it.each([
    [null, "intent", "malformed_intent"],
    [[], "intent", "malformed_intent"],
    [
      { ...DEFAULT_OBSTACLE_INTENT, frameColor: "purple" },
      "frameColor",
      "unknown_value",
    ],
    [
      { ...DEFAULT_OBSTACLE_INTENT, frameColor: 42 },
      "frameColor",
      "malformed_value",
    ],
    [
      { ...DEFAULT_OBSTACLE_INTENT, lowerElement: "wall" },
      "lowerElement",
      "unknown_value",
    ],
    [
      { ...DEFAULT_OBSTACLE_INTENT, poleTreatment: "rainbow" },
      "poleTreatment",
      "unknown_value",
    ],
    [
      { ...DEFAULT_OBSTACLE_INTENT, artwork: "free_placement" },
      "artwork",
      "unknown_value",
    ],
    [
      { ...DEFAULT_OBSTACLE_INTENT, schemaVersion: "9.0.0" },
      "schemaVersion",
      "unsupported_schema",
    ],
  ] as const)(
    "returns a typed failure for invalid input %#",
    (intent, field, code) => {
      const result = deriveConfiguration(intent);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected failure");
      expect(result.error.kind).toBe("validation_failure");
      expect(result.error.issues[0]).toMatchObject({ field, code });
    },
  );

  it("rejects multiple lower elements as malformed instead of throwing", () => {
    const result = deriveConfiguration({
      ...DEFAULT_OBSTACLE_INTENT,
      lowerElement: ["gate", "filler"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected failure");
    expect(result.error.issues[0]).toMatchObject({
      field: "lowerElement",
      code: "malformed_value",
    });
  });

  it("preserves every exact prototype component quantity", () => {
    const derived = validValue({
      ...DEFAULT_OBSTACLE_INTENT,
      lowerElement: "gate",
    });
    expect(
      Object.fromEntries(
        derived.billOfMaterials.lines.map((line) => [
          line.componentKey,
          line.quantity,
        ]),
      ),
    ).toEqual({
      printed_wing_assembly: 2,
      aluminum_jump_pole: 4,
      cup_or_release_adapter: 8,
      keyhole_track_assembly: 2,
      foot_or_ballast_assembly: 2,
      flag: 2,
      pole_end_cap: 8,
      lower_element: 1,
    });
  });

  it("keeps price as the exact supplier-cost example and never applies unknown surcharges", () => {
    const defaultPrice = validValue().price;
    const changedPrice = validValue({
      ...DEFAULT_OBSTACLE_INTENT,
      frameColor: "red",
      lowerElement: "filler",
    }).price;

    expect(defaultPrice.label).toBe(
      "Prototype supplier example · CNY 9,000 · excludes tax, freight and retail markup",
    );
    expect(changedPrice.amount).toBe(9000);
    expect(changedPrice.classification).toBe("supplier_cost_example");
    expect(changedPrice.customerRetailPrice).toBeNull();
    expect(changedPrice.unknownSurcharges).toEqual([
      "red frame finish",
      "filler lower element",
    ]);
  });

  it("uses the exact 5,100 × 800 mm prototype footprint", () => {
    const footprint = validValue().footprint;
    expect(footprint).toMatchObject({
      width: 5100,
      depth: 800,
      evidenceStatus: "inferred",
      notForSurveyOrFabrication: true,
      anchor: { x: 0, y: 0, definition: "midpoint_of_primary_pole_centerline" },
    });
  });

  it("returns identical hashes and outputs for identical input", () => {
    const first = validValue({
      ...DEFAULT_OBSTACLE_INTENT,
      frameColor: "blue",
      lowerElement: "gate",
    });
    const second = validValue({
      ...DEFAULT_OBSTACLE_INTENT,
      frameColor: "blue",
      lowerElement: "gate",
    });
    expect(second).toEqual(first);
  });

  it("normalizes equivalent string inputs deterministically", () => {
    const normalized = validValue({
      ...DEFAULT_OBSTACLE_INTENT,
      frameColor: "blue",
      lowerElement: "gate",
    });
    const equivalent = validValue({
      schemaVersion: DEFAULT_OBSTACLE_INTENT.schemaVersion,
      frameColor: "  BLUE ",
      lowerElement: " GATE ",
      poleTreatment: " TWO_COLOR_ALTERNATING_SEGMENTS ",
      artwork: " FIXED_PANEL_ARTWORK ",
    });
    expect(equivalent).toEqual(normalized);
  });

  it("carries the same configuration hash through every projection", () => {
    const derived = validValue({
      ...DEFAULT_OBSTACLE_INTENT,
      frameColor: "yellow",
      lowerElement: "decorative_panel",
    });
    expect(
      new Set([
        derived.configurationHash,
        derived.compatibility.configurationHash,
        derived.billOfMaterials.configurationHash,
        derived.renderManifest.configurationHash,
        derived.price.configurationHash,
        derived.footprint.configurationHash,
        derived.productionSpec.configurationHash,
        derived.productionSpec.machineReadable.configurationHash,
      ]),
    ).toEqual(new Set([derived.configurationHash]));
  });

  it("keeps supplier-confirmed evidence separate from inferred prototype assumptions", () => {
    const spec = validValue().productionSpec.machineReadable;
    expect(spec.supplierConfirmed).toEqual({
      supplierProductId: "SPJ-04",
      frameMaterial: "aluminum alloy",
      jumpPoleCount: 4,
      supplierCostEvidence: { amount: 9000, currency: "CNY" },
    });
    expect(spec.prototypeAssumptions.evidenceStatus).toBe("inferred");
    expect(spec.documentStatus).toBe("prototype_preview_not_for_production");
    expect(spec.missingSupplierConfirmation.length).toBeGreaterThan(0);
  });
});
