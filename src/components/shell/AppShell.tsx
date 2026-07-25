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
import { ProvisionalWorkspaceSelector } from "@/components/workspace/ProvisionalWorkspaceSelector";

export function AppShell({
  children,
  labEnabled,
  persistenceMode = "browser",
}: {
  readonly children: React.ReactNode;
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
          <ProvisionalWorkspaceSelector
            checkExistingSession
            onWorkspaceChange={() => window.location.reload()}
          />
        </aside>
      ) : null}
      <RouteAnnouncer />
      <div className="app-page" inert={menuOpen ? true : undefined}>
        {children}
      </div>
    </PersistenceModeProvider>
  );
}
