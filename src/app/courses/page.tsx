import type { Metadata } from "next";
import { CoursesOverviewClient } from "@/components/course/CoursesOverviewClient";

export const metadata: Metadata = {
  title: "Courses",
  description: "Open the browser-local course and its deterministic review.",
};

export default function CoursesPage() {
  return <CoursesOverviewClient />;
}
