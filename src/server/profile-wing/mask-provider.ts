export const REMOVE_BG_PROFILE_ENDPOINT = "https://api.remove.bg/v1.0/removebg";
export const REMOVE_BG_PROFILE_ADAPTER_VERSION = "1.0.0-profile-wing-remove-bg";
export const DETERMINISTIC_PROFILE_MASK_ADAPTER_VERSION =
  "1.0.0-profile-wing-deterministic";

export interface ProfileWingMaskProviderInput {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/png" | "image/jpeg";
  readonly filename: string;
  readonly signal: AbortSignal;
}

export interface ProfileWingMaskProviderResult {
  readonly bytes: Uint8Array;
  readonly provider: "remove-bg" | "deterministic-test";
  readonly adapterVersion: string;
  readonly providerRequestId: string | null;
}

export interface ProfileWingMaskProvider {
  readonly providerName: "remove-bg" | "deterministic-test";
  removeBackground(
    input: ProfileWingMaskProviderInput,
  ): Promise<ProfileWingMaskProviderResult>;
}

function providerFailure(
  kind:
    | "provider_rejection"
    | "rate_limit"
    | "malformed_response"
    | "unknown_provider_failure",
  status?: number,
) {
  return Object.assign(new Error(kind), {
    profileWingMaskFailureKind: kind,
    status,
  });
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

export function createRemoveBgProfileMaskProvider(options: {
  readonly apiKey: string;
  readonly request?: typeof fetch;
}): ProfileWingMaskProvider {
  const request = options.request ?? fetch;
  return {
    providerName: "remove-bg",
    async removeBackground(input) {
      const form = new FormData();
      form.append(
        "image_file",
        new Blob([input.bytes.slice().buffer as ArrayBuffer], {
          type: input.mediaType,
        }),
        input.filename,
      );
      form.append("size", "preview");
      form.append("format", "png");
      form.append("type", "auto");
      const response = await request(REMOVE_BG_PROFILE_ENDPOINT, {
        method: "POST",
        headers: { "X-Api-Key": options.apiKey },
        body: form,
        signal: input.signal,
      });
      if (!response.ok)
        throw providerFailure(
          response.status === 429 ? "rate_limit" : "provider_rejection",
          response.status,
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        !isPng(bytes) ||
        !response.headers.get("content-type")?.includes("image/png")
      )
        throw providerFailure("malformed_response", 502);
      return {
        bytes,
        provider: "remove-bg",
        adapterVersion: REMOVE_BG_PROFILE_ADAPTER_VERSION,
        providerRequestId:
          response.headers.get("x-request-id") ??
          response.headers.get("x-kaleido-request-id"),
      };
    },
  };
}

export function createDeterministicProfileMaskProvider(
  bytes: Uint8Array,
): ProfileWingMaskProvider {
  if (!isPng(bytes))
    throw new Error("Deterministic Profile Wing mask must be a PNG.");
  return {
    providerName: "deterministic-test",
    async removeBackground(input) {
      if (input.signal.aborted) throw input.signal.reason;
      return {
        bytes,
        provider: "deterministic-test",
        adapterVersion: DETERMINISTIC_PROFILE_MASK_ADAPTER_VERSION,
        providerRequestId: null,
      };
    },
  };
}
