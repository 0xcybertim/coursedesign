import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { handleProfileWingMaskRequest } from "@/app/api/profile-wings/mask/route";
import {
  createDeterministicProfileMaskProvider,
  createRemoveBgProfileMaskProvider,
} from "@/server/profile-wing/mask-provider";
import {
  getProfileWingMaskRouteAvailability,
  getProfileWingMaskRouteAvailabilityForHosts,
} from "@/server/profile-wing/request-policy";

const inputBytes = readFileSync(
  "tests/fixtures/phase-1h/input/clean-dog-side.png",
);
const outputBytes = readFileSync(
  "docs/phase-1h/remove-bg-live-masks/clean-dog-side.png",
);
const contentHash = createHash("sha256").update(inputBytes).digest("hex");
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
  } = {},
) {
  const values = new Map<string, unknown>();
  values.set("image", {
    name: "clean-dog-side.png",
    size: inputBytes.byteLength,
    type: "image/png",
    arrayBuffer: async () =>
      inputBytes.buffer.slice(
        inputBytes.byteOffset,
        inputBytes.byteOffset + inputBytes.byteLength,
      ) as ArrayBuffer,
  });
  values.set("sessionId", "browser-session-profile-wing");
  values.set("sourceId", "upload-aaaaaaaaaaaaaaaaaaaaaaaa");
  values.set("sourceKind", "user_upload");
  values.set("sourceContentHash", overrides.hash ?? contentHash);
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
