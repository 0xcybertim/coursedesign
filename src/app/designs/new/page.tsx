import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Customize a jump",
  description:
    "Open the jump configurator and choose standard, described, or uploaded wings.",
};

export default function CreateDesignPage() {
  redirect("/designs/local-spj-04/edit");
}
