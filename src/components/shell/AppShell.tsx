"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { RouteAnnouncer } from "./RouteAnnouncer";
import { useLanguage } from "@/i18n/LanguageProvider";

export function AppShell({
  children,
  labEnabled,
}: {
  readonly children: React.ReactNode;
  readonly labEnabled: boolean;
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
    <>
      <a className="skip-link" href="#page-main">
        {translate("Skip to page content")}
      </a>
      <AppHeader labEnabled={labEnabled} onMenuStateChange={setMenuOpen} />
      <RouteAnnouncer />
      <div className="app-page" inert={menuOpen ? true : undefined}>
        {children}
      </div>
    </>
  );
}
