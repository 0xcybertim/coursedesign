import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Course Design",
    template: "%s · Course Design",
  },
  description:
    "Create and save exact obstacle design revisions, then arrange them in a course.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <AppShell
            labEnabled={process.env.DEVELOPER_LAB_ENABLED === "true"}
            persistenceMode={
              process.env.PERSISTENCE_MODE === "server" ? "server" : "browser"
            }
          >
            {children}
          </AppShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
