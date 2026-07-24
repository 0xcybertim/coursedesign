import type { Metadata } from "next";
import { headers } from "next/headers";
import { StudioClient } from "@/components/studio/StudioClient";
import { getGenerationRouteAvailabilityForHosts } from "@/server/generation/request-policy";

export const metadata: Metadata = {
  title: "Customize your jump",
  description:
    "Customize standard or advanced wing styles, preview the complete jump, and save an exact browser-local revision.",
};

export const dynamic = "force-dynamic";

export default async function Spj04StudioPage({
  searchParams,
}: {
  searchParams: Promise<{
    force3d?: string;
    revision?: string;
    wing?: string;
    source?: string;
    concept?: string;
  }>;
}) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const generationAvailability = getGenerationRouteAvailabilityForHosts(
    process.env,
    [requestHeaders.get("x-forwarded-host"), requestHeaders.get("host")],
  );
  const initialWingStyle =
    params.wing === "description" || params.wing === "image"
      ? params.wing
      : "standard";
  const acceptedConceptHash =
    initialWingStyle === "description" &&
    params.source === "accepted-concept" &&
    /^[a-f0-9]{64}$/.test(params.concept ?? "")
      ? params.concept
      : undefined;

  return (
    <StudioClient
      forceThreeFailure={params.force3d === "fail"}
      requestedRevisionId={params.revision}
      conceptProviderMode={
        generationAvailability.enabled ? generationAvailability.provider : null
      }
      initialWingStyle={initialWingStyle}
      initialAcceptedConceptHash={acceptedConceptHash}
    />
  );
}
