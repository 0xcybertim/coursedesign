import type { Metadata } from "next";
import { CourseStudioClient } from "@/components/course/CourseStudioClient";

export const metadata: Metadata = {
  title: "Local Course 01 · Non-sellable prototype",
  description:
    "Phase 1C browser-local course workspace with pinned obstacle revisions and purchase-planning geometry warnings.",
};

export default async function LocalCourseStudioPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly revision?: string;
    readonly force3d?: string;
  }>;
}) {
  const query = await searchParams;
  return (
    <CourseStudioClient
      requestedRevisionId={query.revision}
      forceThreeFailure={query.force3d === "fail"}
    />
  );
}
