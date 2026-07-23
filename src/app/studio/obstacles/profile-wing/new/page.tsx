import type { Metadata } from "next";
import { ProfileWingCreatorClient } from "@/components/profile-wing/ProfileWingCreatorClient";

export const metadata: Metadata = {
  title: "Create Profile Wing · Non-sellable prototype",
  description:
    "Upload or select one source, remove its background, validate and accept a silhouette, then save a deterministic Profile Wing prototype.",
};

export default async function NewProfileWingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly force3d?: string }>;
}) {
  const query = await searchParams;
  return (
    <ProfileWingCreatorClient forceThreeFailure={query.force3d === "fail"} />
  );
}
