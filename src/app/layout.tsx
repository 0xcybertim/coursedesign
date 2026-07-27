import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell, type AuthenticationView } from "@/components/shell/AppShell";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { resolveProviderSession } from "@/server/auth/provider-session";
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

async function readAuthenticationView(): Promise<AuthenticationView> {
  if (process.env.PERSISTENCE_MODE !== "server") {
    return { state: "signed-out" };
  }
  try {
    const authenticated = await resolveProviderSession(await headers());
    if (!authenticated) return { state: "signed-out" };
    return {
      state: "signed-in",
      user: {
        name:
          authenticated.identity.displayName ||
          authenticated.identity.email.split("@")[0] ||
          "Course designer",
        email: authenticated.identity.email,
        emailVerified: authenticated.identity.emailVerified,
      },
    };
  } catch {
    return { state: "unavailable" };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authentication = await readAuthenticationView();
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <AppShell
            authentication={authentication}
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
