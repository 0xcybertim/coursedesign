import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ConceptStudioClient } from "@/components/concepts/ConceptStudioClient";
import { getGenerationRouteAvailabilityForHosts } from "@/server/generation/request-policy";

export const metadata: Metadata = {
  title: "Describe custom wings",
  description:
    "Describe custom jump wings with immutable concept history and explicit prototype boundaries.",
};

export const dynamic = "force-dynamic";

export default async function ConceptStudioPage() {
  const requestHeaders = await headers();
  const availability = getGenerationRouteAvailabilityForHosts(process.env, [
    requestHeaders.get("x-forwarded-host"),
    requestHeaders.get("host"),
  ]);
  if (!availability.enabled || !availability.provider)
    return (
      <main className="concept-disabled-route">
        <p className="eyebrow">Visual concept workflow</p>
        <h1>Wing-description generation is unavailable.</h1>
        <p>
          This local environment has not enabled a concept provider. No
          credential value is exposed to the browser.
        </p>
        <code>{availability.reason}</code>
        <Link href="/designs/local-spj-04/edit">
          Return to Customize a jump
        </Link>
      </main>
    );
  return <ConceptStudioClient providerMode={availability.provider} />;
}
