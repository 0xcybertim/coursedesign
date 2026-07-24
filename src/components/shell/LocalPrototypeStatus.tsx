import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageProvider";

export function LocalPrototypeStatus({
  unavailable = false,
}: {
  readonly unavailable?: boolean;
}) {
  const { translate } = useLanguage();
  return (
    <Link className="local-prototype-status" href="/#local-prototype">
      <span aria-hidden="true" />
      {translate(
        unavailable
          ? "Temporary session · browser storage unavailable"
          : "Local prototype · saved in this browser",
      )}
    </Link>
  );
}
