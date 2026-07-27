import { describe, expect, it } from "vitest";

import {
  BoundedRateLimiter,
  COURSE_DESIGN_CSRF_HEADER,
  COURSE_DESIGN_CSRF_VALUE,
  verifyMutationRequest,
} from "@/server/http/request-policy";
import {
  clearSessionCookie,
  serializeSessionCookie,
} from "@/server/http/session-cookie";
import {
  digestSessionToken,
  generateOpaqueSessionToken,
  isOpaqueSessionToken,
} from "@/server/identity/session-token";

describe("authentication boundary policy", () => {
  it("generates opaque tokens and stores deterministic SHA-256 digests", () => {
    const token = generateOpaqueSessionToken();
    expect(isOpaqueSessionToken(token)).toBe(true);
    expect(digestSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(digestSessionToken(token)).not.toContain(token);
  });

  it("serializes only __Host- secure HttpOnly SameSite cookies", () => {
    const token = "A".repeat(43);
    expect(serializeSessionCookie({ token, maxAgeSeconds: 2_592_000 })).toBe(
      `__Host-course-design-session=${token}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
    );
    expect(clearSessionCookie()).toBe(
      "__Host-course-design-session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    );
    expect(serializeSessionCookie({ token, maxAgeSeconds: 100 })).not.toContain(
      "Domain=",
    );
  });

  it("requires exact Origin and same-origin mutation protection", () => {
    const approved = new Request("https://coursedesign.onrender.com/api", {
      headers: {
        origin: "https://coursedesign.onrender.com",
        [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE,
      },
    });
    expect(
      verifyMutationRequest(approved, ["https://coursedesign.onrender.com"]),
    ).toEqual({ ok: true, value: null });
    expect(
      verifyMutationRequest(
        new Request("https://coursedesign.onrender.com/api", {
          headers: {
            origin: "https://attacker.invalid",
            [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE,
          },
        }),
        ["https://coursedesign.onrender.com"],
      ),
    ).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(
      verifyMutationRequest(
        new Request("https://coursedesign.onrender.com/api", {
          headers: {
            origin: "https://coursedesign.onrender.com",
            "sec-fetch-site": "cross-site",
            [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE,
          },
        }),
        ["https://coursedesign.onrender.com"],
      ),
    ).toMatchObject({ ok: false, error: { kind: "forbidden" } });
  });

  it("bounds rate-limit keys and requests without storing raw selectors", () => {
    const limiter = new BoundedRateLimiter({
      maximum: 2,
      windowMs: 1_000,
      maximumKeys: 2,
    });
    expect(limiter.allow("public@example.com", 0)).toBe(true);
    expect(limiter.allow("public@example.com", 1)).toBe(true);
    expect(limiter.allow("public@example.com", 2)).toBe(false);
    expect(limiter.allow("other@example.com", 3)).toBe(true);
    expect(limiter.allow("third@example.com", 4)).toBe(true);
    expect(limiter.allow("public@example.com", 1_001)).toBe(true);
  });
});
