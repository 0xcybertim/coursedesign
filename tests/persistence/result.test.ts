import { describe, expect, it } from "vitest";

import {
  PERSISTENCE_HTTP_STATUS,
  persistenceFailure,
  staleVersionFailure,
} from "@/persistence";

describe("typed persistence results", () => {
  it("maps every approved failure kind to a stable HTTP status", () => {
    expect(PERSISTENCE_HTTP_STATUS).toEqual({
      validation: 400,
      stale_version: 409,
      missing_reference: 422,
      asset_unavailable: 422,
      session_invalid: 401,
      forbidden: 404,
      corrupt_record: 500,
      unsupported_schema: 409,
      temporarily_unavailable: 503,
    });
  });

  it("marks only infrastructure unavailability retryable by default", () => {
    expect(
      persistenceFailure("temporarily_unavailable", "Try again later."),
    ).toMatchObject({ error: { retryable: true } });
    expect(persistenceFailure("validation", "Invalid input.")).toMatchObject({
      error: { retryable: false },
    });
  });

  it("carries the minimum latest record needed for explicit conflict recovery", () => {
    expect(
      staleVersionFailure({
        expectedLockVersion: 3,
        actualLockVersion: 4,
        latest: { draft: "newer" },
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "stale_version",
        message:
          "This work changed in another context. Review the latest saved version before choosing how to recover your edit.",
        retryable: false,
        expectedLockVersion: 3,
        actualLockVersion: 4,
        latest: { draft: "newer" },
      },
    });
  });
});
