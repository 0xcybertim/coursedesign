import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageProvider";

export function Breadcrumbs({
  items,
}: {
  readonly items: readonly {
    readonly label: string;
    readonly href?: string;
  }[];
}) {
  const { translate } = useLanguage();
  return (
    <nav className="breadcrumbs" aria-label={translate("Breadcrumb")}>
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? (
              <Link href={item.href}>{translate(item.label)}</Link>
            ) : (
              translate(item.label)
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
