import type { Metadata } from "next";
import { CourseReviewClient } from "@/components/course/CourseReviewClient";

export const metadata: Metadata = {
  title: "Course Review Sheet · Local Course 01",
  description:
    "Deterministic browser-local review of pinned obstacle revisions, course geometry warnings, and prototype equipment quantities.",
};

export default function LocalCourseReviewPage() {
  return <CourseReviewClient />;
}
