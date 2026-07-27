import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleProfileWingMaskRequest,
  POST,
} from "@/app/api/profile-wings/mask/route";
import { vectorizeSilhouetteMask } from "@/domain/silhouette";
import {
  prepareProfileWingSource,
  profileWingBlobBytes,
} from "@/components/profile-wing/profile-wing-source";
import { deterministicConceptCutout } from "@/server/profile-wing/deterministic-concept-cutout";
import {
  createDeterministicProfileMaskProvider,
  createRemoveBgProfileMaskProvider,
  createSourceAwareProfileMaskProvider,
} from "@/server/profile-wing/mask-provider";
import {
  getProfileWingMaskRouteAvailability,
  getProfileWingMaskRouteAvailabilityForHosts,
} from "@/server/profile-wing/request-policy";
import { decodePng } from "../../tools/phase-1h/png";

const inputBytes = readFileSync(
  "tests/fixtures/phase-1h/input/clean-dog-side.png",
);
const outputBytes = readFileSync(
  "docs/phase-1h/remove-bg-live-masks/clean-dog-side.png",
);
const enabled = {
  enabled: true,
  provider: "deterministic" as const,
  reason: "enabled" as const,
};

function request(
  overrides: {
    readonly origin?: string;
    readonly hash?: string;
    readonly consent?: boolean;
    readonly sourceKind?: "user_upload" | "generated_concept";
    readonly generatedConceptConversionConfirmed?: boolean;
    readonly generatedConceptSubject?: string;
    readonly bytes?: Uint8Array;
  } = {},
) {
  const requestBytes = overrides.bytes ?? inputBytes;
  const values = new Map<string, unknown>();
  values.set("image", {
    name: "clean-dog-side.png",
    size: requestBytes.byteLength,
    type: "image/png",
    arrayBuffer: async () =>
      requestBytes.buffer.slice(
        requestBytes.byteOffset,
        requestBytes.byteOffset + requestBytes.byteLength,
      ) as ArrayBuffer,
  });
  values.set("sessionId", "browser-session-profile-wing");
  values.set(
    "sourceId",
    overrides.sourceKind === "generated_concept"
      ? "concept-aaaaaaaaaaaaaaaaaaaaaaaa"
      : "upload-aaaaaaaaaaaaaaaaaaaaaaaa",
  );
  values.set("sourceKind", overrides.sourceKind ?? "user_upload");
  values.set(
    "generatedConceptSubject",
    overrides.generatedConceptSubject ?? "",
  );
  values.set(
    "sourceContentHash",
    overrides.hash ?? createHash("sha256").update(requestBytes).digest("hex"),
  );
  values.set(
    "generatedConceptConversionConfirmed",
    String(overrides.generatedConceptConversionConfirmed ?? false),
  );
  for (const key of [
    "rightsConfirmed",
    "providerDisclosureConfirmed",
    "noIdentifiablePeopleConfirmed",
    "singleSubjectConfirmed",
  ])
    values.set(key, String(overrides.consent ?? true));
  const controller = new AbortController();
  return {
    url: "http://127.0.0.1:3000/api/profile-wings/mask",
    headers: new Headers({
      origin: overrides.origin ?? "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
    }),
    signal: controller.signal,
    formData: async () =>
      ({
        get: (key: string) => values.get(key) ?? null,
      }) as FormData,
  } as Request;
}

