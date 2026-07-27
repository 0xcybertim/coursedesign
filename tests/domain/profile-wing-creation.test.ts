import { describe, expect, it } from "vitest";
import benchmark from "../../docs/phase-1h/vectorization-benchmark-results.json";
import {
  createLocalDesignLibrary,
  deriveProfileWingPrototypeFromCreation,
  profileWingAppearance,
  saveProfileWingRevision,
} from "@/domain/design";
import {
  appendProfileWingCandidate,
  appendProfileWingDecision,
  createEmptyProfileWingCreationWorkspace,
  createProfileWingCandidate,
  parseLocalProfileWingCreationWorkspace,
  serializeLocalProfileWingCreationWorkspace,
  validateAcceptedProfileWingCreation,
  type ProfileWingCreationCandidate,
} from "@/domain/profile-wing-creation";
import type { SilhouetteVectorizationResult } from "@/domain/silhouette";

const dog = benchmark.results.find(
  (result) => result.fixtureId === "clean-dog-side",
);
if (!dog) throw new Error("Missing clean dog evidence.");
const acceptedVectorization =
  dog.result as unknown as SilhouetteVectorizationResult;

function candidate(
  vectorization: SilhouetteVectorizationResult = acceptedVectorization,
) {
  return createProfileWingCandidate({
    candidateId: "candidate-user-dog-001",
    source: {
      sourceId: "upload-aaaaaaaaaaaaaaaaaaaaaaaa",
      sourceKind: "user_upload",
      sourceLabel: "my-dog.png",
      originalFilename: "my-dog.png",
      contentHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      mediaType: "image/jpeg",
      byteLength: 20_000,
      pixelWidth: 1200,
      pixelHeight: 800,
    },
    maskContentHash:
      vectorization.status === "accepted"
        ? vectorization.silhouette.sourceMaskSha256
        : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    maskByteLength: 12_000,
    maskWidth: 480,
    maskHeight: 480,
    provenance: {
      provider: "remove-bg",
      adapterVersion: "1.0.0-profile-wing-remove-bg",
      providerRequestId: "provider-request-redacted",
      requestedAt: "2026-07-23T11:00:00.000Z",
      automaticRetries: 0,
      requestCount: 1,
      outputMediaType: "image/png",
      privacyNote: "remove-bg-api-immediate-deletion",
    },
    vectorization,
    createdAt: "2026-07-23T11:00:01.000Z",
  });
}

function acceptedCreation(item = candidate()) {
  const appended = appendProfileWingCandidate(
    createEmptyProfileWingCreationWorkspace(),
    item,
  );
  expect(appended.ok).toBe(true);
  if (!appended.ok) throw new Error(appended.error.message);
  const decided = appendProfileWingDecision(appended.value, {
    decisionId: "decision-user-dog-001",
    candidateId: item.candidateId,
    action: "accepted_for_future_prototyping",
    createdAt: "2026-07-23T11:01:00.000Z",
  });
  expect(decided.ok).toBe(true);
  if (!decided.ok) throw new Error(decided.error.message);
  return decided.value;
}

