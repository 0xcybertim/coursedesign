import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { recognizedFixtureSubject } from "@/domain/generation";
import { deterministicConceptCutout } from "@/server/profile-wing/deterministic-concept-cutout";
import {
  createDeterministicProfileMaskProvider,
  createRemoveBgProfileMaskProvider,
  createSourceAwareProfileMaskProvider,
  type ProfileWingMaskProvider,
} from "@/server/profile-wing/mask-provider";
import {
  PROFILE_WING_PROVIDER_TIMEOUT_MS,
  PROFILE_WING_REQUEST_MAX_BYTES,
  PROFILE_WING_SOURCE_MAX_BYTES,
  detectProfileWingSourceMediaType,
  getProfileWingMaskRouteAvailabilityForHosts,
  type ProfileWingMaskRouteAvailability,
} from "@/server/profile-wing/request-policy";
import {
  decodePng,
  encodeRgbaPng,
  maskValues,
} from "../../../../../tools/phase-1h/png";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeSessions = new Set<string>();
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

type MaskFailureKind =
  | "disabled_route"
  | "invalid_request"
  | "policy_failure"
  | "active_request"
  | "provider_rejection"
  | "rate_limit"
  | "timeout"
  | "cancellation"
  | "malformed_response"
  | "unknown_provider_failure";

function responseError(kind: MaskFailureKind, message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        kind,
        message,
        recoverable: [
          "provider_rejection",
          "rate_limit",
          "timeout",
          "cancellation",
          "unknown_provider_failure",
        ].includes(kind),
      },
    },
    { status, headers: NO_STORE_HEADERS },
  );
}

function publicMessage(kind: MaskFailureKind) {
  const messages: Record<MaskFailureKind, string> = {
    disabled_route:
      "Profile Wing image processing is disabled or not configured in this local environment.",
    invalid_request:
      "The Profile Wing source image or request metadata is invalid.",
    policy_failure:
      "The required source-specific processing confirmation is missing.",
    active_request:
      "This browser session already has one active background-removal request.",
    provider_rejection:
      "remove.bg rejected this image. Check that it contains one clear foreground subject.",
    rate_limit:
      "remove.bg rate-limited this request. Nothing was retried automatically.",
    timeout:
      "remove.bg did not finish within the bounded request window. Nothing was retried automatically.",
    cancellation:
      "Background removal was cancelled locally. Provider usage may already have been incurred.",
    malformed_response:
      "The provider response was not a supported transparent PNG.",
    unknown_provider_failure:
      "Background removal failed without a recognized response. Nothing was retried automatically.",
  };
  return messages[kind];
}

function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    new URL(request.url).host;
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

