import Link from "next/link";
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";
import { useLanguage } from "@/i18n/LanguageProvider";

export function LocalPrototypeStatus({
  unavailable = false,
}: {
  readonly unavailable?: boolean;
}) {
  const { translate } = useLanguage();
  const persistenceMode = usePersistenceMode();
  return (
    <Link className="local-prototype-status" href="/#local-prototype">
      <span aria-hidden="true" />
      {translate(
        persistenceMode === "server"
          ? "Server workspace · shared through this public selector"
          : unavailable
            ? "Temporary session · browser storage unavailable"
            : "Local prototype · saved in this browser",
      )}
    </Link>
  );
}
