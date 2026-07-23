import { describe, expect, it, vi } from "vitest";
import {
  createDeterministicConceptProvider,
  type ConceptProvider,
} from "@/server/generation/concept-provider";
import type { ConceptConstraints } from "@/domain/generation";
import { handleConceptRequest } from "@/app/api/generation/concepts/route";
import {
  getGenerationRouteAvailability,
  getGenerationRouteAvailabilityForHosts,
  structuredProviderPrompt,
  validateConceptApiRequest,
} from "@/server/generation/request-policy";
import {
  createOpenAIConceptProvider,
  openAIClientOptions,
} from "@/server/generation/openai-concept-provider";

const enabled = {
  enabled: true,
  provider: "deterministic" as const,
  reason: "enabled" as const,
};

const baseConstraints = {
  family: "profile-wing-vertical-v1" as const,
  silhouetteSubject: "butterfly",
  poleCount: 4 as const,
  colors: "navy and gold",
  lowerElementPreference: "none" as const,
  sponsorArea: "subtle" as const,
  style: "graphic" as const,
};

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "browser-session-1234",
    requestId: "request-1234",
    action: "generate",
    prompt: "A butterfly-shaped jump",
    constraints: baseConstraints,
    photoDerivative: null,
    photoConsent: null,
    referencePhoto: null,
    sourceConcept: null,
    ...overrides,
  };
}

function request(body: unknown, signal?: AbortSignal) {
  return new Request("http://127.0.0.1:3000/api/generation/concepts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:3000",
    },
    body: JSON.stringify(body),
    signal,
  });
}

