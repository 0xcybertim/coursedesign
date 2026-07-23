import {
  DEFAULT_OBSTACLE_INTENT,
  FRAME_COLORS,
  LOWER_ELEMENTS,
  SPJ04_DEFINITION,
} from "../product/definition";
import {
  DOMAIN_SCHEMA_VERSION,
  type BillOfMaterials,
  type DerivationResult,
  type FrameColor,
  type LowerElement,
  type ObstacleIntent,
  type ProductionSpecPreview,
  type PrototypePriceState,
  type ValidatedConfiguration,
  type ValidationFailure,
  type ValidationIssue,
  type ValidationResult,
} from "../product/types";
import { createRenderManifest } from "../render/manifest";
import { validateArtworkConfiguration } from "../artwork";
import { stableHash } from "./stable-hash";

function failure(...issues: ValidationIssue[]): ValidationFailure {
  return {
    ok: false,
    error: {
      kind: "validation_failure",
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      issues,
    },
  };
}

function normalizedString(value: unknown): string | null {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function validateIntent(
  intent: unknown,
): ValidationResult<ValidatedConfiguration> {
  if (intent === null || typeof intent !== "object" || Array.isArray(intent)) {
    return failure({
      field: "intent",
      code: "malformed_intent",
      message: "Configuration intent must be an object.",
      received: intent,
    });
  }

  const candidate = intent as Record<string, unknown>;
  const schemaVersion = candidate.schemaVersion ?? DOMAIN_SCHEMA_VERSION;
  if (schemaVersion !== DOMAIN_SCHEMA_VERSION) {
    return failure({
      field: "schemaVersion",
      code:
        typeof schemaVersion === "string"
          ? "unsupported_schema"
          : "malformed_value",
      message: `Only ${DOMAIN_SCHEMA_VERSION} intents are supported.`,
      received: schemaVersion,
    });
  }

  const frameColor = normalizedString(
    candidate.frameColor ?? DEFAULT_OBSTACLE_INTENT.frameColor,
  );
  const poleTreatment = normalizedString(
    candidate.poleTreatment ?? DEFAULT_OBSTACLE_INTENT.poleTreatment,
  );
  const lowerElement = normalizedString(
    candidate.lowerElement ?? DEFAULT_OBSTACLE_INTENT.lowerElement,
  );
  const artwork = normalizedString(
    candidate.artwork ?? DEFAULT_OBSTACLE_INTENT.artwork,
  );
  const issues: ValidationIssue[] = [];
  const artworkConfiguration =
    artwork === "custom_artwork"
      ? validateArtworkConfiguration(candidate.artworkConfiguration)
      : null;

  if (frameColor === null) {
    issues.push({
      field: "frameColor",
      code: "malformed_value",
      message: "Frame color must be a named string.",
      received: candidate.frameColor,
    });
  } else if (!FRAME_COLORS.includes(frameColor as FrameColor)) {
    issues.push({
      field: "frameColor",
      code: "unknown_value",
      message: `Unknown frame color: ${frameColor}.`,
      received: candidate.frameColor,
    });
  }

  if (poleTreatment === null) {
    issues.push({
      field: "poleTreatment",
      code: "malformed_value",
      message: "Pole treatment must be a named string.",
      received: candidate.poleTreatment,
    });
  } else if (poleTreatment !== SPJ04_DEFINITION.poleTreatment) {
    issues.push({
      field: "poleTreatment",
      code: "unknown_value",
      message:
        "Only the fixed two-color alternating prototype treatment is supported.",
      received: candidate.poleTreatment,
    });
  }

  if (lowerElement === null) {
    issues.push({
      field: "lowerElement",
      code: "malformed_value",
      message: "Choose exactly one lower-element slot value.",
      received: candidate.lowerElement,
    });
  } else if (!LOWER_ELEMENTS.includes(lowerElement as LowerElement)) {
    issues.push({
      field: "lowerElement",
      code: "unknown_value",
      message: `Unknown lower element: ${lowerElement}.`,
      received: candidate.lowerElement,
    });
  }

  if (artwork === null) {
    issues.push({
      field: "artwork",
      code: "malformed_value",
      message: "Artwork selection must be a named string.",
      received: candidate.artwork,
    });
  } else if (
    artwork !== "fixed_panel_artwork" &&
    artwork !== "custom_artwork"
  ) {
    issues.push({
      field: "artwork",
      code: "unknown_value",
      message:
        "Artwork must be the built-in Club Classic panel or a validated Phase 1F asset.",
      received: candidate.artwork,
    });
  }

  if (artwork === "custom_artwork" && artworkConfiguration?.ok === false) {
    issues.push({
      field: "artworkConfiguration",
      code: "malformed_value",
      message: artworkConfiguration.error.message,
      received: candidate.artworkConfiguration,
    });
  }

  if (issues.length > 0) return failure(...issues);

  const baseConfiguration: ValidatedConfiguration = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    configurationId: "spj-04-phase1a",
    supplierProductId: SPJ04_DEFINITION.supplierProductId,
    presetName: SPJ04_DEFINITION.presetName,
    purpose: SPJ04_DEFINITION.purpose,
    evidenceStatus: "inferred",
    frameColor: frameColor as FrameColor,
    poleTreatment: "two_color_alternating_segments",
    poleColors: ["blue", "white"],
    lowerElement: lowerElement as LowerElement,
    artwork: artwork as "fixed_panel_artwork" | "custom_artwork",
    artworkMapping:
      artwork === "custom_artwork" && artworkConfiguration?.ok === true
        ? artworkConfiguration.value.mapping === "linked"
          ? "same_artwork_on_both_wings"
          : "independent_artwork_on_wings"
        : SPJ04_DEFINITION.artworkMapping,
  };
  if (artwork === "custom_artwork" && artworkConfiguration?.ok === true) {
    baseConfiguration.artworkConfiguration = artworkConfiguration.value;
  }

  return {
    ok: true,
    value: baseConfiguration,
  };
}

