export const PHOTOROOM_SEGMENT_ENDPOINT =
  "https://sdk.photoroom.com/v1/segment";
export const PHOTOROOM_PROVIDER_ADAPTER_VERSION = "1.0.0-phase1h-a" as const;
export const PHOTOROOM_MAX_RETRIES = 0 as const;
export const PHOTOROOM_COST_PER_REQUEST_USD = 0.02 as const;

export interface SubjectMaskProviderResult {
  readonly maskPng: Uint8Array;
  readonly providerRequestId: string | null;
  readonly uncertainty: number | null;
  readonly durationMs: number;
  readonly httpStatus: number;
  readonly creditsCharged?: number | null;
  readonly freeCallsRemaining?: number | null;
}

export interface SubjectMaskProvider {
  readonly provider: "photoroom" | "remove-bg";
  readonly adapterVersion: string;
  readonly maxRetries: typeof PHOTOROOM_MAX_RETRIES;
  getMask(options: {
    readonly fixtureId: string;
    readonly inputPng: Uint8Array;
    readonly signal: AbortSignal;
  }): Promise<SubjectMaskProviderResult>;
}

function parseUncertainty(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createPhotoroomSubjectMaskProvider(options: {
  readonly apiKey: string;
  readonly fetchImplementation?: typeof fetch;
}): SubjectMaskProvider {
  if (!options.apiKey) throw new Error("PHOTOROOM_API_KEY is required.");
  const request = options.fetchImplementation ?? fetch;
  return {
    provider: "photoroom",
    adapterVersion: PHOTOROOM_PROVIDER_ADAPTER_VERSION,
    maxRetries: PHOTOROOM_MAX_RETRIES,
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
      body.append("channels", "alpha");
      body.append("format", "png");
      const startedAt = performance.now();
      const response = await request(PHOTOROOM_SEGMENT_ENDPOINT, {
        method: "POST",
        headers: { "x-api-key": options.apiKey },
        body,
        signal,
      });
      const durationMs = Math.round(performance.now() - startedAt);
      if (!response.ok)
        throw Object.assign(
          new Error(`Photoroom returned HTTP ${response.status}.`),
          {
            providerFailureStatus: response.status,
            durationMs,
          },
        );
      const maskPng = new Uint8Array(await response.arrayBuffer());
      if (
        maskPng[0] !== 0x89 ||
        maskPng[1] !== 0x50 ||
        maskPng[2] !== 0x4e ||
        maskPng[3] !== 0x47
      )
        throw Object.assign(new Error("Photoroom returned a non-PNG mask."), {
          providerFailureStatus: response.status,
          durationMs,
        });
      return {
        maskPng,
        providerRequestId:
          response.headers.get("x-request-id") ??
          response.headers.get("request-id") ??
          null,
        uncertainty: parseUncertainty(
          response.headers.get("x-uncertainty-score"),
        ),
        durationMs,
        httpStatus: response.status,
      };
    },
  };
}
