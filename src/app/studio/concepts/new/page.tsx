import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ConceptStudioClient } from "@/components/concepts/ConceptStudioClient";
import { getGenerationRouteAvailabilityForHosts } from "@/server/generation/request-policy";

export const metadata: Metadata = {
  title: "Create a jump concept · Developer-only Phase 1G",
  description:
    "Developer-only browser-local concept generation with immutable history and explicit production boundaries.",
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
        <p className="eyebrow">Phase 1G · developer-only</p>
        <h1>Concept generation is unavailable.</h1>
        <p>
          This route requires the explicit Phase 1G flag, provider
          configuration, a server-side provider credential, and a localhost
          request. No credential value is exposed to the browser.
        </p>
        <code>{availability.reason}</code>
        <Link href="/">Return to the prototype index</Link>
      </main>
    );
  return <ConceptStudioClient providerMode={availability.provider} />;
}
