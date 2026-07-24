"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { useLanguage } from "@/i18n/LanguageProvider";

export function MobileNavigation({
  open,
  onClose,
  triggerRef,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const { translate } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    const first = drawer?.querySelector<HTMLElement>("a, button");
    first?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = [...drawer.querySelectorAll<HTMLElement>("a, button")];
      if (focusable.length === 0) return;
      const firstItem = focusable[0]!;
      const lastItem = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, triggerRef]);

  if (!open) return null;
  return (
    <div
      ref={drawerRef}
      className="mobile-navigation-drawer"
      id="mobile-primary-navigation"
      role="dialog"
      aria-modal="true"
      aria-label={translate("Navigation")}
    >
      <div className="mobile-navigation-heading">
        <strong>Course Design</strong>
        <button type="button" onClick={onClose}>
          {translate("Close")}
        </button>
      </div>
      <PrimaryNavigation
        className="mobile-primary-navigation"
        onNavigate={onClose}
      />
      <Link
        className="mobile-create-design"
        href="/designs/local-spj-04/edit"
        onClick={onClose}
      >
        {translate("Customize jump")}
      </Link>
      <p>
        {translate(
          "Browser-local work stays on this device and is not backed up.",
        )}
      </p>
    </div>
  );
}
