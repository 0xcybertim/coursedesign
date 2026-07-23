"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  LOCAL_WORKSPACE_STORAGE_KEY,
  localDesignLibraryRevisions,
  migrateLocalDesignLibrary,
  saveProfileWingRevision,
  serializeLocalDesignLibrary,
  type DerivedProfileWingPrototype,
  type LocalDesignLibrary,
} from "@/domain/design";

function localId(prefix: "draft" | "revision") {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useLocalDesignLibrary() {
  const [library, setLibrary] = useState<LocalDesignLibrary | null>(null);
  const libraryRef = useRef<LocalDesignLibrary | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState("Checking the local design library…");
  const [integrityError, setIntegrityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const migrated = migrateLocalDesignLibrary({
          librarySerialized: localStorage.getItem(
            LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
          ),
          legacyWorkspaceSerialized: localStorage.getItem(
            LOCAL_WORKSPACE_STORAGE_KEY,
          ),
          now: new Date().toISOString(),
          draftId: localId("draft"),
        });
        if (!migrated.ok) {
          setIntegrityError(
            `${migrated.error.kind}: ${migrated.error.message}`,
          );
          setStatus(
            "Untrusted local design library rejected · no overwrite performed",
          );
        } else {
          libraryRef.current = migrated.value.library;
          setLibrary(migrated.value.library);
          localStorage.setItem(
            LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
            serializeLocalDesignLibrary(migrated.value.library),
          );
          setStatus(
            migrated.value.source === "legacy_v1_imported"
              ? "Legacy SPJ-04 library imported once into v2"
              : migrated.value.source === "v2_restored"
                ? "Design library restored on this device"
                : "Empty design library saved on this device",
          );
        }
      } catch {
        const migrated = migrateLocalDesignLibrary({
          librarySerialized: null,
          legacyWorkspaceSerialized: null,
          now: new Date().toISOString(),
          draftId: localId("draft"),
        });
        if (migrated.ok) {
          libraryRef.current = migrated.value.library;
          setLibrary(migrated.value.library);
        }
        setStatus(
          "Browser storage unavailable · library changes last for this tab only",
        );
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function saveGeneratedProfile(prototype: DerivedProfileWingPrototype) {
    const current = libraryRef.current;
    if (!current)
      return {
        ok: false as const,
        error: {
          kind: "invalid_library" as const,
          message: "The trusted local design library is unavailable.",
        },
      };
    const saved = saveProfileWingRevision(current, {
      prototype,
      revisionId: localId("revision"),
      now: new Date().toISOString(),
    });
    if (!saved.ok) return saved;
    libraryRef.current = saved.value;
    setLibrary(saved.value);
    try {
      localStorage.setItem(
        LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
        serializeLocalDesignLibrary(saved.value),
      );
      setStatus(
        `Generated revision ${String(
          saved.value.profileWingRevisions.at(-1)?.ordinal ?? 0,
        ).padStart(2, "0")} saved in the v2 design library`,
      );
    } catch {
      setStatus(
        "Browser storage unavailable · generated revision lasts for this tab only",
      );
    }
    return saved;
  }

  return {
    library,
    revisions: useMemo(
      () => (library ? localDesignLibraryRevisions(library) : []),
      [library],
    ),
    hydrated,
    status,
    integrityError,
    saveGeneratedProfile,
  };
}