function createBillOfMaterials(
  configuration: ValidatedConfiguration,
  configurationHash: string,
): BillOfMaterials {
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    configurationHash,
    evidenceStatus: "inferred",
    notForOrdering: true,
    lines: [
      {
        componentKey: "printed_wing_assembly",
        label: "Printed wing assembly",
        quantity: 2,
        evidenceStatus: "inferred",
      },
      {
        componentKey: "aluminum_jump_pole",
        label: "Aluminum jump pole",
        quantity: 4,
        evidenceStatus: "inferred",
      },
      {
        componentKey: "cup_or_release_adapter",
        label: "Cup or release adapter",
        quantity: 8,
        evidenceStatus: "inferred",
      },
      {
        componentKey: "keyhole_track_assembly",
        label: "Keyhole track assembly",
        quantity: 2,
        evidenceStatus: "inferred",
      },
      {
        componentKey: "foot_or_ballast_assembly",
        label: "Foot or ballast assembly",
        quantity: 2,
        evidenceStatus: "inferred",
      },
      {
        componentKey: "flag",
        label: "Flag",
        quantity: 2,
        evidenceStatus: "inferred",
      },
      {
        componentKey: "pole_end_cap",
        label: "Pole end cap",
        quantity: 8,
        evidenceStatus: "inferred",
      },
      {
        componentKey: "lower_element",
        label:
          configuration.lowerElement === "none"
            ? "Lower element"
            : configuration.lowerElement.replaceAll("_", " "),
        quantity: configuration.lowerElement === "none" ? 0 : 1,
        evidenceStatus: "inferred",
        selection: configuration.lowerElement,
      },
    ],
  };
}

function createPrice(
  configuration: ValidatedConfiguration,
  configurationHash: string,
): PrototypePriceState {
  const unknownSurcharges: string[] = [];
  if (configuration.frameColor !== SPJ04_DEFINITION.defaultFrameColor)
    unknownSurcharges.push(`${configuration.frameColor} frame finish`);
  if (configuration.lowerElement !== "none")
    unknownSurcharges.push(
      `${configuration.lowerElement.replaceAll("_", " ")} lower element`,
    );

  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    configurationHash,
    classification: "supplier_cost_example",
    amount: SPJ04_DEFINITION.price.amount,
    currency: SPJ04_DEFINITION.price.currency,
    label: SPJ04_DEFINITION.price.label,
    evidenceStatus: "confirmed_current",
    provisional: true,
    customerRetailPrice: null,
    unknownSurcharges,
  };
}

