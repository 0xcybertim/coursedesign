import type { Metadata } from "next";
import { SilhouetteReviewClient } from "@/components/silhouette/SilhouetteReviewClient";

export const metadata: Metadata = {
  title: "Silhouette Review · Phase 1H-B2",
  description:
    "Browser-local human review of deterministic Phase 1H-B1 silhouette evidence.",
};

export default function SilhouetteReviewPage() {
  return <SilhouetteReviewClient />;
}