describe("Phase 1G concept route", () => {
  it("assembles one exact authoritative brief and allows optional creative direction", () => {
    const withoutDirection = validateConceptApiRequest(
      validBody({ prompt: "" }),
    );
    expect(withoutDirection.ok).toBe(true);
    const validated = validateConceptApiRequest(
      validBody({ prompt: "Raised ears and a calm side profile." }),
    );
    if (!validated.ok) throw new Error(validated.message);
    expect(structuredProviderPrompt(validated.value)).toBe(
      [
        "Authoritative generation brief:",
        "Creative direction: Raised ears and a calm side profile.",
        "Family: Profile Wing Vertical.",
        "Silhouette subject: butterfly.",
        "Pole structure: Exactly four poles · locked.",
        "Colors: navy and gold.",
        "Lower element: none.",
        "Sponsor area: subtle.",
        "Style: graphic.",
        "Reference photo: None.",
      ].join("\n"),
    );
  });

  it("rejects obvious creative-direction and structured-subject conflicts", () => {
    expect(
      validateConceptApiRequest(
        validBody({
          prompt: "Friendly Labrador in side profile with raised ears.",
        }),
      ),
    ).toMatchObject({
      ok: false,
      kind: "invalid_request",
      message: expect.stringMatching(/mentions dog.*subject is butterfly/i),
    });
  });

  it("creates distinct, input-responsive deterministic fixtures with an honest fallback", async () => {
    const provider = createDeterministicConceptProvider();
    const fixture = async (
      silhouetteSubject: string,
      overrides: Partial<ConceptConstraints> = {},
      action: "generate" | "refine" = "generate",
    ) => {
      const response = await provider.generate({
        requestId: `fixture-${silhouetteSubject}`,
        prompt: "assembled brief",
        creativeDirection:
          action === "refine" ? "Make the edge markings larger." : "",
        constraints: {
          ...baseConstraints,
          silhouetteSubject,
          ...overrides,
        },
        action,
        referencePhoto: null,
        sourceConcept: null,
        signal: new AbortController().signal,
      });
      return response.images.map((image) =>
        new TextDecoder().decode(image.bytes),
      );
    };

    const dog = await fixture("dog", {
      colors: "rust, cream and navy",
      lowerElementPreference: "gate",
      sponsorArea: "prominent",
      style: "playful",
    });
    const butterfly = await fixture("butterfly");
    const castle = await fixture("castle");
    expect(dog[0]).toContain('data-fixture-subject="dog"');
    expect(butterfly[0]).toContain('data-fixture-subject="butterfly"');
    expect(castle[0]).toContain('data-fixture-subject="castle"');
    expect(new Set([dog[0], butterfly[0], castle[0]]).size).toBe(3);
    expect(dog[0]).toContain('data-requested-colors="navy, rust, cream"');
    expect(dog[0]).toContain("#09245c");
    expect(dog[0]).toContain('data-lower-element="gate"');
    expect(dog[0]).toContain('data-sponsor-area="prominent"');
    expect(dog[0]).toContain(
      "STYLE: PLAYFUL · LOWER: GATE · SPONSOR: PROMINENT",
    );
    expect(new Set(dog).size).toBe(4);

    const generic = await fixture("dragon");
    expect(generic[0]).toContain('data-fixture-subject="generic"');
    expect(generic[0]).toContain(
      "GENERIC FALLBACK · SUBJECT NOT SHAPE-MATCHED",
    );
    const refined = await fixture("dog", {}, "refine");
    expect(refined[0]).toContain(
      "REFINEMENT FIXTURE: Make the edge markings larger.",
    );
  });

  it("requires explicit local flag, provider configuration, and credential", () => {
    expect(getGenerationRouteAvailability({}, "localhost:3000").reason).toBe(
      "developer_flag_missing",
    );
    expect(
      getGenerationRouteAvailability(
        { PHASE_1G_ENABLED: "true" },
        "localhost:3000",
      ).reason,
    ).toBe("provider_configuration_missing");
    expect(
      getGenerationRouteAvailability(
        { PHASE_1G_ENABLED: "true", PHASE_1G_PROVIDER: "openai" },
        "localhost:3000",
      ).reason,
    ).toBe("provider_credential_missing");
    expect(
      getGenerationRouteAvailability(
        {
          PHASE_1G_ENABLED: "true",
          PHASE_1G_PROVIDER: "openai",
          OPENAI_API_KEY: "present-not-printed",
        },
        "example.com",
      ).reason,
    ).toBe("non_local_host");
    expect(
      getGenerationRouteAvailabilityForHosts(
        {
          PHASE_1G_ENABLED: "true",
          PHASE_1G_PROVIDER: "openai",
          OPENAI_API_KEY: "present-not-printed",
        },
        ["localhost:3000", "example.com"],
      ).reason,
    ).toBe("non_local_host");
  });

  it("returns disabled and successful responses with no-store headers", async () => {
    const disabled = await handleConceptRequest(request(validBody()), {
      availability: {
        enabled: false,
        provider: null,
        reason: "developer_flag_missing",
      },
      provider: null,
    });
    expect(disabled.status).toBe(404);
    expect(disabled.headers.get("cache-control")).toBe("no-store");

    const response = await handleConceptRequest(request(validBody()), {
      availability: enabled,
      provider: createDeterministicConceptProvider(),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      requestId: "request-1234",
      images: [{ mediaType: "image/svg+xml" }, {}, {}, {}],
      provenance: { provider: "deterministic-test" },
    });
  });

  it("rejects cross-origin, oversized, policy, and missing-consent requests", async () => {
    const crossOrigin = new Request(
      "http://127.0.0.1:3000/api/generation/concepts",
      {
        method: "POST",
        headers: { origin: "https://example.com" },
        body: JSON.stringify(validBody()),
      },
    );
    expect(
      (
        await handleConceptRequest(crossOrigin, {
          availability: enabled,
          provider: createDeterministicConceptProvider(),
        })
      ).status,
    ).toBe(403);
    const oversized = request(validBody());
    oversized.headers.set("content-length", String(13 * 1024 * 1024));
    expect(
      (
        await handleConceptRequest(oversized, {
          availability: enabled,
          provider: createDeterministicConceptProvider(),
        })
      ).status,
    ).toBe(413);
    const policy = await handleConceptRequest(
      request(validBody({ prompt: "A portrait of a person" })),
      { availability: enabled, provider: createDeterministicConceptProvider() },
    );
    expect(await policy.json()).toMatchObject({
      ok: false,
      error: { kind: "policy_failure" },
    });
  });

  it("uses the incoming host header when the framework normalizes the request URL", async () => {
    const normalized = new Request(
      "http://localhost:3000/api/generation/concepts",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
        },
        body: JSON.stringify(validBody()),
      },
    );
    const response = await handleConceptRequest(normalized, {
      availability: enabled,
      provider: createDeterministicConceptProvider(),
    });
    expect(response.status).toBe(200);
  });

  it("enforces one active request per browser session", async () => {
    const provider = createDeterministicConceptProvider({ delayMs: 40 });
    const first = handleConceptRequest(request(validBody()), {
      availability: enabled,
      provider,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await handleConceptRequest(
      request(validBody({ requestId: "request-5678" })),
      { availability: enabled, provider },
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      error: { kind: "active_request" },
    });
    await first;
  });

  it("discards late provider output after cancellation", async () => {
    const controller = new AbortController();
    const ignoresAbort: ConceptProvider = {
      ...createDeterministicConceptProvider(),
      async generate(providerRequest) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return createDeterministicConceptProvider().generate({
          ...providerRequest,
          signal: new AbortController().signal,
        });
      },
    };
    const pending = handleConceptRequest(
      request(validBody(), controller.signal),
      {
        availability: enabled,
        provider: ignoresAbort,
      },
    );
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(499);
    expect(await response.json()).toMatchObject({
      error: { kind: "cancellation" },
    });
  });

  it("maps typed provider failures without logging prompt or image bodies", async () => {
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    const response = await handleConceptRequest(request(validBody()), {
      availability: enabled,
      provider: createDeterministicConceptProvider({ failure: "rate_limit" }),
    });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { kind: "rate_limit" },
    });
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ["policy_failure", 422],
    ["provider_rejection", 422],
    ["malformed_response", 502],
  ] as const)("maps %s provider failures", async (kind, status) => {
    const provider: ConceptProvider = {
      ...createDeterministicConceptProvider(),
      async generate() {
        throw Object.assign(new Error("typed provider failure"), {
          generationFailureKind: kind,
        });
      },
    };
    const response = await handleConceptRequest(request(validBody()), {
      availability: enabled,
      provider,
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { kind } });
  });

  it("maps timeouts, unknown failures, and incomplete batches", async () => {
    const slowProvider: ConceptProvider = {
      ...createDeterministicConceptProvider(),
      async generate(providerRequest) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return createDeterministicConceptProvider().generate({
          ...providerRequest,
          signal: new AbortController().signal,
        });
      },
    };
    const timeout = await handleConceptRequest(request(validBody()), {
      availability: enabled,
      provider: slowProvider,
      timeoutMs: 5,
    });
    expect(timeout.status).toBe(504);
    expect(await timeout.json()).toMatchObject({
      error: { kind: "timeout" },
    });

    const unknownProvider: ConceptProvider = {
      ...createDeterministicConceptProvider(),
      async generate() {
        throw new Error("unclassified provider failure");
      },
    };
    const unknown = await handleConceptRequest(request(validBody()), {
      availability: enabled,
      provider: unknownProvider,
    });
    expect(unknown.status).toBe(502);
    expect(await unknown.json()).toMatchObject({
      error: { kind: "unknown_provider_failure" },
    });

    const incompleteProvider: ConceptProvider = {
      ...createDeterministicConceptProvider(),
      async generate(providerRequest) {
        const complete =
          await createDeterministicConceptProvider().generate(providerRequest);
        return { ...complete, images: complete.images.slice(0, 3) };
      },
    };
    const incomplete = await handleConceptRequest(request(validBody()), {
      availability: enabled,
      provider: incompleteProvider,
    });
    expect(incomplete.status).toBe(502);
    expect(await incomplete.json()).toMatchObject({
      error: { kind: "malformed_response" },
    });
  });

  it("maps OpenAI generation/edit requests with n=4, cancellation, and zero retries", async () => {
    expect(openAIClientOptions("secret-not-printed")).toEqual({
      apiKey: "secret-not-printed",
      maxRetries: 0,
    });
    const generate = vi.fn(() => ({
      withResponse: async () => ({
        data: {
          data: [1, 2, 3, 4].map(() => ({ b64_json: "/9j/" })),
          output_format: "jpeg" as const,
        },
        response: new Response(),
        request_id: "openai-request",
      }),
    }));
    const edit = vi.fn(() => ({
      withResponse: async () => ({
        data: {
          data: [1, 2, 3, 4].map(() => ({ b64_json: "/9j/" })),
          output_format: "jpeg" as const,
        },
        response: new Response(),
        request_id: "openai-edit",
      }),
    }));
    const provider = createOpenAIConceptProvider({
      apiKey: "unused",
      client: { images: { generate, edit } } as never,
    });
    const signal = new AbortController().signal;
    const base = {
      requestId: "request-openai",
      prompt: "Butterfly jump",
      creativeDirection: "Raised wing tips.",
      constraints: baseConstraints,
      action: "generate" as const,
      referencePhoto: null,
      sourceConcept: null,
      signal,
    };
    expect((await provider.generate(base)).images).toHaveLength(4);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2-2026-04-21",
        n: 4,
        quality: "low",
      }),
      expect.objectContaining({ signal, maxRetries: 0 }),
    );
    await provider.generate({
      ...base,
      action: "refine",
      sourceConcept: {
        bytes: new Uint8Array([1]),
        mediaType: "image/png",
        filename: "concept.png",
      },
    });
    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2-2026-04-21",
        n: 4,
        image: expect.any(File),
      }),
      expect.objectContaining({ signal, maxRetries: 0 }),
    );
  });

  it("rejects OpenAI bytes that do not match the declared output format", async () => {
    const generate = vi.fn(() => ({
      withResponse: async () => ({
        data: {
          data: [1, 2, 3, 4].map(() => ({ b64_json: "AQ==" })),
          output_format: "jpeg" as const,
        },
        response: new Response(),
        request_id: "openai-malformed",
      }),
    }));
    const provider = createOpenAIConceptProvider({
      apiKey: "unused",
      client: { images: { generate, edit: vi.fn() } } as never,
    });
    await expect(
      provider.generate({
        requestId: "request-malformed",
        prompt: "Butterfly jump",
        creativeDirection: "Raised wing tips.",
        constraints: baseConstraints,
        action: "generate",
        referencePhoto: null,
        sourceConcept: null,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      generationFailureKind: "malformed_response",
    });
  });
});
