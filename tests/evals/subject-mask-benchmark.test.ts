import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  PHASE_1H_APPROVAL_TEXT,
  PHASE_1H_APPROVAL_TEXT_SHA256,
  validateLiveBenchmarkAuthorization,
} from "../../tools/phase-1h/authorization.ts";
import {
  REMOVE_BG_APPROVAL_TEXT,
  REMOVE_BG_APPROVAL_TEXT_SHA256,
  validateRemoveBgLiveBenchmarkAuthorization,
} from "../../tools/phase-1h/remove-bg-authorization.ts";
import {
  FIXTURE_HEIGHT,
  FIXTURE_WIDTH,
  renderSubjectMaskFixture,
  subjectMaskFixtures,
} from "../../tools/phase-1h/fixtures.ts";
import { evaluateSubjectMask } from "../../tools/phase-1h/evaluate-mask.ts";
import {
  encodeRgbaPng,
  maskToPng,
  maskValues,
  decodePng,
} from "../../tools/phase-1h/png.ts";
import { createPhotoroomSubjectMaskProvider } from "../../tools/phase-1h/photoroom-provider.ts";
import { createRemoveBgSubjectMaskProvider } from "../../tools/phase-1h/remove-bg-provider.ts";

describe("Phase 1H-A subject-mask benchmark", () => {
  it("requires a durable exact authorization record before live mode", () => {
    const authorization = {
      schemaVersion: "1.0.0-phase1h-a-authorization",
      status: "approved",
      approvedBy: "Tim",
      approvedAt: "2026-07-21T09:00:00.000Z",
      approvalText: PHASE_1H_APPROVAL_TEXT,
      approvalTextSha256: PHASE_1H_APPROVAL_TEXT_SHA256,
      provider: "photoroom",
      fixtureCounts: {
        clean: 20,
        empty: 3,
        multiSubject: 3,
        badlyOccluded: 3,
        total: 29,
      },
      maximumExternalCalls: 29,
      maxRetries: 0,
      maximumCostUsd: 0.58,
      expectedLatency: "30-90 seconds",
      dataLeavingMachine:
        "Only the 29 repository-generated 480 x 480 PNG fixture inputs",
      privacyAccepted: true,
    };
    expect(validateLiveBenchmarkAuthorization(authorization)).toBe(true);
    expect(
      validateLiveBenchmarkAuthorization({
        ...authorization,
        maximumExternalCalls: 30,
      }),
    ).toBe(false);
    expect(
      validateLiveBenchmarkAuthorization({
        ...authorization,
        privacyAccepted: false,
      }),
    ).toBe(false);
    expect(
      readFileSync("docs/phase-1h/PROVIDER_COMPARISON.md", "utf8"),
    ).toContain(`> ${PHASE_1H_APPROVAL_TEXT}`);
  });

  it("keeps the finite fixture contract at exactly 20 clean plus 3 per negative category", () => {
    const count = (category: string) =>
      subjectMaskFixtures.filter((fixture) => fixture.category === category)
        .length;
    expect(subjectMaskFixtures).toHaveLength(29);
    expect(count("clean")).toBe(20);
    expect(count("empty")).toBe(3);
    expect(count("multi_subject")).toBe(3);
    expect(count("badly_occluded")).toBe(3);
    expect(new Set(subjectMaskFixtures.map((fixture) => fixture.id)).size).toBe(
      29,
    );
    expect(
      subjectMaskFixtures.every(
        (fixture) =>
          fixture.expectedOutcome ===
          (fixture.category === "clean" ? "accept" : "reject"),
      ),
    ).toBe(true);
  });

  it("requires a separate exact remove.bg free-preview authorization", () => {
    const authorization = {
      schemaVersion: "1.0.0-phase1h-a-remove-bg-authorization",
      status: "approved",
      approvedBy: "Tim",
      approvedAt: "2026-07-22T12:00:00.000Z",
      approvalText: REMOVE_BG_APPROVAL_TEXT,
      approvalTextSha256: REMOVE_BG_APPROVAL_TEXT_SHA256,
      provider: "remove-bg",
      fixtureCounts: {
        clean: 20,
        empty: 3,
        multiSubject: 3,
        badlyOccluded: 3,
        total: 29,
      },
      maximumExternalCalls: 29,
      maxRetries: 0,
      maximumCostUsd: 0,
      expectedLatency: "30-90 seconds",
      dataLeavingMachine:
        "Only the 29 repository-generated 480 x 480 PNG fixture inputs",
      privacyAccepted: true,
      providerUncertaintyRequired: false,
      mandatoryVisualInspection: true,
    };
    expect(validateRemoveBgLiveBenchmarkAuthorization(authorization)).toBe(
      true,
    );
    expect(
      validateRemoveBgLiveBenchmarkAuthorization({
        ...authorization,
        maximumCostUsd: 0.01,
      }),
    ).toBe(false);
    expect(
      validateRemoveBgLiveBenchmarkAuthorization({
        ...authorization,
        mandatoryVisualInspection: false,
      }),
    ).toBe(false);
    expect(
      readFileSync("docs/phase-1h/REMOVE_BG_PROVIDER_SETUP.md", "utf8"),
    ).toContain(`> ${REMOVE_BG_APPROVAL_TEXT}`);
  });

  it("accepts every exact clean ground truth and visibly rejects every exact negative ground truth", () => {
    for (const fixture of subjectMaskFixtures) {
      const rendered = renderSubjectMaskFixture(fixture);
      const groundTruthPng = maskToPng(
        FIXTURE_WIDTH,
        FIXTURE_HEIGHT,
        rendered.groundTruthMask,
      );
      const evaluation = evaluateSubjectMask({
        maskPng: groundTruthPng,
        groundTruthPng,
        providerUncertainty: 0,
      });
      expect(evaluation.acceptedForDeterministicVectorization, fixture.id).toBe(
        fixture.expectedOutcome === "accept",
      );
      if (fixture.category === "empty")
        expect(evaluation.reasons, fixture.id).toContain(
          "foreground_too_small_or_empty",
        );
      if (fixture.category !== "clean" && fixture.category !== "empty")
        expect(evaluation.reasons, fixture.id).toContain(
          "not_exactly_one_significant_component",
        );
    }
  }, 10_000);

  it("makes one stateless Photoroom alpha-mask request with no retry path", async () => {
    const fixture = subjectMaskFixtures[0]!;
    const rendered = renderSubjectMaskFixture(fixture);
    const maskPng = maskToPng(
      FIXTURE_WIDTH,
      FIXTURE_HEIGHT,
      rendered.groundTruthMask,
    );
    const fetchImplementation = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(
          "test-key",
        );
        const form = init?.body as FormData;
        expect(form.get("channels")).toBe("alpha");
        expect(form.get("format")).toBe("png");
        expect(form.get("image_file")).toBeInstanceOf(Blob);
        return new Response(maskPng, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "x-request-id": "request-redacted",
            "x-uncertainty-score": "0.12",
          },
        });
      },
    );
    const provider = createPhotoroomSubjectMaskProvider({
      apiKey: "test-key",
      fetchImplementation,
    });
    const result = await provider.getMask({
      fixtureId: fixture.id,
      inputPng: maskPng,
      signal: new AbortController().signal,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(provider.maxRetries).toBe(0);
    expect(result.uncertainty).toBe(0.12);
    expect(result.providerRequestId).toBe("request-redacted");
  });

  it("makes one free-preview remove.bg request and extracts the PNG alpha channel", async () => {
    const fixture = subjectMaskFixtures[0]!;
    const rendered = renderSubjectMaskFixture(fixture);
    const rgba = new Uint8Array(FIXTURE_WIDTH * FIXTURE_HEIGHT * 4);
    for (let pixel = 0; pixel < rendered.groundTruthMask.byteLength; pixel += 1)
      rgba.set([36, 80, 120, rendered.groundTruthMask[pixel] ?? 0], pixel * 4);
    const cutoutPng = encodeRgbaPng({
      width: FIXTURE_WIDTH,
      height: FIXTURE_HEIGHT,
      rgba,
    });
    const fetchImplementation = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe(
          "test-remove-bg-key",
        );
        const form = init?.body as FormData;
        expect(form.get("size")).toBe("preview");
        expect(form.get("format")).toBe("png");
        expect(form.get("type")).toBe("auto");
        expect(form.get("image_file")).toBeInstanceOf(Blob);
        return new Response(cutoutPng, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "x-request-id": "remove-bg-request-redacted",
            "x-credits-charged": "0",
            "x-free-calls-remaining": "49",
          },
        });
      },
    );
    const provider = createRemoveBgSubjectMaskProvider({
      apiKey: "test-remove-bg-key",
      fetchImplementation,
    });
    const result = await provider.getMask({
      fixtureId: fixture.id,
      inputPng: cutoutPng,
      signal: new AbortController().signal,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(provider.maxRetries).toBe(0);
    expect(result.uncertainty).toBeNull();
    expect(result.creditsCharged).toBe(0);
    expect(result.freeCallsRemaining).toBe(49);
    expect(maskValues(decodePng(result.maskPng))).toEqual(
      rendered.groundTruthMask,
    );
  });
});
