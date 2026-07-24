"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LocalPrototypeStatus } from "./LocalPrototypeStatus";
import { LanguagePicker } from "./LanguagePicker";
import { MobileNavigation } from "./MobileNavigation";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { useLanguage } from "@/i18n/LanguageProvider";

export function AppHeader({
  labEnabled,
  onMenuStateChange,
}: {
  readonly labEnabled: boolean;
  readonly onMenuStateChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const { translate } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const showLab = labEnabled || pathname.startsWith("/lab");

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    onMenuStateChange(false);
  }, [onMenuStateChange]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) closeMobile();
    });
    return () => {
      cancelled = true;
    };
  }, [closeMobile, pathname]);

  function toggleMobile() {
    setMobileOpen((current) => {
      const next = !current;
      onMenuStateChange(next);
      return next;
    });
  }

  return (
    <header className="app-header">
      <Link className="app-identity" href="/">
        Course Design
      </Link>
      <PrimaryNavigation className="desktop-primary-navigation" />
      <div className="app-header-actions">
        {showLab ? (
          <Link className="lab-navigation-link" href="/lab">
            Lab
          </Link>
        ) : null}
        <LocalPrototypeStatus />
        <Link
          className="create-design-action"
          href="/designs/local-spj-04/edit"
        >
          <span className="create-design-long">Customize jump</span>
          <span className="create-design-short">Customize</span>
        </Link>
        <button
          ref={triggerRef}
          className="mobile-menu-trigger"
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-primary-navigation"
          onClick={toggleMobile}
        >
          {translate("Menu")}
        </button>
        <LanguagePicker />
      </div>
      <MobileNavigation
        open={mobileOpen}
        onClose={closeMobile}
        triggerRef={triggerRef}
      />
    </header>
  );
}
