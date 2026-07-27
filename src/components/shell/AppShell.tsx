"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { RouteAnnouncer } from "./RouteAnnouncer";
import { useLanguage } from "@/i18n/LanguageProvider";
import {
  PersistenceModeProvider,
  type ClientPersistenceMode,
} from "@/components/persistence/PersistenceModeProvider";
import {
  AuthenticationPanel,
  type AuthenticationView,
} from "@/components/auth/AuthenticationPanel";

export type { AuthenticationView };

function ServerAuthenticatedPage({
  authentication,
  children,
}: {
  readonly authentication: AuthenticationView;
  readonly children: React.ReactNode;
}) {
  if (
    authentication.state !== "signed-in" ||
    !authentication.user.emailVerified
  ) {
    return (
      <main className="workspace-page workspace-home">
        <section className="workspace-hero">
          <div>
            <p className="eyebrow">Private team workspace</p>
            <h1>Customize a jump. Build a course.</h1>
            <p>
              Sign in with a verified account to open private designs, immutable
              revisions, canonical artwork, and courses.
            </p>
          </div>
          <p className="workspace-hero-proof">
            Authenticated
            <span>Workspace access is server-authorized</span>
          </p>
        </section>
        <section className="workspace-source-errors" role="status">
          <strong>
            {authentication.state === "signed-in"
              ? "Verify your email to continue."
              : authentication.state === "unavailable"
                ? "Authentication is temporarily unavailable."
                : "Sign in to open your private team workspace."}
          </strong>
          <p>Existing browser-local work was not read, imported, or changed.</p>
        </section>
      </main>
    );
  }
  return children;
}

export function AppShell({
  children,
  authentication = { state: "signed-out" },
  labEnabled,
  persistenceMode = "browser",
}: {
  readonly children: React.ReactNode;
  readonly authentication?: AuthenticationView;
  readonly labEnabled: boolean;
  readonly persistenceMode?: ClientPersistenceMode;
}) {
  const pathname = usePathname();
  const { translate } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    if (!main.id) main.id = "page-main";
    main.tabIndex = -1;
  }, [pathname]);

  return (
    <PersistenceModeProvider mode={persistenceMode}>
      <a className="skip-link" href="#page-main">
        {translate("Skip to page content")}
      </a>
      <AppHeader labEnabled={labEnabled} onMenuStateChange={setMenuOpen} />
      {persistenceMode === "server" ? (
        <aside className="server-workspace-selector">
          <AuthenticationPanel authentication={authentication} />
        </aside>
      ) : null}
      <RouteAnnouncer />
      <div className="app-page" inert={menuOpen ? true : undefined}>
        {persistenceMode === "server" ? (
          <ServerAuthenticatedPage authentication={authentication}>
            {children}
          </ServerAuthenticatedPage>
        ) : (
          children
        )}
      </div>
    </PersistenceModeProvider>
  );
}
