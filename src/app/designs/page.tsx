import type { Metadata } from "next";
import { DesignLibraryClient } from "@/components/design/DesignLibraryClient";

export const metadata: Metadata = {
  title: "Designs",
  description: "Browser-local obstacle designs grouped by immutable revision.",
};

export default function DesignsPage() {
  return <DesignLibraryClient />;
}
