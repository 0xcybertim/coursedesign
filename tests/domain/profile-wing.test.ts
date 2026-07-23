import { describe, expect, it } from "vitest";
import {
  PROFILE_WING_C1_DEFINITION,
  deriveProfileWingPrototype,
} from "../../src/domain/design/index.ts";
import {
  appendSilhouetteDecision,
  createEmptySilhouetteReview,
  type LocalSilhouetteReview,
  type SilhouetteDecisionAction,
  type SilhouetteDecisionEvent,
} from "../../src/domain/silhouette/index.ts";

function decision(
  fixtureId: string,
  action: SilhouetteDecisionAction = "accepted_for_future_prototyping",
  decisionId = `decision-${fixtureId}`,
  createdAt = "2026-07-22T20:00:00.000Z",
): SilhouetteDecisionEvent {
  const result = appendSilhouetteDecision(createEmptySilhouetteReview(), {
    decisionId,
    fixtureId,
    action,
    createdAt,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.decisions[0]!;
}

function derived(event = decision("clean-dog-side")) {
  const result = deriveProfileWingPrototype({
    review: reviewWith(event),
    fixtureId: event.fixtureId,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function reviewWith(event: SilhouetteDecisionEvent): LocalSilhouetteReview {
  return {
    ...createEmptySilhouetteReview(event.createdAt),
    decisions: [event],
  };
}

function signedArea(
  points: readonly { readonly x: number; readonly y: number }[],
) {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

describe("Phase 1H-C1 Profile Wing Vertical derivation", () => {
  it("requires one exact accepted B2 decision", () => {
    expect(deriveProfileWingPrototype(null)).toEqual({
      ok: false,
      error: {
        kind: "malformed_input",
        message:
          "Profile-wing derivation requires one B2 review and fixture ID.",
      },
    });
    const retained = decision(
      "clean-dog-side",
      "retained_without_conversion",
      "decision-retained",
    );
    expect(
      deriveProfileWingPrototype({
        review: reviewWith(retained),
        fixtureId: retained.fixtureId,
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "decision_does_not_accept" },
    });
    expect(
      deriveProfileWingPrototype({
        review: reviewWith({
          ...decision("clean-dog-side"),
          decisionHash: "tampered",
        }),
        fixtureId: "clean-dog-side",
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid_review_decision" },
    });
  });

  it("refuses an earlier acceptance superseded by a retain decision", () => {
    const first = appendSilhouetteDecision(createEmptySilhouetteReview(), {
      decisionId: "decision-accepted-first",
      fixtureId: "clean-dog-side",
      action: "accepted_for_future_prototyping",
      createdAt: "2026-07-22T20:10:00.000Z",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = appendSilhouetteDecision(first.value, {
      decisionId: "decision-retained-latest",
      fixtureId: "clean-dog-side",
      action: "retained_without_conversion",
      createdAt: "2026-07-22T20:11:00.000Z",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(
      deriveProfileWingPrototype({
        review: second.value,
        fixtureId: "clean-dog-side",
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "decision_does_not_accept" },
    });
  });

  it("derives one non-sellable inferred profile family with exact provenance", () => {
    const event = decision("clean-dog-side");
    const value = derived(event);
    expect(value).toMatchObject({
      schemaVersion: "1.0.0-phase1h-c1",
      familyId: "profile-wing-vertical-v1",
      displayName: "Profile Wing Vertical",
      purpose: "non_sellable_generated_prototype_only",
      evidenceStatus: "inferred_not_supplier_confirmed",
      source: {
        fixtureId: "clean-dog-side",
        decisionId: event.decisionId,
        decisionHash: event.decisionHash,
      },
      envelopeMm: { width: 5900, depth: 800, height: 1800 },
      notForProduction: true,
      notForOrdering: true,
    });
    expect(value.prototypeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(value.renderManifest.geometrySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(value.warnings).toEqual(PROFILE_WING_C1_DEFINITION.warnings);
    expect(value).not.toHaveProperty("price");
    expect(value).not.toHaveProperty("revisionId");
    expect(value).not.toHaveProperty("course");
  });

  it("fits an integer counterclockwise polygon inside the inferred profile region", () => {
    const geometry = derived().renderManifest.sharedProfileGeometry;
    expect(geometry.sourceNormalizedPolygon).toHaveLength(50);
    expect(geometry.fittedPolygonMm).toHaveLength(50);
    expect(geometry.coordinateSystem).toEqual({
      units: "mm",
      origin: "profile_horizontal_center_at_lower_clearance",
      xAxis: "right",
      yAxis: "up",
      winding: "counterclockwise_cartesian",
    });
    expect(geometry.fittedBoundsMm.width).toBeLessThanOrEqual(1200);
    expect(geometry.fittedBoundsMm.height).toBeLessThanOrEqual(1500);
    expect(geometry.fittedBoundsMm.minY).toBe(150);
    expect(geometry.fittedBoundsMm.minX).toBeGreaterThanOrEqual(-600);
    expect(geometry.fittedBoundsMm.maxX).toBeLessThanOrEqual(600);
    expect(
      geometry.fittedPolygonMm.every(
        (point) => Number.isInteger(point.x) && Number.isInteger(point.y),
      ),
    ).toBe(true);
    expect(signedArea(geometry.fittedPolygonMm)).toBeGreaterThan(0);
  });

  it("uses the exact shared polygon for 2.5D and 3D extrusion", () => {
    const manifest = derived().renderManifest;
    expect(manifest.projectionParity).toEqual({
      twoDProfileGeometrySha256: manifest.geometrySha256,
      threeDExtrusionSourceGeometrySha256: manifest.geometrySha256,
      exactSharedGeometry: true,
    });
    expect(manifest.sharedProfileGeometry.inferredExtrusionDepthMm).toBe(40);
    expect(manifest.wingInstances).toEqual([
      {
        id: "left-wing",
        side: "left",
        translateMm: [-2350, 0, 0],
        mirrorX: false,
      },
      {
        id: "right-wing",
        side: "right",
        translateMm: [2350, 0, 0],
        mirrorX: true,
      },
    ]);
  });

  it("keeps all support geometry fixed and explicitly inferred", () => {
    const value = derived();
    expect(value.renderManifest.poles).toEqual(
      [650, 950, 1250, 1550].map((centerHeightMm, index) => ({
        id: `pole-${index + 1}`,
        centerHeightMm,
        lengthMm: 3500,
        diameterMm: 100,
      })),
    );
    expect(value.renderManifest.fixedSupports).toEqual({
      tracks: [
        { xMm: -1750, heightMm: 1800 },
        { xMm: 1750, heightMm: 1800 },
      ],
      feet: [
        { xMm: -2350, depthMm: 800 },
        { xMm: 2350, depthMm: 800 },
      ],
      flags: [
        { xMm: -1750, yMm: 1800 },
        { xMm: 1750, yMm: 1800 },
      ],
    });
    expect(value.footprint).toEqual({
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
    });
  });

  it("produces generic counts, never production material quantities", () => {
    const quantities = derived().genericQuantities;
    expect(
      Object.fromEntries(
        quantities.map((line) => [line.componentKey, line.quantity]),
      ),
    ).toEqual({
      silhouette_wing_plate: 2,
      prototype_pole: 4,
      cup_or_release_adapter: 8,
      prototype_track: 2,
      foot_or_ballast: 2,
      flag: 2,
      pole_end_cap: 8,
    });
    expect(
      quantities.every(
        (line) => line.evidenceStatus === "inferred_not_supplier_confirmed",
      ),
    ).toBe(true);
  });

  it("separates stable shape identity from decision provenance", () => {
    const first = derived(
      decision(
        "clean-dog-side",
        "accepted_for_future_prototyping",
        "decision-dog-1",
        "2026-07-22T20:01:00.000Z",
      ),
    );
    const second = derived(
      decision(
        "clean-dog-side",
        "accepted_for_future_prototyping",
        "decision-dog-2",
        "2026-07-22T20:02:00.000Z",
      ),
    );
    expect(second.renderManifest.geometrySha256).toBe(
      first.renderManifest.geometrySha256,
    );
    expect(second.renderManifest.sharedProfileGeometry).toEqual(
      first.renderManifest.sharedProfileGeometry,
    );
    expect(second.prototypeSha256).not.toBe(first.prototypeSha256);
  });

  it("changes geometry identity for a different accepted silhouette", () => {
    const dog = derived(decision("clean-dog-side"));
    const horse = derived(decision("clean-horse-profile"));
    expect(horse.renderManifest.geometrySha256).not.toBe(
      dog.renderManifest.geometrySha256,
    );
    expect(horse.prototypeSha256).not.toBe(dog.prototypeSha256);
  });

  it("is exactly deterministic for identical decision evidence", () => {
    const event = decision("clean-butterfly");
    expect(
      deriveProfileWingPrototype({
        review: reviewWith(event),
        fixtureId: event.fixtureId,
      }),
    ).toEqual(
      deriveProfileWingPrototype({
        review: reviewWith(event),
        fixtureId: event.fixtureId,
      }),
    );
  });
});
