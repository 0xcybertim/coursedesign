import type { Metadata } from "next";
import { DesignDetailClient } from "@/components/design/DesignDetailClient";

export const metadata: Metadata = {
  title: "SPJ-04 · Club Classic",
  description: "Working draft and immutable SPJ-04 revision history.",
};

export default function Spj04DesignDetailPage() {
  return <DesignDetailClient designId="local-spj-04" />;
}