describe("Profile Wing mask route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires local enablement, provider selection, and a server credential", () => {
    expect(
      getProfileWingMaskRouteAvailability({}, "localhost:3000").reason,
    ).toBe("developer_flag_missing");
    expect(
      getProfileWingMaskRouteAvailability(
        { PROFILE_WING_CREATION_ENABLED: "true" },
        "localhost:3000",
      ).reason,
    ).toBe("provider_configuration_missing");
    expect(
      getProfileWingMaskRouteAvailability(
        {
          PROFILE_WING_CREATION_ENABLED: "true",
          PROFILE_WING_MASK_PROVIDER: "remove-bg",
        },
        "localhost:3000",
      ).reason,
    ).toBe("provider_credential_missing");
    expect(
      getProfileWingMaskRouteAvailabilityForHosts(
        {
          PROFILE_WING_CREATION_ENABLED: "true",
          PROFILE_WING_MASK_PROVIDER: "remove-bg",
          REMOVE_BG_API_KEY: "server-only",
        },
        ["localhost:3000", "example.com"],
      ).reason,
    ).toBe("non_local_host");
  });

  it("returns one no-store PNG with zero-retry provenance", async () => {
    const response = await handleProfileWingMaskRequest(request(), {
      availability: enabled,
      provider: createDeterministicProfileMaskProvider(outputBytes),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-profile-wing-provider")).toBe(
      "deterministic-test",
    );
    expect(response.headers.get("x-profile-wing-automatic-retries")).toBe("0");
    expect(response.headers.get("x-profile-wing-request-count")).toBe("1");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(outputBytes);
  });

  it("accepts app-generated concepts without pretending upload ownership was confirmed", async () => {
    const response = await handleProfileWingMaskRequest(
      request({
        sourceKind: "generated_concept",
        consent: false,
        generatedConceptConversionConfirmed: true,
      }),
      {
        availability: enabled,
        provider: createDeterministicProfileMaskProvider(outputBytes),
      },
    );
    expect(response.status).toBe(200);
  });

  it("creates distinct accepted silhouettes from deterministic concept subjects", () => {
    const subjects = ["butterfly", "castle", "horse"] as const;
    const hashes = subjects.map((subject) => {
      const bytes = deterministicConceptCutout(subject);
      const decoded = decodePng(bytes);
      const alpha = new Uint8Array(decoded.width * decoded.height);
      for (let pixel = 0; pixel < alpha.length; pixel += 1)
        alpha[pixel] = decoded.rgba[pixel * 4 + 3] ?? 0;
      const result = vectorizeSilhouetteMask({
        width: decoded.width,
        height: decoded.height,
        values: alpha,
        sourceMaskSha256: createHash("sha256").update(bytes).digest("hex"),
      });
      expect(
        result.status,
        `${subject}: ${JSON.stringify(result.findings)}`,
      ).toBe("accepted");
      return createHash("sha256").update(bytes).digest("hex");
    });
    expect(new Set(hashes).size).toBe(subjects.length);
  });

  it("keeps generated concepts local when uploaded photos use remove.bg", async () => {
    const uploadRequest = vi.fn(async () => ({
      bytes: new Uint8Array(outputBytes),
      provider: "remove-bg" as const,
      adapterVersion: "remove-bg-test",
      providerRequestId: "upload-request",
    }));
    const provider = createSourceAwareProfileMaskProvider({
      uploadProvider: {
        providerName: "remove-bg",
        removeBackground: uploadRequest,
      },
      generatedConceptProvider: createDeterministicProfileMaskProvider(
        deterministicConceptCutout("butterfly"),
      ),
    });
    const generated = await provider.removeBackground({
      bytes: inputBytes,
      mediaType: "image/png",
      filename: "concept.png",
      sourceKind: "generated_concept",
      generatedConceptSubject: "butterfly",
      signal: new AbortController().signal,
    });
    expect(provider.providerName).toBe("remove-bg");
    expect(generated.provider).toBe("deterministic-test");
    expect(generated.bytes).toEqual(deterministicConceptCutout("butterfly"));
    expect(uploadRequest).not.toHaveBeenCalled();

    await provider.removeBackground({
      bytes: inputBytes,
      mediaType: "image/png",
      filename: "uploaded-photo.png",
      sourceKind: "user_upload",
      generatedConceptSubject: null,
      signal: new AbortController().signal,
    });
    expect(uploadRequest).toHaveBeenCalledOnce();
  });

  it("preserves generated PNG alpha and uses that exact outline as the local mask", async () => {
    const generatedBytes = deterministicConceptCutout("butterfly");
    const generatedBlob = new Blob([generatedBytes], { type: "image/png" });
    const prepared = await prepareProfileWingSource(
      {
        blob: generatedBlob,
        filename: "generated-butterfly.png",
        declaredMediaType: "image/png",
        sourceKind: "generated_concept",
        sourceLabel: "Generated butterfly",
      },
      {
        decode: async () => ({
          source: {} as CanvasImageSource,
          width: 480,
          height: 480,
          close: () => undefined,
        }),
        createCanvas: () =>
          ({
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn(),
            })),
            toBlob: (callback: (blob: Blob | null) => void) =>
              callback(generatedBlob),
          }) as unknown as HTMLCanvasElement,
        store: async () => ({ ok: true as const, value: "stored" }),
      },
    );
    expect(prepared.metadata.mediaType).toBe("image/png");
    expect(await profileWingBlobBytes(prepared.blob)).toEqual(generatedBytes);

    const provider = createSourceAwareProfileMaskProvider({
      uploadProvider: createDeterministicProfileMaskProvider(outputBytes),
      generatedConceptProvider: createDeterministicProfileMaskProvider(
        (input) => input.bytes,
      ),
    });
    const result = await provider.removeBackground({
      bytes: generatedBytes,
      mediaType: "image/png",
      filename: "generated-butterfly.png",
      sourceKind: "generated_concept",
      generatedConceptSubject: "giraffe",
      signal: new AbortController().signal,
    });
    expect(result.bytes).toEqual(generatedBytes);

    vi.stubEnv("PROFILE_WING_CREATION_ENABLED", "true");
    vi.stubEnv("PROFILE_WING_MASK_PROVIDER", "remove-bg");
    vi.stubEnv("REMOVE_BG_API_KEY", "server-only-not-used");
    const response = await POST(
      request({
        bytes: generatedBytes,
        sourceKind: "generated_concept",
        consent: false,
        generatedConceptConversionConfirmed: true,
        generatedConceptSubject: "giraffe",
      }),
    );
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      generatedBytes,
    );
  });

  it("requires explicit conversion confirmation for app-generated concepts", async () => {
    const response = await handleProfileWingMaskRequest(
      request({
        sourceKind: "generated_concept",
        consent: true,
        generatedConceptConversionConfirmed: false,
      }),
      {
        availability: enabled,
        provider: createDeterministicProfileMaskProvider(outputBytes),
      },
    );
    expect(response.status).toBe(422);
  });

  it("blocks cross-origin, missing-consent, and tampered-byte requests before the provider", async () => {
    const provider = createDeterministicProfileMaskProvider(outputBytes);
    expect(
      (
        await handleProfileWingMaskRequest(
          request({ origin: "https://example.com" }),
          { availability: enabled, provider },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleProfileWingMaskRequest(request({ consent: false }), {
          availability: enabled,
          provider,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await handleProfileWingMaskRequest(
          request({
            hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          }),
          { availability: enabled, provider },
        )
      ).status,
    ).toBe(400);
  });

  it("returns a typed disabled response without calling a provider", async () => {
    const provider = createDeterministicProfileMaskProvider(outputBytes);
    const spy = vi.spyOn(provider, "removeBackground");
    const response = await handleProfileWingMaskRequest(request(), {
      availability: {
        enabled: false,
        provider: null,
        reason: "developer_flag_missing",
      },
      provider: null,
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends the official multipart fields and server-only key exactly once", async () => {
    const requestMock = vi.fn(async (_url: string | URL | Request, init) => {
      const form = init?.body as FormData;
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe(
        "test-key-never-returned",
      );
      expect(form.get("size")).toBe("preview");
      expect(form.get("format")).toBe("png");
      expect(form.get("type")).toBe("auto");
      expect(form.get("image_file")).toBeInstanceOf(Blob);
      return new Response(outputBytes, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "x-request-id": "provider-request-redacted",
        },
      });
    });
    const provider = createRemoveBgProfileMaskProvider({
      apiKey: "test-key-never-returned",
      request: requestMock as typeof fetch,
    });
    const result = await provider.removeBackground({
      bytes: inputBytes,
      mediaType: "image/png",
      filename: "dog.png",
      sourceKind: "user_upload",
      generatedConceptSubject: null,
      signal: new AbortController().signal,
    });
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      provider: "remove-bg",
      providerRequestId: "provider-request-redacted",
    });
    expect(result.bytes).toEqual(new Uint8Array(outputBytes));
  });
});
