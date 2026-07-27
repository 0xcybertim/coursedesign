import type {
  ConceptConstraints,
  ConceptMediaType,
  ConceptProviderProvenance,
} from "@/domain/generation";
import { recognizedFixtureSubject } from "@/domain/generation";

export const CONCEPT_PROVIDER_ADAPTER_VERSION =
  "1.1.0-transparent-wing" as const;
export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1" as const;

export interface ProviderImageInput {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/png" | "image/jpeg" | "image/webp";
  readonly filename: string;
}

export interface ConceptProviderRequest {
  readonly requestId: string;
  readonly prompt: string;
  readonly creativeDirection: string;
  readonly constraints: ConceptConstraints;
  readonly action: "generate" | "refine";
  readonly referencePhoto: ProviderImageInput | null;
  readonly sourceConcept: ProviderImageInput | null;
  readonly signal: AbortSignal;
}

export interface ConceptProviderImage {
  readonly bytes: Uint8Array;
  readonly mediaType: ConceptMediaType;
}

export interface ConceptProviderResponse {
  readonly images: readonly ConceptProviderImage[];
  readonly provenance: ConceptProviderProvenance;
}

export interface ConceptProvider {
  readonly providerName: ConceptProviderProvenance["provider"];
  readonly configuredModel: string;
  generate(request: ConceptProviderRequest): Promise<ConceptProviderResponse>;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character] ?? character;
  });
}

const COLOR_HEX: ReadonlyArray<readonly [string, string]> = [
  ["navy", "#09245c"],
  ["cobalt", "#0d43c7"],
  ["blue", "#245bff"],
  ["gold", "#d7aa32"],
  ["yellow", "#d7f200"],
  ["coral", "#ff5547"],
  ["red", "#c83b35"],
  ["green", "#128257"],
  ["forest", "#1f5a3b"],
  ["rust", "#a85a00"],
  ["cream", "#f3ead5"],
  ["white", "#ffffff"],
  ["black", "#0b0b0b"],
  ["stone", "#9a978f"],
];

const FALLBACK_PALETTES = [
  ["#0d43c7", "#d7f200", "#f7f6f1"],
  ["#0b0b0b", "#ff5547", "#f7f6f1"],
  ["#09245c", "#d7aa32", "#ffffff"],
  ["#128257", "#f3ead5", "#f7f6f1"],
] as const;

function requestedPalette(colors: string, index: number) {
  const requested = COLOR_HEX.filter(([name]) =>
    new RegExp(`\\b${name}\\b`, "i").test(colors),
  );
  const fallback = FALLBACK_PALETTES[index] ?? FALLBACK_PALETTES[0];
  return {
    primary: requested[0]?.[1] ?? fallback[0],
    accent: requested[1]?.[1] ?? fallback[1],
    paper: requested[2]?.[1] ?? fallback[2],
    names: requested.map(([name]) => name).join(", ") || "fixture default",
  };
}

