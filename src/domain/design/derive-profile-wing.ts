import {
  PROFILE_WING_C1_DEFINITION,
  PROFILE_WING_C1_SCHEMA_VERSION,
  type DerivedProfileWingPrototype,
  type ProfileWingAcceptanceDecision,
  type ProfileWingAppearance,
  type ProfileWingDerivationFailureKind,
  type ProfileWingDerivationResult,
  type ProfileWingGenericQuantity,
  type ProfileWingPointMm,
  type ProfileWingRenderManifest,
  type ProfileWingSharedGeometry,
} from "../product/profile-wing-definition.ts";
import {
  validateAcceptedProfileWingCreation,
  type ProfileWingCreationCandidate,
  type ProfileWingCreationDecision,
} from "../profile-wing-creation/index.ts";
import {
  acceptedSilhouetteFixtureForDecision,
  currentSilhouetteDecisions,
  parseLocalSilhouetteReview,
  type LocalSilhouetteReview,
} from "../silhouette/review.ts";
import type { SilhouettePoint } from "../silhouette/types.ts";
import type { FrameColor } from "../product/types.ts";
import { stableHash } from "./stable-hash.ts";

const PROFILE_FRAME_HEX: Record<FrameColor, string> = {
  white: "#F7F6F1",
  blue: "#0D43C7",
  red: "#FF5547",
  yellow: "#E8D51B",
};

export function profileWingAppearance(
  frameColor: FrameColor,
): ProfileWingAppearance {
  return {
    frameColor,
    palette: {
      wing: PROFILE_FRAME_HEX[frameColor],
      supports: PROFILE_FRAME_HEX[frameColor],
      polePrimary: "#0D43C7",
      poleSecondary: "#F7F6F1",
      hardware: "#252624",
    },
  };
}

function failure(
  kind: ProfileWingDerivationFailureKind,
  message: string,
): ProfileWingDerivationResult {
  return { ok: false, error: { kind, message } };
}

