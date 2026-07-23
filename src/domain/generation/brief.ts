import type { ConceptConstraints } from "./types";

export type SupportedFixtureSubject =
  | "dog"
  | "butterfly"
  | "castle"
  | "horse"
  | "leaf"
  | "wave";

const SUBJECT_TERMS: ReadonlyArray<{
  readonly subject: SupportedFixtureSubject;
  readonly pattern: RegExp;
}> = [
  {
    subject: "dog",
    pattern: /\b(dogs?|pupp(?:y|ies)|canine|labradors?|retrievers?)\b/i,
  },
  { subject: "butterfly", pattern: /\bbutterfl(?:y|ies)\b/i },
  {
    subject: "castle",
    pattern: /\b(castles?|buildings?|fortress(?:es)?|towers?)\b/i,
  },
  { subject: "horse", pattern: /\b(horses?|equine|pon(?:y|ies))\b/i },
  { subject: "leaf", pattern: /\b(leaves|leaf|oak[- ]?leaf)\b/i },
  { subject: "wave", pattern: /\b(waves?|ocean[- ]?wave)\b/i },
];

export interface SubjectConflict {
  readonly directionSubject: SupportedFixtureSubject;
  readonly structuredSubject: SupportedFixtureSubject | null;
  readonly structuredSubjectLabel: string;
}

export function recognizedFixtureSubject(
  value: string,
): SupportedFixtureSubject | null {
  return (
    SUBJECT_TERMS.find((candidate) => candidate.pattern.test(value))?.subject ??
    null
  );
}

export function findSubjectConflict(
  creativeDirection: string,
  silhouetteSubject: string,
): SubjectConflict | null {
  const directionSubject = recognizedFixtureSubject(creativeDirection);
  if (!directionSubject) return null;
  const structuredSubject = recognizedFixtureSubject(silhouetteSubject);
  if (structuredSubject === directionSubject) return null;
  return {
    directionSubject,
    structuredSubject,
    structuredSubjectLabel: silhouetteSubject.trim(),
  };
}

export interface GenerationBriefInput {
  readonly creativeDirection: string;
  readonly constraints: ConceptConstraints;
  readonly hasReferencePhoto: boolean;
}

export function generationBriefRows(input: GenerationBriefInput) {
  const direction = input.creativeDirection.trim();
  return [
    {
      label: "Creative direction",
      value: direction || "No additional direction",
    },
    { label: "Family", value: "Profile Wing Vertical" },
    {
      label: "Silhouette subject",
      value: input.constraints.silhouetteSubject.trim(),
    },
    { label: "Pole structure", value: "Exactly four poles · locked" },
    { label: "Colors", value: input.constraints.colors.trim() },
    {
      label: "Lower element",
      value: input.constraints.lowerElementPreference.replace("-", " "),
    },
    { label: "Sponsor area", value: input.constraints.sponsorArea },
    { label: "Style", value: input.constraints.style },
    {
      label: "Reference photo",
      value: input.hasReferencePhoto
        ? "Match the processed subject derivative"
        : "None",
    },
  ] as const;
}

export function assembleGenerationBrief(input: GenerationBriefInput) {
  const rows = generationBriefRows(input);
  return [
    "Authoritative generation brief:",
    ...rows.map(
      (row) =>
        `${row.label}: ${row.value}${/[.!?]$/.test(row.value) ? "" : "."}`,
    ),
  ].join("\n");
}