function createProductionSpec(
  configuration: ValidatedConfiguration,
  configurationHash: string,
): ProductionSpecPreview {
  const lowerLabel =
    configuration.lowerElement === "none"
      ? "No lower element"
      : `One ${configuration.lowerElement.replaceAll("_", " ")}`;
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    configurationHash,
    evidenceStatus: "inferred",
    notForProduction: true,
    humanReadable: [
      `SPJ-04 · Club Classic · ${configuration.frameColor} frame`,
      "Four poles · blue and white alternating treatment",
      `${lowerLabel} · ${
        configuration.artwork === "custom_artwork"
          ? configuration.artworkMapping === "same_artwork_on_both_wings"
            ? "custom artwork linked across both wing panels"
            : "custom artwork edited independently per wing panel"
          : "fixed artwork on both wing panels"
      }`,
      "Prototype envelope 5,100 × 800 × 1,800 mm · inferred, not for fabrication",
    ],
    machineReadable: {
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      configurationHash,
      documentStatus: "prototype_preview_not_for_production",
      supplierConfirmed: {
        supplierProductId: "SPJ-04",
        frameMaterial: "aluminum alloy",
        jumpPoleCount: 4,
        supplierCostEvidence: { amount: 9000, currency: "CNY" },
      },
      prototypeAssumptions: {
        evidenceStatus: "inferred",
        configuration,
        footprintMm: { width: 5100, depth: 800 },
        artwork: {
          placement: SPJ04_DEFINITION.artwork.placement,
          mapping: SPJ04_DEFINITION.artworkMapping,
          printableWidthMm: SPJ04_DEFINITION.artwork.printableWidthMm,
          printableHeightMm: SPJ04_DEFINITION.artwork.printableHeightMm,
          ...(configuration.artworkConfiguration
            ? { configuration: configuration.artworkConfiguration }
            : {}),
        },
      },
      missingSupplierConfirmation: [
        "Complete supplier bill of materials and component identifiers",
        "Final geometry, weights, finishes, print specification and option compatibility",
        "Option surcharges, lead time, packaging and production-sheet format",
      ],
    },
  };
}

export function deriveConfiguration(intent: ObstacleIntent): DerivationResult;
export function deriveConfiguration(intent: unknown): DerivationResult;
export function deriveConfiguration(intent: unknown): DerivationResult {
  const validation = validateIntent(intent);
  if (!validation.ok) return validation;

  const configuration = validation.value;
  const configurationHash = stableHash(configuration);
  const billOfMaterials = createBillOfMaterials(
    configuration,
    configurationHash,
  );
  const renderManifest = createRenderManifest(
    configuration,
    billOfMaterials,
    configurationHash,
  );
  const price = createPrice(configuration, configurationHash);
  const footprint = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    configurationHash,
    units: "mm" as const,
    width: 5100 as const,
    depth: 800 as const,
    anchor: {
      x: 0 as const,
      y: 0 as const,
      definition: "midpoint_of_primary_pole_centerline" as const,
    },
    polygon: [
      [-2550, -400],
      [2550, -400],
      [2550, 400],
      [-2550, 400],
      [-2550, -400],
    ] as const,
    evidenceStatus: "inferred" as const,
    notForSurveyOrFabrication: true as const,
  };
  const productionSpec = createProductionSpec(configuration, configurationHash);

  return {
    ok: true,
    value: {
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      configurationHash,
      configuration,
      compatibility: {
        schemaVersion: DOMAIN_SCHEMA_VERSION,
        configurationHash,
        compatible: true,
        evidenceStatus: "inferred",
        rules: SPJ04_DEFINITION.compatibilityRules,
        warnings: [
          "Prototype compatibility is a product-design rule and has not been confirmed by the supplier.",
        ],
      },
      billOfMaterials,
      renderManifest,
      price,
      footprint,
      productionSpec,
    },
  };
}
