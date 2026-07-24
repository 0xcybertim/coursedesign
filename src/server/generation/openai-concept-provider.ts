import OpenAI, { toFile } from "openai";
import {
  CONCEPT_PROVIDER_ADAPTER_VERSION,
  DEFAULT_OPENAI_IMAGE_MODEL,
  type ConceptProvider,
  type ConceptProviderRequest,
} from "./concept-provider";

type OpenAIClient = Pick<OpenAI, "images">;

export function openAIClientOptions(apiKey: string) {
  return { apiKey, maxRetries: 0 } as const;
}

function providerPrompt(request: ConceptProviderRequest) {
  const prefix =
    request.action === "refine"
      ? "Refine the supplied wing concept. Preserve its recognizable subject and apply the requested change."
      : "Create one custom wing-plate concept for a show-jumping obstacle.";
  return `${prefix}\n\n${request.prompt}\n\nOutput exactly one isolated Profile Wing Vertical plate in a flat orthographic view. The complete plate must be visible as one connected, solid outer silhouette on a transparent background. Do not render poles, a second mirrored wing, a complete obstacle, scenery, floor, shadows, people, horses, text, logos, dimensions, prices, safety marks, manufacturing claims, or supplier approval. The four locked poles from the brief belong to the downstream jump preview and must not appear in this image. Interior colors and markings may follow the brief, but the transparent alpha outline must remain clean enough to become the product shape.`;
}

function mediaTypeFor(format: "png" | "jpeg" | "webp" | undefined) {
  return format === "jpeg"
    ? ("image/jpeg" as const)
    : format === "webp"
      ? ("image/webp" as const)
      : ("image/png" as const);
}

function bytesMatchMediaType(
  bytes: Uint8Array,
  mediaType: "image/png" | "image/jpeg" | "image/webp",
) {
  if (mediaType === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mediaType === "image/png")
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  return (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  );
}

export function createOpenAIConceptProvider(options: {
  readonly apiKey: string;
  readonly model?: string;
  readonly client?: OpenAIClient;
}): ConceptProvider {
  const model = options.model ?? DEFAULT_OPENAI_IMAGE_MODEL;
  const client =
    options.client ?? new OpenAI(openAIClientOptions(options.apiKey));
  return {
    providerName: "openai",
    configuredModel: model,
    async generate(request) {
      const prompt = providerPrompt(request);
      const common = {
        model,
        prompt,
        n: 4,
        quality: "low" as const,
        size: "1024x1024" as const,
        output_format: "png" as const,
        background: "transparent" as const,
      };
      const source = request.sourceConcept ?? request.referencePhoto;
      const result = source
        ? await client.images
            .edit(
              {
                ...common,
                image: await toFile(source.bytes, source.filename, {
                  type: source.mediaType,
                }),
              },
              { signal: request.signal, maxRetries: 0 },
            )
            .withResponse()
        : await client.images
            .generate(common, { signal: request.signal, maxRetries: 0 })
            .withResponse();
      const images = result.data.data ?? [];
      const mediaType = mediaTypeFor(result.data.output_format);
      if (
        images.length !== 4 ||
        images.some(
          (item) =>
            typeof item.b64_json !== "string" || item.b64_json.length === 0,
        )
      )
        throw Object.assign(
          new Error("OpenAI returned an incomplete concept batch."),
          { generationFailureKind: "malformed_response" },
        );
      const decoded = images.map((item) =>
        Uint8Array.from(Buffer.from(item.b64_json!, "base64")),
      );
      if (decoded.some((bytes) => !bytesMatchMediaType(bytes, mediaType)))
        throw Object.assign(
          new Error(
            "OpenAI returned bytes that do not match its image format.",
          ),
          { generationFailureKind: "malformed_response" },
        );
      return {
        images: decoded.map((bytes) => ({
          bytes,
          mediaType,
        })),
        provenance: {
          provider: "openai",
          configuredModel: model,
          adapterVersion: CONCEPT_PROVIDER_ADAPTER_VERSION,
          providerRequestId: result.request_id,
          seed: null,
          revisedPrompt:
            images.find((item) => item.revised_prompt)?.revised_prompt ?? null,
        },
      };
    },
  };
}
