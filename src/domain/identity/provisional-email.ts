export const UNVERIFIED_WORKSPACE_WARNING =
  "Unverified email workspace. Anyone who enters this email can access and change this work." as const;

export type EmailSelectorResult =
  | { readonly ok: true; readonly value: string }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: "invalid_email_selector";
        readonly message: string;
      };
    };

export function normalizeEmailSelector(input: unknown): EmailSelectorResult {
  if (typeof input !== "string") {
    return {
      ok: false,
      error: {
        kind: "invalid_email_selector",
        message: "Enter an email address to open a public workspace.",
      },
    };
  }
  const normalized = input.trim().toLowerCase();
  const at = normalized.indexOf("@");
  const local = at >= 0 ? normalized.slice(0, at) : "";
  const domain = at >= 0 ? normalized.slice(at + 1) : "";
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    at <= 0 ||
    at !== normalized.lastIndexOf("@") ||
    local.length > 64 ||
    domain.length > 255 ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.includes("..") ||
    /\s/.test(normalized)
  ) {
    return {
      ok: false,
      error: {
        kind: "invalid_email_selector",
        message: "Enter a valid email address of at most 320 characters.",
      },
    };
  }
  return { ok: true, value: normalized };
}
