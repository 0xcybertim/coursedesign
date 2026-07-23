import { conceptGenerationCases } from "../tests/evals/concept-generation.cases.ts";

const results = conceptGenerationCases.map((item) => ({
  id: item.id,
  checks: {
    promptPresent: item.prompt.trim().length > 0,
    subjectPresent: item.subject.trim().length > 0,
    contractComplete: Object.values(item.expected).every(Boolean),
  },
}));

const passed = results.every((result) =>
  Object.values(result.checks).every(Boolean),
);
process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: "1.0.0-phase1g-eval",
      providerCallsMade: 0,
      note: "Offline case-contract validation only. Visual relevance and photo matching require a separately authorized live evaluation.",
      passed,
      results,
    },
    null,
    2,
  )}\n`,
);
process.exitCode = passed ? 0 : 1;
