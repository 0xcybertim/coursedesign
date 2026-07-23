import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { GenerationFailureKind } from "@/domain/generation";
import {
  createDeterministicConceptProvider,
  type ConceptProvider,
  type ProviderImageInput,
} from "@/server/generation/concept-provider";
import { createOpenAIConceptProvider } from "@/server/generation/openai-concept-provider";
import {
  CONCEPT_PROVIDER_TIMEOUT_MS,
  CONCEPT_REQUEST_MAX_BYTES,
  getGenerationRouteAvailabilityForHosts,
  structuredProviderPrompt,
  validateConceptApiRequest,
  type EncodedProviderImage,
  type GenerationRouteAvailability,
} from "@/server/generation/request-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeSessions = new Set<string>();
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function responseError(
  kind: GenerationFailureKind,
  message: string,
  status: number,
) {
  return NextResponse.json(
    { ok: false, error: { kind, message, recoverable: status < 500 } },
    { status, headers: NO_STORE_HEADERS },
  );
}

function decodedMediaType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

function decodeImage(
  value: EncodedProviderImage | null,
  enforceRasterSignature: boolean,
): ProviderImageInput | null {
  if (!value) return null;
  const bytes = Uint8Array.from(Buffer.from(value.base64, "base64"));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== value.contentHash)
    throw new Error("Reference bytes failed SHA-256 verification.");
  if (enforceRasterSignature && decodedMediaType(bytes) !== value.mediaType)
    throw new Error("Reference bytes do not match their declared raster type.");
  return {
    bytes,
    mediaType: value.mediaType,
    filename: value.filename,
  };
}

function failureKind(
  error: unknown,
  requestSignal: AbortSignal,
  timeoutSignal: AbortSignal,
): GenerationFailureKind {
  if (timeoutSignal.aborted) return "timeout";
  if (requestSignal.aborted) return "cancellation";
  if (error && typeof error === "object" && "generationFailureKind" in error)
    return String(error.generationFailureKind) as GenerationFailureKind;
  if (error && typeof error === "object") {
    const status = "status" in error ? Number(error.status) : null;
    const code = "code" in error ? String(error.code) : "";
    const name = "name" in error ? String(error.name) : "";
    if (status === 429) return "rate_limit";
    if (code === "moderation_blocked") return "policy_failure";
    if (name.includes("Timeout")) return "timeout";
    if ([400, 401, 403, 404, 422].includes(status ?? 0))
      return "provider_rejection";
  }
  return "unknown_provider_failure";
}

function statusFor(kind: GenerationFailureKind) {
  if (kind === "cancellation") return 499;
  if (kind === "rate_limit") return 429;
  if (kind === "policy_failure" || kind === "provider_rejection") return 422;
  if (kind === "timeout") return 504;
  if (kind === "malformed_response") return 502;
  return 502;
}

function publicMessage(kind: GenerationFailureKind) {
  const messages: Record<GenerationFailureKind, string> = {
    disabled_route: "Concept generation is disabled in this environment.",
    invalid_request: "The concept request is invalid.",
    policy_failure:
      "The request could not be completed under the current content policy.",
    active_request: "This browser session already has an active generation.",
    provider_rejection: "The configured image provider rejected the request.",
    rate_limit:
      "The configured image provider rate-limited the request. Nothing was retried automatically.",
    timeout: "The provider did not finish within the bounded request window.",
    cancellation:
      "Generation was cancelled locally. Provider cost may already have been incurred.",
    malformed_response:
      "The provider returned an incomplete four-concept batch.",
    storage_failure: "Generated concept bytes could not be stored locally.",
    missing_artifact: "A referenced local concept artifact is missing.",
    tampered_history: "Local concept history failed integrity checks.",
    unsupported_history: "Local concept history uses an unsupported schema.",
    unknown_provider_failure:
      "The provider failed without a recognized response. Nothing was retried automatically.",
  };
  return messages[kind];
}

