export const PROFILE_WING_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const PROFILE_WING_REQUEST_MAX_BYTES =
  PROFILE_WING_SOURCE_MAX_BYTES + 256 * 1024;
export const PROFILE_WING_PROVIDER_TIMEOUT_MS = 60_000;

export interface ProfileWingMaskRouteAvailability {
  readonly enabled: boolean;
  readonly provider: "remove-bg" | "deterministic" | null;
  readonly reason:
    | "enabled"
    | "developer_flag_missing"
    | "provider_configuration_missing"
    | "provider_credential_missing"
    | "non_local_host";
}

function localHost(host: string | null | undefined) {
  if (!host) return true;
  const hostname = host.split(":")[0].replace(/^\[|\]$/g, "");
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export function getProfileWingMaskRouteAvailability(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  host?: string | null,
): ProfileWingMaskRouteAvailability {
  if (!localHost(host))
    return { enabled: false, provider: null, reason: "non_local_host" };
  if (environment.PROFILE_WING_CREATION_ENABLED !== "true")
    return {
      enabled: false,
      provider: null,
      reason: "developer_flag_missing",
    };
  const provider = environment.PROFILE_WING_MASK_PROVIDER;
  if (provider !== "remove-bg" && provider !== "deterministic")
    return {
      enabled: false,
      provider: null,
      reason: "provider_configuration_missing",
    };
  const credential =
    provider === "remove-bg"
      ? environment.REMOVE_BG_API_KEY
      : environment.PROFILE_WING_TEST_CREDENTIAL;
  if (!credential)
    return {
      enabled: false,
      provider,
      reason: "provider_credential_missing",
    };
  return { enabled: true, provider, reason: "enabled" };
}

export function getProfileWingMaskRouteAvailabilityForHosts(
  environment: Readonly<Record<string, string | undefined>>,
  hosts: readonly (string | null | undefined)[],
) {
  const candidates = hosts.flatMap((host) =>
    host
      ? host
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  );
  for (const host of candidates) {
    const availability = getProfileWingMaskRouteAvailability(environment, host);
    if (availability.reason === "non_local_host") return availability;
  }
  return getProfileWingMaskRouteAvailability(environment, candidates[0]);
}

export function detectProfileWingSourceMediaType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png" as const;
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg" as const;
  return null;
}