function subjectShape(subject: string, primary: string, accent: string) {
  const recognized = recognizedFixtureSubject(subject);
  const shapes: Record<NonNullable<typeof recognized>, string> = {
    dog: `<path d="M78 526V382L112 334L168 324L198 278L244 264L278 282L310 266L300 310L330 336L310 374L272 380L264 526H222L214 414H154L148 526Z" fill="${primary}" stroke="#0b0b0b" stroke-width="8"/><path d="M92 374Q42 330 62 286" fill="none" stroke="${accent}" stroke-width="22" stroke-linecap="round"/><path d="M244 270L258 322L220 298Z" fill="${accent}"/><circle cx="287" cy="333" r="7" fill="#0b0b0b"/>`,
    butterfly: `<path d="M198 360C112 244 72 268 88 386C98 466 150 484 198 422Z" fill="${primary}" stroke="#0b0b0b" stroke-width="8"/><path d="M214 360C300 244 340 268 324 386C314 466 262 484 214 422Z" fill="${accent}" stroke="#0b0b0b" stroke-width="8"/><path d="M206 330V526" stroke="#0b0b0b" stroke-width="20" stroke-linecap="round"/><path d="M201 340Q160 278 146 248M211 340Q252 278 266 248" fill="none" stroke="#0b0b0b" stroke-width="8" stroke-linecap="round"/>`,
    castle: `<path d="M80 526V322H116V278H154V322H190V252H228V322H264V278H302V322H338V526Z" fill="${primary}" stroke="#0b0b0b" stroke-width="8"/><path d="M176 526V438Q208 396 240 438V526Z" fill="${accent}"/><rect x="112" y="356" width="34" height="50" fill="${accent}"/><rect x="272" y="356" width="34" height="50" fill="${accent}"/>`,
    horse: `<path d="M94 526V398L142 344L184 326L210 250L282 276L328 340L302 386L260 380L246 526H204L194 422H152L142 526Z" fill="${primary}" stroke="#0b0b0b" stroke-width="8"/><path d="M218 270L232 210L256 276" fill="${accent}" stroke="#0b0b0b" stroke-width="8"/><path d="M104 392Q52 342 70 292" fill="none" stroke="${accent}" stroke-width="20" stroke-linecap="round"/>`,
    leaf: `<path d="M74 464C102 280 218 230 340 274C326 416 230 506 74 464Z" fill="${primary}" stroke="#0b0b0b" stroke-width="8"/><path d="M86 470L302 292M156 414L132 334M218 362L214 292M218 362L292 380" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round"/><path d="M86 470V526" stroke="#0b0b0b" stroke-width="18"/>`,
    wave: `<path d="M66 526V426C118 414 150 360 186 310C226 254 298 274 344 344C286 322 258 354 244 404C220 488 138 506 66 478Z" fill="${primary}" stroke="#0b0b0b" stroke-width="8"/><path d="M112 432C162 426 174 358 220 338C254 324 284 338 308 364" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`,
  };
  return {
    recognized,
    markup:
      (recognized && shapes[recognized]) ??
      `<path d="M76 526V356L128 294L208 266L288 294L340 356V526H286V398L208 354L130 398V526Z" fill="${primary}" stroke="#0b0b0b" stroke-width="8"/><circle cx="208" cy="394" r="38" fill="${accent}"/>`,
  };
}

function lowerElementMarkup(
  preference: ConceptConstraints["lowerElementPreference"],
  accent: string,
) {
  if (preference === "none") return "";
  if (preference === "gate")
    return `<g data-lower-element="gate" stroke="${accent}" stroke-width="12"><path d="M356 434V530M406 434V530M456 434V530M506 434V530M556 434V530M606 434V530"/><path d="M340 440H622M340 520H622"/></g>`;
  if (preference === "filler")
    return `<path data-lower-element="filler" d="M342 526L376 454L410 526L444 454L478 526L512 454L546 526L580 454L614 526Z" fill="${accent}" stroke="#0b0b0b" stroke-width="6"/>`;
  return `<path data-lower-element="decorative-panel" d="M342 526V450L478 424L614 450V526Z" fill="${accent}" stroke="#0b0b0b" stroke-width="6"/>`;
}

function sponsorMarkup(
  preference: ConceptConstraints["sponsorArea"],
  paper: string,
) {
  if (preference === "none") return "";
  const prominent = preference === "prominent";
  return `<g data-sponsor-area="${preference}"><rect x="${prominent ? 112 : 146}" y="${prominent ? 438 : 462}" width="${prominent ? 168 : 100}" height="${prominent ? 58 : 38}" rx="4" fill="${paper}" stroke="#0b0b0b" stroke-width="5"/><text x="${prominent ? 196 : 196}" y="${prominent ? 472 : 487}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${prominent ? 18 : 13}" font-weight="700">SPONSOR</text></g>`;
}