export async function handleConceptRequest(
  request: Request,
  options: {
    readonly availability: GenerationRouteAvailability;
    readonly provider: ConceptProvider | null;
    readonly timeoutMs?: number;
  },
) {
  if (!options.availability.enabled || !options.provider)
    return responseError(
      "disabled_route",
      publicMessage("disabled_route"),
      404,
    );
  const origin = request.headers.get("origin");
  if (origin) {
    const requestHost =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      new URL(request.url).host;
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost !== requestHost)
      return responseError(
        "invalid_request",
        "Cross-origin requests are blocked.",
        403,
      );
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > CONCEPT_REQUEST_MAX_BYTES)
    return responseError("invalid_request", "Request body is too large.", 413);
  let text: string;
  try {
    text = await request.text();
  } catch {
    return responseError(
      "invalid_request",
      "Request body could not be read.",
      400,
    );
  }
  if (Buffer.byteLength(text) > CONCEPT_REQUEST_MAX_BYTES)
    return responseError("invalid_request", "Request body is too large.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return responseError(
      "invalid_request",
      "Request body must be valid JSON.",
      400,
    );
  }
  const validated = validateConceptApiRequest(body);
  if (!validated.ok)
    return responseError(
      validated.kind,
      validated.message,
      validated.kind === "policy_failure" ? 422 : 400,
    );
  let referencePhoto: ProviderImageInput | null;
  let sourceConcept: ProviderImageInput | null;
  try {
    const enforceRaster = options.provider.providerName === "openai";
    referencePhoto = decodeImage(validated.value.referencePhoto, enforceRaster);
    sourceConcept = decodeImage(validated.value.sourceConcept, enforceRaster);
    if (
      referencePhoto &&
      validated.value.photoDerivative &&
      referencePhoto.bytes.byteLength !==
        validated.value.photoDerivative.byteLength
    )
      throw new Error(
        "Reference byte length does not match derivative metadata.",
      );
  } catch {
    return responseError(
      "invalid_request",
      "Reference image bytes failed integrity or media-type validation.",
      400,
    );
  }
  const sessionKey = createHash("sha256")
    .update(validated.value.sessionId)
    .digest("hex");
  if (activeSessions.has(sessionKey))
    return responseError(
      "active_request",
      publicMessage("active_request"),
      409,
    );
  activeSessions.add(sessionKey);
  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(new Error("Provider timeout")),
    options.timeoutMs ?? CONCEPT_PROVIDER_TIMEOUT_MS,
  );
  const abort = new AbortController();
  const abortFromRequest = () => abort.abort(request.signal.reason);
  const abortFromTimeout = () => abort.abort(timeoutController.signal.reason);
  request.signal.addEventListener("abort", abortFromRequest, { once: true });
  timeoutController.signal.addEventListener("abort", abortFromTimeout, {
    once: true,
  });
  try {
    const providerResult = await options.provider.generate({
      requestId: validated.value.requestId,
      action: validated.value.action,
      prompt: structuredProviderPrompt(validated.value),
      creativeDirection: validated.value.prompt,
      constraints: validated.value.constraints,
      referencePhoto,
      sourceConcept,
      signal: abort.signal,
    });
    if (abort.signal.aborted || request.signal.aborted)
      return responseError(
        timeoutController.signal.aborted ? "timeout" : "cancellation",
        publicMessage(
          timeoutController.signal.aborted ? "timeout" : "cancellation",
        ),
        timeoutController.signal.aborted ? 504 : 499,
      );
    if (providerResult.images.length !== 4)
      return responseError(
        "malformed_response",
        publicMessage("malformed_response"),
        502,
      );
    return NextResponse.json(
      {
        ok: true,
        requestId: validated.value.requestId,
        images: providerResult.images.map((image) => ({
          mediaType: image.mediaType,
          base64: Buffer.from(image.bytes).toString("base64"),
        })),
        provenance: providerResult.provenance,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const kind = failureKind(error, request.signal, timeoutController.signal);
    return responseError(kind, publicMessage(kind), statusFor(kind));
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abortFromRequest);
    timeoutController.signal.removeEventListener("abort", abortFromTimeout);
    activeSessions.delete(sessionKey);
  }
}

function providerFor(availability: GenerationRouteAvailability) {
  if (!availability.enabled) return null;
  if (availability.provider === "deterministic") {
    const scenario = process.env.PHASE_1G_TEST_SCENARIO;
    return createDeterministicConceptProvider({
      delayMs: scenario === "slow" ? 2_000 : 40,
      failure:
        scenario === "policy" || scenario === "rate_limit"
          ? scenario
          : scenario === "provider"
            ? "provider"
            : null,
    });
  }
  return createOpenAIConceptProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_IMAGE_MODEL,
  });
}

export async function GET(request: Request) {
  const availability = getGenerationRouteAvailabilityForHosts(process.env, [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host") ?? new URL(request.url).host,
  ]);
  return NextResponse.json(
    { enabled: availability.enabled, reason: availability.reason },
    { status: availability.enabled ? 200 : 404, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const availability = getGenerationRouteAvailabilityForHosts(process.env, [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host") ?? new URL(request.url).host,
  ]);
  return handleConceptRequest(request, {
    availability,
    provider: providerFor(availability),
  });
}
