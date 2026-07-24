"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAVIGATION, isNavigationItemActive } from "./navigation";
import { useLanguage } from "@/i18n/LanguageProvider";

export function PrimaryNavigation({
  onNavigate,
  className = "",
}: {
  readonly onNavigate?: () => void;
  readonly className?: string;
}) {
  const pathname = usePathname();
  const { translate } = useLanguage();
  return (
    <nav
      aria-label={translate("Primary navigation")}
      className={`primary-navigation ${className}`.trim()}
    >
      {PRIMARY_NAVIGATION.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={
            isNavigationItemActive(pathname, item) ? "page" : undefined
          }
          onClick={onNavigate}
        >
          {translate(item.label)}
        </Link>
      ))}
    </nav>
  );
}
