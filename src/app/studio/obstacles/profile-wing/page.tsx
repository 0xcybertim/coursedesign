import type { Metadata } from "next";
import { ProfileWingStudioClient } from "@/components/profile-wing/ProfileWingStudioClient";

export const metadata: Metadata = {
  title: "Profile Wing Vertical · Phase 1H-C2",
  description:
    "Read-only 2.5D and 3D parity proof for a generated silhouette prototype.",
};

export default async function ProfileWingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly fixture?: string;
    readonly force3d?: string;
  }>;
}) {
  const query = await searchParams;
  return (
    <ProfileWingStudioClient
      requestedFixtureId={query.fixture}
      forceThreeFailure={query.force3d === "fail"}
    />
  );
}
