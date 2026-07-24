"use client";

import { usePathname } from "next/navigation";
import { routeLabel } from "./navigation";
import { useLanguage } from "@/i18n/LanguageProvider";

export function RouteAnnouncer() {
  const pathname = usePathname();
  const { translate } = useLanguage();
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {translate(routeLabel(pathname))}
    </p>
  );
}
