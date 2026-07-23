import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Course Design Prototype",
  description: "Non-sellable SPJ-04 configuration prototype.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
