import type { Metadata } from "next";
import { LabIndex } from "@/components/lab/LabIndex";

export const metadata: Metadata = {
  title: "Developer Lab",
  description: "Internal benchmark and renderer evidence screens.",
};

export default function LabPage() {
  return <LabIndex />;
}