function isFileLike(
  value: unknown,
): value is Blob & { readonly name?: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "size" in value &&
    typeof value.size === "number" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

function failureKind(
  error: unknown,
  requestSignal: AbortSignal,
  timeoutSignal: AbortSignal,
): MaskFailureKind {
  if (timeoutSignal.aborted) return "timeout";
  if (requestSignal.aborted) return "cancellation";
  if (
    error &&
    typeof error === "object" &&
    "profileWingMaskFailureKind" in error
  )
    return String(error.profileWingMaskFailureKind) as MaskFailureKind;
  return "unknown_provider_failure";
}

function statusFor(kind: MaskFailureKind) {
  if (kind === "cancellation") return 499;
  if (kind === "rate_limit") return 429;
  if (kind === "provider_rejection") return 422;
  if (kind === "timeout") return 504;
  if (kind === "malformed_response") return 502;
  return 502;
}

function generatedConceptCutout(input: {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/png" | "image/jpeg";
  readonly generatedConceptSubject: string | null;
}) {
  if (input.mediaType === "image/png") {
    try {
      const decoded = decodePng(input.bytes);
      let hasTransparentPixel = false;
      let hasSolidPixel = false;
      for (
        let pixel = 0;
        pixel < decoded.width * decoded.height;
        pixel += 1
      ) {
        const value = decoded.rgba[pixel * 4 + 3] ?? 255;
        if (value <= 8) hasTransparentPixel = true;
        if (value >= 247) hasSolidPixel = true;
        if (hasTransparentPixel && hasSolidPixel) return input.bytes;
      }
    } catch {
      // Old or malformed concept art falls back to the bounded fixture shapes.
    }
  }
  return deterministicConceptCutout(
    recognizedFixtureSubject(input.generatedConceptSubject ?? "") ?? "generic",
  );
}

export async function handleProfileWingMaskRequest(
  request: Request,
  options: {
    readonly availability: ProfileWingMaskRouteAvailability;
    readonly provider: ProfileWingMaskProvider | null;
    readonly timeoutMs?: number;
  },
) {
  if (!options.availability.enabled || !options.provider)
    return responseError(
      "disabled_route",
      publicMessage("disabled_route"),
      404,
    );
  if (!originAllowed(request))
    return responseError(
      "invalid_request",
      "Cross-origin requests are blocked.",
      403,
    );
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > PROFILE_WING_REQUEST_MAX_BYTES)
    return responseError("invalid_request", "Request body is too large.", 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return responseError(
      "invalid_request",
      "Request body must be multipart form data.",
      400,
    );
  }
  const image = form.get("image");
  const sessionId = String(form.get("sessionId") ?? "");
  const sourceId = String(form.get("sourceId") ?? "");
  const sourceKind = String(form.get("sourceKind") ?? "");
  const generatedConceptSubject = String(
    form.get("generatedConceptSubject") ?? "",
  );
  const expectedHash = String(form.get("sourceContentHash") ?? "");
  if (
    !isFileLike(image) ||
    image.size <= 0 ||
    image.size > PROFILE_WING_SOURCE_MAX_BYTES ||
    !/^[A-Za-z0-9_-]{12,120}$/.test(sessionId) ||
    !/^[a-z0-9][a-z0-9-]{7,95}$/.test(sourceId) ||
    (sourceKind !== "user_upload" && sourceKind !== "generated_concept") ||
    !/^[a-f0-9]{64}$/.test(expectedHash)
  )
    return responseError(
      "invalid_request",
      publicMessage("invalid_request"),
      400,
    );
  const uploadConfirmationsComplete =
    sourceKind === "user_upload" &&
    form.get("rightsConfirmed") === "true" &&
    form.get("providerDisclosureConfirmed") === "true" &&
    form.get("noIdentifiablePeopleConfirmed") === "true" &&
    form.get("singleSubjectConfirmed") === "true";
  const generatedConceptConversionConfirmed =
    sourceKind === "generated_concept" &&
    form.get("generatedConceptConversionConfirmed") === "true";
  if (!uploadConfirmationsComplete && !generatedConceptConversionConfirmed)
    return responseError(
      "policy_failure",
      publicMessage("policy_failure"),
      422,
    );
  const bytes = new Uint8Array(await image.arrayBuffer());
  const mediaType = detectProfileWingSourceMediaType(bytes);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (!mediaType || actualHash !== expectedHash)
    return responseError(
      "invalid_request",
      "Source bytes failed media-type or SHA-256 validation.",
      400,
    );
  const sessionKey = createHash("sha256").update(sessionId).digest("hex");
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
    options.timeoutMs ?? PROFILE_WING_PROVIDER_TIMEOUT_MS,
  );
  const abort = new AbortController();
  const abortFromRequest = () => abort.abort(request.signal.reason);
  const abortFromTimeout = () => abort.abort(timeoutController.signal.reason);
  request.signal.addEventListener("abort", abortFromRequest, { once: true });
  timeoutController.signal.addEventListener("abort", abortFromTimeout, {
    once: true,
  });
  try {
    const result = await options.provider.removeBackground({
      bytes,
      mediaType,
      filename:
        typeof image.name === "string" && image.name
          ? image.name.slice(0, 160)
          : `${sourceId}.${mediaType === "image/png" ? "png" : "jpg"}`,
      sourceKind,
      generatedConceptSubject:
        sourceKind === "generated_concept" ? generatedConceptSubject : null,
      signal: abort.signal,
    });
    if (abort.signal.aborted || request.signal.aborted) {
      const kind = timeoutController.signal.aborted
        ? "timeout"
        : "cancellation";
      return responseError(kind, publicMessage(kind), statusFor(kind));
    }
    return new Response(result.bytes.slice().buffer as ArrayBuffer, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "image/png",
        "X-Profile-Wing-Provider": result.provider,
        "X-Profile-Wing-Adapter-Version": result.adapterVersion,
        "X-Profile-Wing-Provider-Request-Id":
          result.providerRequestId ?? "none",
        "X-Profile-Wing-Automatic-Retries": "0",
        "X-Profile-Wing-Request-Count": "1",
        "X-Source-Content-Sha256": actualHash,
      },
    });
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

async function providerFor(availability: ProfileWingMaskRouteAvailability) {
  if (!availability.enabled) return null;
  const generatedConceptProvider = createDeterministicProfileMaskProvider(
    generatedConceptCutout,
  );
  if (availability.provider === "deterministic") {
    const maskPng = await readFile(
      path.join(
        process.cwd(),
        "docs",
        "phase-1h",
        "remove-bg-live-masks",
        "clean-dog-side.png",
      ),
    );
    const decodedMask = decodePng(new Uint8Array(maskPng));
    const alpha = maskValues(decodedMask);
    const rgba = new Uint8Array(decodedMask.width * decodedMask.height * 4);
    for (let pixel = 0; pixel < alpha.byteLength; pixel += 1) {
      const offset = pixel * 4;
      rgba[offset] = 36;
      rgba[offset + 1] = 80;
      rgba[offset + 2] = 120;
      rgba[offset + 3] = alpha[pixel] ?? 0;
    }
    const transparentCutout = encodeRgbaPng({
      width: decodedMask.width,
      height: decodedMask.height,
      rgba,
    });
    const uploadFixture = new Uint8Array(transparentCutout);
    return createDeterministicProfileMaskProvider((input) =>
      input.sourceKind === "generated_concept"
        ? generatedConceptCutout(input)
        : uploadFixture,
    );
  }
  const uploadProvider = createRemoveBgProfileMaskProvider({
    apiKey: process.env.REMOVE_BG_API_KEY!,
  });
  return createSourceAwareProfileMaskProvider({
    uploadProvider,
    generatedConceptProvider,
  });
}

function availabilityFor(request: Request) {
  return getProfileWingMaskRouteAvailabilityForHosts(process.env, [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host") ?? new URL(request.url).host,
  ]);
}

export async function GET(request: Request) {
  const availability = availabilityFor(request);
  return NextResponse.json(
    {
      enabled: availability.enabled,
      provider:
        availability.provider === "remove-bg"
          ? "remove-bg"
          : availability.provider === "deterministic"
            ? "deterministic-test"
            : null,
      generatedConceptProvider: availability.enabled
        ? "deterministic-test"
        : null,
      reason: availability.reason,
      automaticRetries: 0,
      externalCallOccursOnlyOnPost: true,
    },
    {
      status: availability.enabled ? 200 : 404,
      headers: NO_STORE_HEADERS,
    },
  );
}

export async function POST(request: Request) {
  const availability = availabilityFor(request);
  return handleProfileWingMaskRequest(request, {
    availability,
    provider: await providerFor(availability),
  });
}
