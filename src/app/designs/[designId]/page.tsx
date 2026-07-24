import type { Metadata } from "next";
import { DesignDetailClient } from "@/components/design/DesignDetailClient";

export const metadata: Metadata = {
  title: "Saved design",
  description: "One browser-local obstacle design and its immutable revisions.",
};

export default async function DesignDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly designId: string }>;
}) {
  const { designId } = await params;
  return <DesignDetailClient designId={designId} />;
}
