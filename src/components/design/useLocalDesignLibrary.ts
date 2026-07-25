"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createLocalDesignLibrary,
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  LOCAL_WORKSPACE_STORAGE_KEY,
  localDesignLibraryRevisions,
  migrateLocalDesignLibrary,
  saveProfileWingRevision,
  serializeLocalDesignLibrary,
  type DerivedProfileWingPrototype,
  type LocalDesignLibrary,
  type LocalDesignLibraryResult,
  type ProfileWingDesignRevision,
} from "@/domain/design";
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";
import type { DesignRevisionPage } from "@/persistence";
import {
  persistenceApi,
  uploadCanonicalArtwork,
} from "@/lib/browser/persistence-api";
import { renderCanonicalProfileWing } from "@/lib/browser/profile-wing-canonical-render";

function localId(prefix: "draft" | "revision") {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type SaveGeneratedProfileResult =
  | {
      readonly ok: true;
      readonly library: LocalDesignLibrary;
      readonly revision: ProfileWingDesignRevision;
    }
  | Extract<LocalDesignLibraryResult<never>, { readonly ok: false }>;

export function useLocalDesignLibrary() {
  const persistenceMode = usePersistenceMode();
  const [library, setLibrary] = useState<LocalDesignLibrary | null>(null);
  const libraryRef = useRef<LocalDesignLibrary | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState("Checking the local design library…");
  const [integrityError, setIntegrityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (persistenceMode === "server") {
      void persistenceApi<DesignRevisionPage>(
        "/api/designs/local-spj-04/revisions?limit=100",
      ).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setStatus(result.error.message);
          setIntegrityError(result.error.message);
          setHydrated(true);
          return;
        }
        const next = createLocalDesignLibrary({
          draftId: "server-library-envelope",
          now: new Date().toISOString(),
        });
        const serverLibrary: LocalDesignLibrary = {
          ...next,
          spj04Workspace: {
            ...next.spj04Workspace,
            revisions: result.value.revisions.filter(
              (revision) => revision.designId === "local-spj-04",
            ) as LocalDesignLibrary["spj04Workspace"]["revisions"],
          },
          profileWingRevisions: result.value.revisions.filter(
            (revision): revision is ProfileWingDesignRevision =>
              "familyId" in revision &&
              revision.familyId === "profile-wing-vertical-v1",
          ),
        };
        libraryRef.current = serverLibrary;
        setLibrary(serverLibrary);
        setStatus("Design library restored from server workspace");
        setHydrated(true);
      });
      return () => {
        cancelled = true;
      };
    }
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
  }, [persistenceMode]);

  async function saveGeneratedProfile(
    prototype: DerivedProfileWingPrototype,
  ): Promise<SaveGeneratedProfileResult> {
    const current = libraryRef.current;
    if (!current)
      return {
        ok: false as const,
        error: {
          kind: "invalid_library" as const,
          message: "The trusted local design library is unavailable.",
        },
      };
    if (persistenceMode === "server") {
      try {
        const canonical = await renderCanonicalProfileWing(prototype);
        const uploaded = await uploadCanonicalArtwork(canonical);
        if (!uploaded.ok) {
          return {
            ok: false,
            error: {
              kind: "invalid_profile_revision",
              message: uploaded.error.message,
            },
          };
        }
        const saved = await persistenceApi<ProfileWingDesignRevision>(
          "/api/designs/profile-wings/revisions",
          {
            method: "POST",
            body: JSON.stringify({
              idempotencyKey: localId("revision"),
              prototype,
              canonicalRenderHash: canonical.contentHash,
            }),
          },
        );
        if (!saved.ok) {
          return {
            ok: false,
            error: {
              kind: "invalid_profile_revision",
              message: saved.error.message,
            },
          };
        }
        const next: LocalDesignLibrary = {
          ...current,
          profileWingRevisions: [...current.profileWingRevisions, saved.value],
        };
        libraryRef.current = next;
        setLibrary(next);
        setStatus(
          `Generated revision ${String(saved.value.ordinal).padStart(
            2,
            "0",
          )} saved to server workspace`,
        );
        return { ok: true, library: next, revision: saved.value };
      } catch {
        return {
          ok: false,
          error: {
            kind: "invalid_profile_revision",
            message:
              "The canonical Profile Wing derivative could not be created. Nothing was saved.",
          },
        };
      }
    }
    const revisionId = localId("revision");
    const saved = saveProfileWingRevision(current, {
      prototype,
      revisionId,
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
    const revision = saved.value.profileWingRevisions.find(
      (item) => item.revisionId === revisionId,
    );
    if (!revision)
      return {
        ok: false,
        error: {
          kind: "invalid_profile_revision",
          message:
            "The exact generated revision could not be recovered after the immutable append.",
        },
      };
    return { ok: true, library: saved.value, revision };
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
