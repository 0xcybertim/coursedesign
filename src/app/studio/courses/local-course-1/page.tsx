import type { Metadata } from "next";
import { CourseStudioClient } from "@/components/course/CourseStudioClient";

export const metadata: Metadata = {
  title: "Local Course 01 · Non-sellable prototype",
  description:
    "Phase 1C browser-local course workspace with pinned obstacle revisions and purchase-planning geometry warnings.",
};

export default function LocalCourseStudioPage() {
  return <CourseStudioClient />;
}