function deterministicConcept(
  index: number,
  request: ConceptProviderRequest,
): Uint8Array {
  const palette = requestedPalette(request.constraints.colors, index);
  const subject = subjectShape(
    request.constraints.silhouetteSubject,
    palette.primary,
    palette.accent,
  );
  const subjectLabel = escapeXml(request.constraints.silhouetteSubject.trim());
  const direction = escapeXml(
    (request.creativeDirection.trim() || "No additional direction").slice(
      0,
      86,
    ),
  );
  const fixtureKind = subject.recognized ?? "generic";
  const genericLabel = subject.recognized
    ? ""
    : `<text x="480" y="112" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#a85a00">GENERIC FALLBACK · SUBJECT NOT SHAPE-MATCHED</text>`;
  const styleDecoration =
    request.constraints.style === "playful"
      ? `<g fill="${palette.accent}"><circle cx="382" cy="170" r="12"/><circle cx="432" cy="144" r="8"/><circle cx="528" cy="144" r="8"/><circle cx="578" cy="170" r="12"/></g>`
      : request.constraints.style === "heritage"
        ? `<path d="M438 152L480 122L522 152L480 182Z" fill="${palette.accent}" stroke="#0b0b0b" stroke-width="5"/>`
        : request.constraints.style === "sculptural"
          ? `<path d="M350 538Q480 490 610 538" fill="none" stroke="${palette.accent}" stroke-width="18" stroke-linecap="round"/>`
          : `<path d="M370 150H590" stroke="${palette.accent}" stroke-width="12"/>`;
  const poleOffset = index * 5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720" data-fixture-subject="${fixtureKind}" data-fixture-variant="${index + 1}" data-fixture-style="${request.constraints.style}" data-requested-colors="${escapeXml(palette.names)}"><rect width="960" height="720" fill="${palette.paper}"/><rect y="548" width="960" height="172" fill="#e8e7e1"/><text x="40" y="42" font-family="Arial,sans-serif" font-weight="800" font-size="18" fill="#0b0b0b">WORKFLOW SIMULATOR · DETERMINISTIC FIXTURE ${index + 1}/4</text><text x="40" y="70" font-family="Arial,sans-serif" font-size="15" fill="#5c5d5a">SUBJECT: ${subjectLabel.toUpperCase()} · COLORS: ${escapeXml(palette.names).toUpperCase()}</text>${genericLabel}${styleDecoration}<g data-wing="left" transform="translate(0 ${poleOffset - 8})">${subject.markup}${sponsorMarkup(request.constraints.sponsorArea, palette.paper)}</g><g data-wing="right" transform="translate(960 ${poleOffset - 8}) scale(-1 1)">${subject.markup}${sponsorMarkup(request.constraints.sponsorArea, palette.paper)}</g>${lowerElementMarkup(request.constraints.lowerElementPreference, palette.accent)}<g stroke="#0b0b0b" stroke-width="24" stroke-linecap="round"><path d="M214 ${246 + poleOffset}H746"/><path d="M198 ${326 + poleOffset}H762"/><path d="M188 ${406 + poleOffset}H772"/><path d="M176 ${486 + poleOffset}H784"/></g><g stroke="${palette.primary}" stroke-width="14" stroke-dasharray="44 28"><path d="M214 ${246 + poleOffset}H746"/><path d="M198 ${326 + poleOffset}H762"/><path d="M188 ${406 + poleOffset}H772"/><path d="M176 ${486 + poleOffset}H784"/></g><rect x="28" y="574" width="904" height="116" fill="#ffffff" stroke="#0b0b0b" stroke-width="2"/><text x="48" y="606" font-family="Arial,sans-serif" font-size="16" font-weight="700">STYLE: ${request.constraints.style.toUpperCase()} · LOWER: ${request.constraints.lowerElementPreference.toUpperCase()} · SPONSOR: ${request.constraints.sponsorArea.toUpperCase()}</text><text x="48" y="636" font-family="Arial,sans-serif" font-size="15" fill="#5c5d5a">${request.action === "refine" ? "REFINEMENT FIXTURE" : "DIRECTION"}: ${direction}</text><text x="48" y="669" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#a85a00">SIMULATION ONLY · DOES NOT DEMONSTRATE AI IMAGE QUALITY</text></svg>`;
  return new TextEncoder().encode(svg);
}

export function createDeterministicConceptProvider(options?: {
  readonly delayMs?: number;
  readonly failure?: "policy" | "rate_limit" | "provider" | null;
}): ConceptProvider {
  return {
    providerName: "deterministic-test",
    configuredModel: "deterministic-concept-v1",
    async generate(request) {
      if (options?.delayMs) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, options.delayMs),
        );
      }
      if (request.signal.aborted)
        throw Object.assign(new Error("Generation cancelled."), {
          generationFailureKind: "cancellation",
        });
      if (options?.failure)
        throw Object.assign(new Error("Deterministic provider failure."), {
          generationFailureKind:
            options.failure === "policy"
              ? "policy_failure"
              : options.failure === "rate_limit"
                ? "rate_limit"
                : "provider_rejection",
        });
      return {
        images: [0, 1, 2, 3].map((index) => ({
          bytes: deterministicConcept(index, request),
          mediaType: "image/svg+xml" as const,
        })),
        provenance: {
          provider: "deterministic-test",
          configuredModel: "deterministic-concept-v1",
          adapterVersion: CONCEPT_PROVIDER_ADAPTER_VERSION,
          providerRequestId: `deterministic-${request.requestId}`,
          seed: 1,
          revisedPrompt: null,
        },
      };
    },
  };
}
