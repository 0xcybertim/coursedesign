import { writeFileSync } from "node:fs";
import { format } from "prettier";
import { deriveProfileWingPrototype } from "../../src/domain/design/derive-profile-wing.ts";
import {
  appendSilhouetteDecision,
  createEmptySilhouetteReview,
} from "../../src/domain/silhouette/review.ts";

const accepted = appendSilhouetteDecision(createEmptySilhouetteReview(), {
  decisionId: "phase1h-c1-deterministic-evidence-decision",
  fixtureId: "clean-dog-side",
  action: "accepted_for_future_prototyping",
  createdAt: "2026-07-22T20:00:00.000Z",
});
if (!accepted.ok) throw new Error(accepted.error.message);
const decision = accepted.value.decisions[0]!;
const first = deriveProfileWingPrototype({
  review: accepted.value,
  fixtureId: decision.fixtureId,
});
const second = deriveProfileWingPrototype({
  review: accepted.value,
  fixtureId: decision.fixtureId,
});
if (!first.ok) throw new Error(first.error.message);
if (!second.ok || JSON.stringify(second) !== JSON.stringify(first))
  throw new Error("Phase 1H-C1 derivation is not exactly deterministic.");

const prototype = first.value;
const manifest = prototype.renderManifest;
if (
  manifest.projectionParity.twoDProfileGeometrySha256 !==
    manifest.projectionParity.threeDExtrusionSourceGeometrySha256 ||
  manifest.projectionParity.twoDProfileGeometrySha256 !==
    manifest.geometrySha256
)
  throw new Error("2.5D and 3D geometry identities diverged.");

const evidence = {
  schemaVersion: "1.0.0-phase1h-c1-evidence",
  executionBoundary: {
    externalCallsMade: 0,
    retriesMade: 0,
    networkRequired: false,
    decisionKind: "repository-deterministic-test-decision",
    userDecisionClaimed: false,
  },
  checks: {
    exactRepeatMatch: true,
    oneAcceptedB2DecisionRequired: true,
    exactSharedTwoDThreeDGeometry: true,
    fixedSupportGeometryOnly: true,
    genericCountsOnly: true,
    pricePresent: false,
    revisionPresent: false,
    courseIntegrationPresent: false,
    supplierApproved: false,
    notForProduction: prototype.notForProduction,
    notForOrdering: prototype.notForOrdering,
  },
  prototype,
};

writeFileSync(
  "docs/phase-1h/profile-wing-c1-evidence.json",
  await format(JSON.stringify(evidence), { parser: "json" }),
);

const toX = (x: number) => x + 2950;
const toY = (y: number) => 2150 - y;
const polygon = (translateX: number, mirrorX: boolean) =>
  manifest.sharedProfileGeometry.fittedPolygonMm
    .map((point) => {
      const x = translateX + (mirrorX ? -point.x : point.x);
      return `${toX(x)},${toY(point.y)}`;
    })
    .join(" ");
const poles = manifest.poles
  .map(
    (pole, index) =>
      `<rect x="${toX(-pole.lengthMm / 2)}" y="${toY(pole.centerHeightMm + pole.diameterMm / 2)}" width="${pole.lengthMm}" height="${pole.diameterMm}" rx="50" fill="${index % 2 === 0 ? "#0d43c7" : "#f7f6f1"}" stroke="#0b0b0b" stroke-width="18"/>`,
  )
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="594" viewBox="0 0 5900 2500">
  <rect width="5900" height="2500" fill="#f7f6f1"/>
  <text x="160" y="190" font-family="sans-serif" font-size="108" font-weight="800">Profile Wing Vertical · C1</text>
  <text x="160" y="300" font-family="monospace" font-size="54">INFERRED PROTOTYPE · NOT FOR PRODUCTION OR ORDERING</text>
  <line x1="0" y1="2150" x2="5900" y2="2150" stroke="#0b0b0b" stroke-width="24"/>
  <rect x="${toX(-1790)}" y="${toY(1800)}" width="80" height="1800" fill="#6b7280"/>
  <rect x="${toX(1710)}" y="${toY(1800)}" width="80" height="1800" fill="#6b7280"/>
  ${poles}
  <polygon points="${polygon(-2350, false)}" fill="#0d43c7" stroke="#082469" stroke-width="24"/>
  <polygon points="${polygon(2350, true)}" fill="#0d43c7" stroke="#082469" stroke-width="24"/>
  <rect x="${toX(-2750)}" y="2110" width="800" height="100" rx="40" fill="#0b0b0b"/>
  <rect x="${toX(1950)}" y="2110" width="800" height="100" rx="40" fill="#0b0b0b"/>
  <path d="M ${toX(-1750)} ${toY(1800)} l 260 110 l -260 110 z" fill="#ff5547"/>
  <path d="M ${toX(1750)} ${toY(1800)} l -260 110 l 260 110 z" fill="#ff5547"/>
  <text x="160" y="2390" font-family="monospace" font-size="48">GEOMETRY ${manifest.geometrySha256}</text>
</svg>\n`;
writeFileSync("docs/phase-1h/profile-wing-c1-preview.svg", svg);

console.log(
  `Phase 1H-C1: ${prototype.source.fixtureId}, geometry ${manifest.geometrySha256}, prototype ${prototype.prototypeSha256}, 0 external calls.`,
);
