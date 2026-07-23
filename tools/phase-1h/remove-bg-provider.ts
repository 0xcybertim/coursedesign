import { alphaChannelToMaskPng } from "./png.ts";
import type {
  SubjectMaskProvider,
  SubjectMaskProviderResult,
} from "./photoroom-provider.ts";

export const REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg";
export const REMOVE_BG_PROVIDER_ADAPTER_VERSION =
  "1.0.0-phase1h-a-remove-bg" as const;
export const REMOVE_BG_MAX_RETRIES = 0 as const;
export const REMOVE_BG_MAXIMUM_COST_USD = 0 as const;

function parseNumber(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createRemoveBgSubjectMaskProvider(options: {
  readonly apiKey: string;
  readonly fetchImplementation?: typeof fetch;
}): SubjectMaskProvider {
  if (!options.apiKey) throw new Error("REMOVE_BG_API_KEY is required.");
  const request = options.fetchImplementation ?? fetch;
  return {
    provider: "remove-bg",
    adapterVersion: REMOVE_BG_PROVIDER_ADAPTER_VERSION,
    maxRetries: REMOVE_BG_MAX_RETRIES,
    async getMask({ fixtureId, inputPng, signal }) {
      const body = new FormData();
      const inputBuffer = inputPng.buffer.slice(
        inputPng.byteOffset,
        inputPng.byteOffset + inputPng.byteLength,
      ) as ArrayBuffer;
      body.append(
        "image_file",
        new Blob([inputBuffer], { type: "image/png" }),
        `${fixtureId}.png`,
      );
      body.append("size", "preview");
      body.append("format", "png");
      body.append("type", "auto");
      const startedAt = performance.now();
      const response = await request(REMOVE_BG_ENDPOINT, {
        method: "POST",
        headers: { "X-Api-Key": options.apiKey },
        body,
        signal,
      });
      const durationMs = Math.round(performance.now() - startedAt);
      if (!response.ok)
        throw Object.assign(
          new Error(`remove.bg returned HTTP ${response.status}.`),
          {
            providerFailureStatus: response.status,
            durationMs,
          },
        );
      const cutoutPng = new Uint8Array(await response.arrayBuffer());
      let maskPng: Uint8Array;
      try {
        maskPng = alphaChannelToMaskPng(cutoutPng);
      } catch {
        throw Object.assign(
          new Error("remove.bg returned an unsupported PNG cutout."),
          {
            providerFailureStatus: response.status,
            durationMs,
          },
        );
      }
      const result: SubjectMaskProviderResult = {
        maskPng,
        providerRequestId:
          response.headers.get("x-request-id") ??
          response.headers.get("request-id") ??
          null,
        uncertainty: null,
        durationMs,
        httpStatus: response.status,
        creditsCharged: parseNumber(response.headers.get("x-credits-charged")),
        freeCallsRemaining: parseNumber(
          response.headers.get("x-free-calls-remaining"),
        ),
      };
      return result;
    },
  };
}
