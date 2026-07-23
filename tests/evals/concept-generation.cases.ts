export interface ConceptGenerationEvalCase {
  readonly id: string;
  readonly prompt: string;
  readonly subject: string;
  readonly expected: {
    readonly fourPoles: true;
    readonly profileWingVertical: true;
    readonly noPeople: true;
    readonly conceptOnly: true;
  };
}

export const conceptGenerationCases: readonly ConceptGenerationEvalCase[] = [
  {
    id: "butterfly-navy-gold",
    prompt: "A butterfly-shaped jump with navy wings and gold edge details.",
    subject: "butterfly",
    expected: {
      fourPoles: true,
      profileWingVertical: true,
      noPeople: true,
      conceptOnly: true,
    },
  },
  {
    id: "castle-stone-blue",
    prompt: "A castle silhouette with cool stone colors and cobalt accents.",
    subject: "castle",
    expected: {
      fourPoles: true,
      profileWingVertical: true,
      noPeople: true,
      conceptOnly: true,
    },
  },
  {
    id: "horse-profile-coral",
    prompt: "An abstract horse profile in coral, cream, and black.",
    subject: "horse",
    expected: {
      fourPoles: true,
      profileWingVertical: true,
      noPeople: true,
      conceptOnly: true,
    },
  },
  {
    id: "leaf-heritage",
    prompt: "A heritage oak-leaf direction in forest green and warm white.",
    subject: "oak leaf",
    expected: {
      fourPoles: true,
      profileWingVertical: true,
      noPeople: true,
      conceptOnly: true,
    },
  },
  {
    id: "wave-graphic",
    prompt: "A graphic ocean-wave silhouette in cobalt and pale blue.",
    subject: "wave",
    expected: {
      fourPoles: true,
      profileWingVertical: true,
      noPeople: true,
      conceptOnly: true,
    },
  },
  {
    id: "dog-playful",
    prompt: "A playful dog outline with rust, cream, and navy markings.",
    subject: "dog",
    expected: {
      fourPoles: true,
      profileWingVertical: true,
      noPeople: true,
      conceptOnly: true,
    },
  },
];