function bounds(points: readonly ProfileWingPointMm[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function fitProfilePolygon(
  points: readonly SilhouettePoint[],
): readonly ProfileWingPointMm[] | null {
  if (points.length < 3) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sourceWidth = maxX - minX;
  const sourceHeight = maxY - minY;
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  const definition = PROFILE_WING_C1_DEFINITION.geometryMm;
  const scale = Math.min(
    definition.maximumProfileWidth / sourceWidth,
    definition.maximumProfileHeight / sourceHeight,
  );
  const fittedWidth = sourceWidth * scale;
  const fitted = points.map((point) => ({
    x: Math.round((point.x - minX) * scale - fittedWidth / 2),
    y: Math.round(definition.profileLowerClearance + (maxY - point.y) * scale),
  }));
  let twiceArea = 0;
  for (let index = 0; index < fitted.length; index += 1) {
    const point = fitted[index]!;
    const next = fitted[(index + 1) % fitted.length]!;
    twiceArea += point.x * next.y - next.x * point.y;
  }
  return twiceArea < 0 ? [fitted[0]!, ...fitted.slice(1).reverse()] : fitted;
}

function genericQuantities(): readonly ProfileWingGenericQuantity[] {
  const evidenceStatus = "inferred_not_supplier_confirmed" as const;
  return [
    {
      componentKey: "silhouette_wing_plate",
      label: "Silhouette wing plate",
      quantity: 2,
      evidenceStatus,
    },
    {
      componentKey: "prototype_pole",
      label: "Prototype pole",
      quantity: 4,
      evidenceStatus,
    },
    {
      componentKey: "cup_or_release_adapter",
      label: "Cup or release adapter",
      quantity: 8,
      evidenceStatus,
    },
    {
      componentKey: "prototype_track",
      label: "Prototype track",
      quantity: 2,
      evidenceStatus,
    },
    {
      componentKey: "foot_or_ballast",
      label: "Foot or ballast",
      quantity: 2,
      evidenceStatus,
    },
    {
      componentKey: "flag",
      label: "Flag",
      quantity: 2,
      evidenceStatus,
    },
    {
      componentKey: "pole_end_cap",
      label: "Pole end cap",
      quantity: 8,
      evidenceStatus,
    },
  ];
}

function renderManifest(
  sourceNormalizedPolygon: readonly SilhouettePoint[],
  appearance?: ProfileWingAppearance,
): ProfileWingRenderManifest | null {
  const fittedPolygonMm = fitProfilePolygon(sourceNormalizedPolygon);
  if (!fittedPolygonMm) return null;
  const geometryIdentity = {
    schemaVersion: "1.0.0-phase1h-c1-shared-profile-geometry",
    coordinateSystem: {
      units: "mm",
      origin: "profile_horizontal_center_at_lower_clearance",
      xAxis: "right",
      yAxis: "up",
      winding: "counterclockwise_cartesian",
    },
    fittedPolygonMm,
    inferredExtrusionDepthMm:
      PROFILE_WING_C1_DEFINITION.geometryMm.inferredPlateThickness,
  } as const;
  const geometrySha256 = stableHash(geometryIdentity);
  const sharedProfileGeometry: ProfileWingSharedGeometry = {
    ...geometryIdentity,
    sourceNormalizedPolygon,
    fittedBoundsMm: bounds(fittedPolygonMm),
    geometrySha256,
  };
  const poleHalfSpan = PROFILE_WING_C1_DEFINITION.geometryMm.poleSpan / 2;
  const wingCenter = poleHalfSpan + 600;
  return {
    schemaVersion: PROFILE_WING_C1_SCHEMA_VERSION,
    rendererContract: "profile-wing-render-manifest-v1",
    geometrySha256,
    ...(appearance ? { appearance } : {}),
    sharedProfileGeometry,
    wingInstances: [
      {
        id: "left-wing",
        side: "left",
        translateMm: [-wingCenter, 0, 0],
        mirrorX: false,
      },
      {
        id: "right-wing",
        side: "right",
        translateMm: [wingCenter, 0, 0],
        mirrorX: true,
      },
    ],
    poles: PROFILE_WING_C1_DEFINITION.geometryMm.poleCenterHeights.map(
      (centerHeightMm, index) => ({
        id: `pole-${index + 1}`,
        centerHeightMm,
        lengthMm: PROFILE_WING_C1_DEFINITION.geometryMm.poleSpan,
        diameterMm: PROFILE_WING_C1_DEFINITION.geometryMm.poleDiameter,
      }),
    ),
    fixedSupports: {
      tracks: [
        { xMm: -poleHalfSpan, heightMm: 1800 },
        { xMm: poleHalfSpan, heightMm: 1800 },
      ],
      feet: [
        { xMm: -wingCenter, depthMm: 800 },
        { xMm: wingCenter, depthMm: 800 },
      ],
      flags: [
        { xMm: -poleHalfSpan, yMm: 1800 },
        { xMm: poleHalfSpan, yMm: 1800 },
      ],
    },
    projectionParity: {
      twoDProfileGeometrySha256: geometrySha256,
      threeDExtrusionSourceGeometrySha256: geometrySha256,
      exactSharedGeometry: true,
    },
  };
}

function deriveAcceptedProfileWing(input: {
  readonly fixtureId: string;
  readonly sourceMaskSha256: string;
  readonly sourcePolygonSha256: string;
  readonly resultIdentitySha256: string;
  readonly points: readonly SilhouettePoint[];
  readonly decision: ProfileWingAcceptanceDecision;
  readonly sourceKind?:
    | "benchmark_fixture"
    | "user_upload"
    | "generated_concept";
  readonly sourceLabel?: string;
  readonly sourceContentHash?: string;
  readonly provider?: "remove-bg" | "deterministic-test";
  readonly appearance?: ProfileWingAppearance;
}): ProfileWingDerivationResult {
  const manifest = renderManifest(input.points, input.appearance);
  if (!manifest)
    return failure(
      "invalid_source_geometry",
      "The accepted silhouette cannot be fitted into the C1 profile envelope.",
    );
  const quantities = genericQuantities();
  const sourceIdentity = {
    fixtureId: input.fixtureId,
    sourceMaskSha256: input.sourceMaskSha256,
    sourcePolygonSha256: input.sourcePolygonSha256,
    resultIdentitySha256: input.resultIdentitySha256,
    decisionHash: input.decision.decisionHash,
    ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
    ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
    ...(input.sourceContentHash
      ? { sourceContentHash: input.sourceContentHash }
      : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.appearance ? { appearance: input.appearance } : {}),
  } as const;
  const identity = {
    schemaVersion: PROFILE_WING_C1_SCHEMA_VERSION,
    familyId: PROFILE_WING_C1_DEFINITION.familyId,
    ...sourceIdentity,
    geometrySha256: manifest.geometrySha256,
    envelopeMm: { width: 5900, depth: 800, height: 1800 },
    genericQuantities: quantities,
  } as const;
  const value: DerivedProfileWingPrototype = {
    schemaVersion: PROFILE_WING_C1_SCHEMA_VERSION,
    prototypeSha256: stableHash(identity),
    familyId: PROFILE_WING_C1_DEFINITION.familyId,
    displayName: PROFILE_WING_C1_DEFINITION.displayName,
    purpose: PROFILE_WING_C1_DEFINITION.purpose,
    evidenceStatus: PROFILE_WING_C1_DEFINITION.evidenceStatus,
    ...(input.appearance ? { appearance: input.appearance } : {}),
    source: {
      ...sourceIdentity,
      decisionId: input.decision.decisionId,
    },
    decision: input.decision,
    envelopeMm: { width: 5900, depth: 800, height: 1800 },
    footprint: {
      units: "mm",
      anchor: "midpoint_of_primary_pole_centerline",
      polygon: [
        [-2950, -400],
        [2950, -400],
        [2950, 400],
        [-2950, 400],
        [-2950, -400],
      ],
      notForSurveyOrFabrication: true,
    },
    genericQuantities: quantities,
    renderManifest: manifest,
    warnings: PROFILE_WING_C1_DEFINITION.warnings,
    notForProduction: true,
    notForOrdering: true,
  };
  return { ok: true, value };
}

export function deriveProfileWingPrototype(input: {
  readonly review: LocalSilhouetteReview;
  readonly fixtureId: string;
}): ProfileWingDerivationResult;
export function deriveProfileWingPrototype(
  input: unknown,
): ProfileWingDerivationResult;
export function deriveProfileWingPrototype(
  input: unknown,
): ProfileWingDerivationResult {
  if (
    !input ||
    typeof input !== "object" ||
    !("review" in input) ||
    !("fixtureId" in input) ||
    typeof (input as { readonly fixtureId: unknown }).fixtureId !== "string"
  )
    return failure(
      "malformed_input",
      "Profile-wing derivation requires one B2 review and fixture ID.",
    );
  const candidate = input as {
    readonly review: unknown;
    readonly fixtureId: string;
  };
  let serialized: string;
  try {
    serialized = JSON.stringify(candidate.review);
  } catch {
    return failure(
      "invalid_review_decision",
      "The B2 review could not be serialized for integrity validation.",
    );
  }
  const parsed = parseLocalSilhouetteReview(serialized);
  if (!parsed.ok)
    return failure("invalid_review_decision", parsed.error.message);
  const current = currentSilhouetteDecisions(parsed.value).get(
    candidate.fixtureId,
  );
  if (!current)
    return failure(
      "decision_does_not_accept",
      "The fixture has no current B2 decision permitting prototype derivation.",
    );
  const accepted = acceptedSilhouetteFixtureForDecision(current);
  if (!accepted.ok)
    return failure(
      accepted.error.kind === "ineligible_decision"
        ? "decision_does_not_accept"
        : "invalid_review_decision",
      accepted.error.message,
    );
  const { decision, fixture } = accepted.value;
  return deriveAcceptedProfileWing({
    fixtureId: fixture.fixtureId,
    sourceMaskSha256: fixture.sourceMaskSha256,
    sourcePolygonSha256: fixture.result.silhouette.polygonSha256,
    resultIdentitySha256: fixture.resultIdentitySha256,
    points: fixture.result.silhouette.points,
    decision,
  });
}

export function deriveProfileWingPrototypeFromCreation(input: {
  readonly candidate: ProfileWingCreationCandidate;
  readonly decision: ProfileWingCreationDecision;
  readonly appearance?: ProfileWingAppearance;
}): ProfileWingDerivationResult;
export function deriveProfileWingPrototypeFromCreation(
  input: unknown,
): ProfileWingDerivationResult;
export function deriveProfileWingPrototypeFromCreation(
  input: unknown,
): ProfileWingDerivationResult {
  if (
    !input ||
    typeof input !== "object" ||
    !("candidate" in input) ||
    !("decision" in input)
  )
    return failure(
      "malformed_input",
      "Profile-wing creation requires one accepted user-image candidate.",
    );
  const accepted = validateAcceptedProfileWingCreation(
    input as {
      readonly candidate: ProfileWingCreationCandidate;
      readonly decision: ProfileWingCreationDecision;
    },
  );
  if (!accepted.ok)
    return failure("invalid_review_decision", accepted.error.message);
  const { candidate, decision } = accepted.value;
  return deriveAcceptedProfileWing({
    fixtureId: candidate.source.sourceId,
    sourceMaskSha256: candidate.maskContentHash,
    sourcePolygonSha256: candidate.vectorization.silhouette.polygonSha256,
    resultIdentitySha256: candidate.candidateHash,
    points: candidate.vectorization.silhouette.points,
    decision,
    sourceKind: candidate.source.sourceKind,
    sourceLabel: candidate.source.sourceLabel,
    sourceContentHash: candidate.source.contentHash,
    provider: candidate.provenance.provider,
    appearance: (
      input as {
        readonly appearance?: ProfileWingAppearance;
      }
    ).appearance,
  });
}