describe("user-created Profile Wing integrity boundary", () => {
  it("round-trips source, one provider call, vectorization, and decision hashes", () => {
    const accepted = acceptedCreation();
    const serialized = serializeLocalProfileWingCreationWorkspace(
      accepted.workspace,
    );
    expect(parseLocalProfileWingCreationWorkspace(serialized)).toEqual({
      ok: true,
      value: accepted.workspace,
    });
    expect(accepted.candidate.candidateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(accepted.decision.decisionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(accepted.candidate.provenance).toMatchObject({
      provider: "remove-bg",
      requestCount: 1,
      automaticRetries: 0,
    });
  });

  it("rejects candidate and decision tampering", () => {
    const accepted = acceptedCreation();
    const tamperedCandidate = {
      ...accepted.workspace,
      candidates: [
        {
          ...accepted.candidate,
          maskWidth: accepted.candidate.maskWidth + 1,
        },
      ],
    };
    expect(
      parseLocalProfileWingCreationWorkspace(JSON.stringify(tamperedCandidate)),
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid_candidate" },
    });
    const tamperedDecision = {
      ...accepted.workspace,
      decisions: [
        {
          ...accepted.decision,
          action: "retained_without_conversion",
        },
      ],
    };
    expect(
      parseLocalProfileWingCreationWorkspace(JSON.stringify(tamperedDecision)),
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid_decision" },
    });
  });

  it("cannot accept a rejected vectorization result", () => {
    const rejected = candidate({
      status: "rejected",
      silhouette: null,
      findings: [
        {
          code: "empty_mask",
          message: "No significant foreground subject remains after cleanup.",
        },
      ],
      cleanup: {
        sourceWidth: 480,
        sourceHeight: 480,
        binaryThreshold: 128,
        removedIslandCount: 0,
        removedIslandPixels: 0,
        significantComponentCount: 0,
        retainedForegroundPixels: 0,
        retainedForegroundFraction: 0,
        enclosedHoleCount: 0,
        maximumCoreRadiusPixels: 0,
      },
    });
    const appended = appendProfileWingCandidate(
      createEmptyProfileWingCreationWorkspace(),
      rejected,
    );
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    expect(
      appendProfileWingDecision(appended.value, {
        decisionId: "decision-rejected-001",
        candidateId: rejected.candidateId,
        action: "accepted_for_future_prototyping",
        createdAt: "2026-07-23T11:02:00.000Z",
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "ineligible_decision" },
    });
  });

  it("derives and saves an immutable user-source revision through the existing library", () => {
    const accepted = acceptedCreation();
    expect(
      validateAcceptedProfileWingCreation({
        candidate: accepted.candidate,
        decision: accepted.decision,
      }),
    ).toMatchObject({ ok: true });
    const derived = deriveProfileWingPrototypeFromCreation({
      candidate: accepted.candidate,
      decision: accepted.decision,
      appearance: profileWingAppearance("red"),
    });
    expect(derived.ok).toBe(true);
    if (!derived.ok) throw new Error(derived.error.message);
    expect(derived.value.source).toMatchObject({
      fixtureId: "upload-aaaaaaaaaaaaaaaaaaaaaaaa",
      sourceKind: "user_upload",
      sourceLabel: "my-dog.png",
      sourceContentHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      provider: "remove-bg",
      decisionHash: accepted.decision.decisionHash,
    });
    expect(derived.value.renderManifest.projectionParity).toMatchObject({
      exactSharedGeometry: true,
      twoDProfileGeometrySha256: derived.value.renderManifest.geometrySha256,
      threeDExtrusionSourceGeometrySha256:
        derived.value.renderManifest.geometrySha256,
    });
    expect(derived.value.appearance).toEqual(profileWingAppearance("red"));
    expect(derived.value.renderManifest.appearance).toEqual(
      profileWingAppearance("red"),
    );

    const library = createLocalDesignLibrary({
      now: "2026-07-23T11:00:00.000Z",
      draftId: "draft-user-creation",
    });
    const saved = saveProfileWingRevision(library, {
      prototype: derived.value,
      revisionId: "revision-user-dog-001",
      now: "2026-07-23T11:03:00.000Z",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.profileWingRevisions[0]).toMatchObject({
      designId: "local-profile-wing-upload-aaaaaaaaaaaaaaaaaaaaaaaa",
      ordinal: 1,
      snapshot: {
        prototype: {
          appearance: {
            frameColor: "red",
          },
        },
        provenance: {
          sourceKind: "user_upload",
          sourceLabel: "my-dog.png",
          provider: "remove-bg",
        },
      },
    });
  });

  it("rejects an acceptance paired with another candidate", () => {
    const accepted = acceptedCreation();
    const other = {
      ...accepted.candidate,
      candidateId: "candidate-user-dog-002",
    } as ProfileWingCreationCandidate;
    expect(
      validateAcceptedProfileWingCreation({
        candidate: other,
        decision: accepted.decision,
      }),
    ).toMatchObject({ ok: false });
  });
});
