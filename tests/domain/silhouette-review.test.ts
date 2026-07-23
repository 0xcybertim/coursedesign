import { describe, expect, it } from "vitest";
import {
  SILHOUETTE_REVIEW_EVIDENCE_SHA256,
  SILHOUETTE_REVIEW_SCHEMA_VERSION,
  appendSilhouetteDecision,
  createEmptySilhouetteReview,
  currentSilhouetteDecisions,
  parseLocalSilhouetteReview,
  serializeLocalSilhouetteReview,
  silhouetteReviewFixtures,
} from "../../src/domain/silhouette/index.ts";

describe("Phase 1H-B2 silhouette review decisions", () => {
  it("pins the exact immutable B1 evidence corpus", () => {
    const fixtures = silhouetteReviewFixtures();
    expect(fixtures).toHaveLength(29);
    expect(
      fixtures.filter(({ result }) => result.status === "accepted"),
    ).toHaveLength(18);
    expect(
      fixtures.filter(({ result }) => result.status === "rejected"),
    ).toHaveLength(11);
    expect(SILHOUETTE_REVIEW_EVIDENCE_SHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      new Set(fixtures.map((fixture) => fixture.resultIdentitySha256)).size,
    ).toBe(29);
  });

  it("appends hash-pinned decisions without changing prior events", () => {
    const empty = createEmptySilhouetteReview("2026-07-22T18:00:00.000Z");
    const accepted = appendSilhouetteDecision(empty, {
      decisionId: "decision-1",
      fixtureId: "clean-dog-side",
      action: "accepted_for_future_prototyping",
      createdAt: "2026-07-22T18:01:00.000Z",
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const retained = appendSilhouetteDecision(accepted.value, {
      decisionId: "decision-2",
      fixtureId: "clean-dog-side",
      action: "retained_without_conversion",
      createdAt: "2026-07-22T18:02:00.000Z",
    });
    expect(retained.ok).toBe(true);
    if (!retained.ok) return;
    expect(empty.decisions).toEqual([]);
    expect(retained.value.decisions).toHaveLength(2);
    expect(retained.value.decisions[0]).toEqual(accepted.value.decisions[0]);
    expect(
      retained.value.decisions.every(({ decisionHash }) =>
        /^[a-f0-9]{64}$/.test(decisionHash),
      ),
    ).toBe(true);
    expect(
      currentSilhouetteDecisions(retained.value).get("clean-dog-side")?.action,
    ).toBe("retained_without_conversion");
    expect(
      parseLocalSilhouetteReview(
        serializeLocalSilhouetteReview(retained.value),
      ),
    ).toEqual({ ok: true, value: retained.value });
  });

  it("never accepts rejected B1 evidence for future prototyping", () => {
    const result = appendSilhouetteDecision(createEmptySilhouetteReview(), {
      decisionId: "decision-rejected",
      fixtureId: "clean-bicycle",
      action: "accepted_for_future_prototyping",
      createdAt: "2026-07-22T18:03:00.000Z",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "ineligible_decision",
        message:
          "A rejected vectorization result cannot be accepted for prototyping.",
      },
    });
  });

  it("rejects unsupported, evidence-mismatched, and hash-tampered storage", () => {
    expect(
      parseLocalSilhouetteReview(
        JSON.stringify({
          ...createEmptySilhouetteReview(),
          schemaVersion: "future-version",
        }),
      ),
    ).toMatchObject({ ok: false, error: { kind: "unsupported_review" } });
    expect(
      parseLocalSilhouetteReview(
        JSON.stringify({
          ...createEmptySilhouetteReview(),
          evidenceSha256: "wrong",
        }),
      ),
    ).toMatchObject({ ok: false, error: { kind: "tampered_review" } });

    const valid = appendSilhouetteDecision(createEmptySilhouetteReview(), {
      decisionId: "decision-tamper",
      fixtureId: "clean-dog-side",
      action: "retained_without_conversion",
      createdAt: "2026-07-22T18:04:00.000Z",
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    const tampered = {
      ...valid.value,
      decisions: [
        {
          ...valid.value.decisions[0],
          action: "accepted_for_future_prototyping",
        },
      ],
    };
    expect(parseLocalSilhouetteReview(JSON.stringify(tampered))).toMatchObject({
      ok: false,
      error: { kind: "tampered_review" },
    });
  });

  it("uses a separate schema and never exposes product state", () => {
    const review = createEmptySilhouetteReview();
    expect(review.schemaVersion).toBe(SILHOUETTE_REVIEW_SCHEMA_VERSION);
    expect(review).not.toHaveProperty("obstacleDesignRevisionId");
    expect(review).not.toHaveProperty("configuration");
    expect(review).not.toHaveProperty("course");
  });
});
