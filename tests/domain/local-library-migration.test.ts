import { describe, expect, it } from "vitest";
import {
  createLocalDesignWorkspace,
  deriveProfileWingPrototype,
  localDesignLibraryRevisions,
  migrateLocalDesignLibrary,
  parseLocalDesignLibrary,
  saveLocalRevision,
  saveProfileWingRevision,
  serializeLocalDesignLibrary,
  serializeLocalDesignWorkspace,
  type DerivedProfileWingPrototype,
  type LocalDesignLibrary,
} from "@/domain/design";
import {
  appendSilhouetteDecision,
  createEmptySilhouetteReview,
} from "@/domain/silhouette";

const T0 = "2026-07-23T08:00:00.000Z";
const T1 = "2026-07-23T08:01:00.000Z";
const T2 = "2026-07-23T08:02:00.000Z";

function legacyWorkspace() {
  const initial = createLocalDesignWorkspace({
    draftId: "legacy-draft",
    now: T0,
  });
  const saved = saveLocalRevision(initial, {
    revisionId: "legacy-revision-1",
    now: T1,
  });
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.value;
}

function profilePrototype(): DerivedProfileWingPrototype {
  const decision = appendSilhouetteDecision(createEmptySilhouetteReview(), {
    decisionId: "migration-profile-decision",
    fixtureId: "clean-dog-side",
    action: "accepted_for_future_prototyping",
    createdAt: T1,
  });
  if (!decision.ok) throw new Error(decision.error.message);
  const derived = deriveProfileWingPrototype({
    review: decision.value,
    fixtureId: "clean-dog-side",
  });
  if (!derived.ok) throw new Error(derived.error.message);
  return derived.value;
}

function migratedLibrary(): LocalDesignLibrary {
  const migrated = migrateLocalDesignLibrary({
    librarySerialized: null,
    legacyWorkspaceSerialized: serializeLocalDesignWorkspace(legacyWorkspace()),
    now: T2,
    draftId: "unused-fresh-draft",
  });
  if (!migrated.ok) throw new Error(migrated.error.message);
  return migrated.value.library;
}

describe("Phase 1H multi-design local-library migration", () => {
  it("imports one valid SPJ-04 v1 workspace without changing IDs or hashes", () => {
    const legacy = legacyWorkspace();
    const legacySerialized = serializeLocalDesignWorkspace(legacy);
    const migrated = migrateLocalDesignLibrary({
      librarySerialized: null,
      legacyWorkspaceSerialized: legacySerialized,
      now: T2,
      draftId: "unused-fresh-draft",
    });
    expect(migrated).toMatchObject({
      ok: true,
      value: {
        source: "legacy_v1_imported",
        library: {
          migration: {
            importedLegacyWorkspace: true,
            importedRevisionIds: ["legacy-revision-1"],
          },
        },
      },
    });
    if (!migrated.ok) return;
    expect(
      serializeLocalDesignWorkspace(migrated.value.library.spj04Workspace),
    ).toBe(legacySerialized);
    expect(legacySerialized).toBe(serializeLocalDesignWorkspace(legacy));
  });

  it("restores v2 directly and never reimports a changed legacy key", () => {
    const library = migratedLibrary();
    const restored = migrateLocalDesignLibrary({
      librarySerialized: serializeLocalDesignLibrary(library),
      legacyWorkspaceSerialized: serializeLocalDesignWorkspace(
        createLocalDesignWorkspace({ draftId: "later-legacy", now: T2 }),
      ),
      now: "2026-07-23T09:00:00.000Z",
      draftId: "unused",
    });
    expect(restored).toMatchObject({
      ok: true,
      value: {
        source: "v2_restored",
        library: {
          spj04Workspace: { draft: { draftId: "legacy-draft" } },
        },
      },
    });
  });

  it("appends an immutable generated profile revision to the shared library", () => {
    const prototype = profilePrototype();
    const saved = saveProfileWingRevision(migratedLibrary(), {
      prototype,
      revisionId: "profile-revision-1",
      now: T2,
    });
    expect(saved).toMatchObject({
      ok: true,
      value: {
        profileWingRevisions: [
          {
            revisionId: "profile-revision-1",
            designId: "local-profile-wing-clean-dog-side",
            familyId: "profile-wing-vertical-v1",
            ordinal: 1,
            configurationHash: prototype.prototypeSha256,
            snapshot: {
              kind: "profile-wing-generated",
              footprint: { width: 5900, depth: 800 },
              provenance: {
                classification: "generated",
                evidenceStatus: "inferred_not_supplier_confirmed",
              },
            },
          },
        ],
      },
    });
    if (!saved.ok) return;
    expect(
      localDesignLibraryRevisions(saved.value).map((item) => item.revisionId),
    ).toEqual(["legacy-revision-1", "profile-revision-1"]);
    const parsed = parseLocalDesignLibrary(
      serializeLocalDesignLibrary(saved.value),
    );
    expect(parsed).toEqual(saved);
  });

  it("rejects profile snapshot tampering and cross-library revision ID reuse", () => {
    const prototype = profilePrototype();
    const duplicate = saveProfileWingRevision(migratedLibrary(), {
      prototype,
      revisionId: "legacy-revision-1",
      now: T2,
    });
    expect(duplicate).toMatchObject({
      ok: false,
      error: { kind: "duplicate_revision_id" },
    });

    const saved = saveProfileWingRevision(migratedLibrary(), {
      prototype,
      revisionId: "profile-revision-1",
      now: T2,
    });
    if (!saved.ok) throw new Error(saved.error.message);
    const tampered = JSON.parse(serializeLocalDesignLibrary(saved.value));
    tampered.profileWingRevisions[0].snapshot.footprint.width = 5100;
    expect(parseLocalDesignLibrary(JSON.stringify(tampered))).toMatchObject({
      ok: false,
      error: { kind: "invalid_profile_revision" },
    });
  });
});
