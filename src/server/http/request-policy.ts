import { createHash } from "node:crypto";

import {
  persistenceFailure,
  type PersistenceResult,
} from "@/persistence/result";
export {
  COURSE_DESIGN_CSRF_HEADER,
  COURSE_DESIGN_CSRF_VALUE,
} from "@/persistence/request-policy-values";
import {
  COURSE_DESIGN_CSRF_HEADER,
  COURSE_DESIGN_CSRF_VALUE,
} from "@/persistence/request-policy-values";

export function verifyMutationRequest(
  request: Pick<Request, "headers">,
  allowedOrigins: readonly string[],
): PersistenceResult<null> {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) {
    return persistenceFailure(
      "forbidden",
      "This request did not come from an approved Course Design origin.",
    );
  }
  if (
    request.headers.get(COURSE_DESIGN_CSRF_HEADER) !== COURSE_DESIGN_CSRF_VALUE
  ) {
    return persistenceFailure(
      "forbidden",
      "This request is missing Course Design mutation protection.",
    );
  }
  return { ok: true, value: null };
}

interface RateLimitEntry {
  count: number;
  resetsAt: number;
}

export class BoundedRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly options: {
      readonly maximum: number;
      readonly windowMs: number;
      readonly maximumKeys: number;
    },
  ) {}

  allow(rawKey: string, now = Date.now()): boolean {
    const key = createHash("sha256").update(rawKey, "utf8").digest("hex");
    for (const [candidate, entry] of this.entries) {
      if (entry.resetsAt <= now) this.entries.delete(candidate);
    }
    if (
      !this.entries.has(key) &&
      this.entries.size >= this.options.maximumKeys
    ) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest) this.entries.delete(oldest);
    }
    const current = this.entries.get(key);
    if (!current || current.resetsAt <= now) {
      this.entries.set(key, {
        count: 1,
        resetsAt: now + this.options.windowMs,
      });
      return true;
    }
    if (current.count >= this.options.maximum) return false;
    current.count += 1;
    return true;
  }
}
