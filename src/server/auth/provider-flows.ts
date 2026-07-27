import "server-only";

export async function reauthenticationUrl(input: {
  readonly maxAge: number;
  readonly returnTo: string;
}): Promise<string> {
  const { getSignInUrl } = await import("@workos-inc/authkit-nextjs");
  return getSignInUrl(input);
}
