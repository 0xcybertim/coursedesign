import {
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  LOCAL_WORKSPACE_STORAGE_KEY,
  localDesignLibraryRevisions,
  migrateLocalDesignLibrary,
  parseLocalDesignWorkspace,
  saveLocalRevision,
  saveProfileWingRevision,
  serializeLocalDesignLibrary,
  serializeLocalDesignWorkspace,
  type LocalDesignLibrary,
  type ObstacleDesignRevision,
} from "@/domain/design";
import type {
  AppendFinalProfileWingRevisionInput,
  AppendStarterRevisionInput,
  DesignRecord,
  DesignRepository,
  DesignRevisionPage,
  SaveDesignDraftInput,
} from "@/persistence/design-repository";
import { STARTER_DESIGN_ROUTE_KEY } from "@/persistence/design-repository";
import {
  persistenceFailure,
  staleVersionFailure,
  type PersistenceResult,
} from "@/persistence/result";

import {
  browserLocalStorage,
  type BrowserKeyValueStorage,
} from "./browser-storage";

interface BrowserDesignRepositoryOptions {
  readonly storage?: BrowserKeyValueStorage;
  readonly now?: () => string;
  readonly createId?: (kind: "draft" | "revision") => string;
}

function defaultId(kind: "draft" | "revision"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${kind}-${crypto.randomUUID()}`;
  }
  return `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function record(library: LocalDesignLibrary): DesignRecord {
  const draft = library.spj04Workspace.draft;
  return {
    routeKey: STARTER_DESIGN_ROUTE_KEY,
    familyId: "spj-04-club-classic",
    displayName: "SPJ-04 · Club Classic",
    draft,
    lockVersion: draft.draftVersion,
    updatedAt: draft.updatedAt,
  };
}

export class BrowserDesignRepository implements DesignRepository {
  private readonly storage: BrowserKeyValueStorage;
  private readonly now: () => string;
  private readonly createId: (kind: "draft" | "revision") => string;

  constructor(options: BrowserDesignRepositoryOptions = {}) {
    this.storage = options.storage ?? browserLocalStorage();
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? defaultId;
  }

  private loadLibrary(): PersistenceResult<LocalDesignLibrary> {
    try {
      const migrated = migrateLocalDesignLibrary({
        librarySerialized: this.storage.getItem(
          LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
        ),
        legacyWorkspaceSerialized: this.storage.getItem(
          LOCAL_WORKSPACE_STORAGE_KEY,
        ),
        now: this.now(),
        draftId: this.createId("draft"),
      });
      if (!migrated.ok) {
        return persistenceFailure(
          migrated.error.kind.includes("schema")
            ? "unsupported_schema"
            : "corrupt_record",
          migrated.error.message,
        );
      }
      this.storage.setItem(
        LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
        serializeLocalDesignLibrary(migrated.value.library),
      );
      return { ok: true, value: migrated.value.library };
    } catch {
      return persistenceFailure(
        "temporarily_unavailable",
        "Browser design storage is unavailable.",
      );
    }
  }

  private storeLibrary(
    library: LocalDesignLibrary,
  ): PersistenceResult<LocalDesignLibrary> {
    try {
      this.storage.setItem(
        LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
        serializeLocalDesignLibrary(library),
      );
      return { ok: true, value: library };
    } catch {
      return persistenceFailure(
        "temporarily_unavailable",
        "Browser design storage is unavailable.",
      );
    }
  }

  async loadDesign(
    routeKey: typeof STARTER_DESIGN_ROUTE_KEY,
  ): Promise<PersistenceResult<DesignRecord>> {
    if (routeKey !== STARTER_DESIGN_ROUTE_KEY) {
      return persistenceFailure(
        "missing_reference",
        "That design is unavailable.",
      );
    }
    const loaded = this.loadLibrary();
    return loaded.ok ? { ok: true, value: record(loaded.value) } : loaded;
  }

  async saveDraft(
    input: SaveDesignDraftInput,
  ): Promise<PersistenceResult<DesignRecord, DesignRecord>> {
    const loaded = this.loadLibrary();
    if (!loaded.ok) return loaded;
    const latest = record(loaded.value);
    if (latest.lockVersion !== input.expectedLockVersion) {
      return staleVersionFailure({
        expectedLockVersion: input.expectedLockVersion,
        actualLockVersion: latest.lockVersion,
        latest,
      });
    }
    const candidate = {
      ...loaded.value.spj04Workspace,
      draft: input.draft,
    };
    const parsed = parseLocalDesignWorkspace(
      serializeLocalDesignWorkspace(candidate),
    );
    if (!parsed.ok) {
      return persistenceFailure("validation", parsed.error.message);
    }
    const stored = this.storeLibrary({
      ...loaded.value,
      spj04Workspace: parsed.value,
    });
    return stored.ok ? { ok: true, value: record(stored.value) } : stored;
  }

  async appendStarterRevision(input: AppendStarterRevisionInput): Promise<
    PersistenceResult<
      {
        readonly design: DesignRecord;
        readonly revision: ObstacleDesignRevision;
      },
      DesignRecord
    >
  > {
    const loaded = this.loadLibrary();
    if (!loaded.ok) return loaded;
    const latest = record(loaded.value);
    if (latest.lockVersion !== input.expectedLockVersion) {
      return staleVersionFailure({
        expectedLockVersion: input.expectedLockVersion,
        actualLockVersion: latest.lockVersion,
        latest,
      });
    }
    const saved = saveLocalRevision(loaded.value.spj04Workspace, {
      revisionId: this.createId("revision"),
      now: this.now(),
      name: input.name,
      verifiedArtifactHashes: new Set(input.referencedRenderableArtworkHashes),
    });
    if (!saved.ok) {
      return persistenceFailure("validation", saved.error.message);
    }
    const revision = saved.value.revisions.at(-1);
    if (!revision) {
      return persistenceFailure(
        "corrupt_record",
        "The saved revision could not be recovered.",
      );
    }
    const stored = this.storeLibrary({
      ...loaded.value,
      spj04Workspace: saved.value,
    });
    if (!stored.ok) return stored;
    return {
      ok: true,
      value: { design: record(stored.value), revision },
    };
  }

  async appendFinalProfileWingRevision(
    input: AppendFinalProfileWingRevisionInput,
  ) {
    const loaded = this.loadLibrary();
    if (!loaded.ok) return loaded;
    const saved = saveProfileWingRevision(loaded.value, {
      prototype: input.prototype,
      revisionId: this.createId("revision"),
      now: this.now(),
      name: input.name,
    });
    if (!saved.ok) {
      return persistenceFailure("validation", saved.error.message);
    }
    const revision = saved.value.profileWingRevisions.at(-1);
    if (!revision) {
      return persistenceFailure(
        "corrupt_record",
        "The saved Profile Wing revision could not be recovered.",
      );
    }
    const stored = this.storeLibrary(saved.value);
    return stored.ok ? { ok: true as const, value: revision } : stored;
  }

  async listRevisions(input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<PersistenceResult<DesignRevisionPage>> {
    const loaded = this.loadLibrary();
    if (!loaded.ok) return loaded;
    const revisions = localDesignLibraryRevisions(loaded.value);
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100);
    const start = input?.cursor
      ? Math.max(
          revisions.findIndex(
            (revision) => revision.revisionId === input.cursor,
          ) + 1,
          0,
        )
      : 0;
    const page = revisions.slice(start, start + limit);
    return {
      ok: true,
      value: {
        revisions: page,
        nextCursor:
          start + limit < revisions.length
            ? (page.at(-1)?.revisionId ?? null)
            : null,
      },
    };
  }
}
