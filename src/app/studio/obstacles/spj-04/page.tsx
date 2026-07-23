import type { Metadata } from "next";
import { StudioClient } from "@/components/studio/StudioClient";

export const metadata: Metadata = {
  title: "SPJ-04 Club Classic · Non-sellable prototype",
  description:
    "Phase 1F obstacle configurator prototype with browser-local artwork, immutable revisions, and exact 2.5D/3D parity. JUMPFORM is a working mockup wordmark.",
};

export default async function Spj04StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ force3d?: string }>;
}) {
  const params = await searchParams;
  return <StudioClient forceThreeFailure={params.force3d === "fail"} />;
}
