import {
  DOMAIN_SCHEMA_VERSION,
  type BillOfMaterials,
  type CourseFootprint,
} from "../product/types.ts";
import {
  PROFILE_WING_C1_SCHEMA_VERSION,
  type DerivedProfileWingPrototype,
  type ProfileWingProductionSpecPreview,
  type ProfileWingRevisionSnapshot,
} from "../product/profile-wing-definition.ts";
import {
  createLocalDesignWorkspace,
  parseLocalDesignWorkspace,
  serializeLocalDesignWorkspace,
  type LocalDesignWorkspace,
  type ObstacleDesignRevision,
} from "./local-revisions.ts";
import { stableHash } from "./stable-hash.ts";

export const LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION =
  "2.0.0-phase1h-generated-profiles" as const;
export const LOCAL_DESIGN_LIBRARY_STORAGE_KEY =
  "course-design.local-design-library.v2" as const;

export interface ProfileWingDesignRevision {
  readonly schemaVersion: typeof LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION;
  readonly revisionId: string;
  readonly designId: string;
  readonly familyId: "profile-wing-vertical-v1";
  readonly ordinal: number;
  readonly name: string;
  readonly createdAt: string;
  readonly configurationHash: string;
  readonly snapshot: ProfileWingRevisionSnapshot;
}

export type LocalDesignRevision =
  | ObstacleDesignRevision
  | ProfileWingDesignRevision;

export interface LocalDesignLibrary {
  readonly schemaVersion: typeof LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION;
  readonly spj04Workspace: LocalDesignWorkspace;
  readonly profileWingRevisions: readonly ProfileWingDesignRevision[];
  readonly migration: {
    readonly legacyStorageKey: "course-design.spj-04.local-workspace.v1";
    readonly importedLegacyWorkspace: boolean;
    readonly importedRevisionIds: readonly string[];
    readonly migratedAt: string;
  };
}

export type LocalDesignLibraryResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind:
          | "invalid_library"
          | "unsupported_library_schema"
          | "duplicate_revision_id"
          | "invalid_profile_revision";
        readonly message: string;
      };
    };

function failure(
  kind: Exclude<LocalDesignLibraryResult<never>, { ok: true }>["error"]["kind"],
  message: string,
): LocalDesignLibraryResult<never> {
  return { ok: false, error: { kind, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function profileIdentity(prototype: DerivedProfileWingPrototype) {
  return {
    schemaVersion: PROFILE_WING_C1_SCHEMA_VERSION,
    familyId: prototype.familyId,
    fixtureId: prototype.source.fixtureId,
    sourceMaskSha256: prototype.source.sourceMaskSha256,
    sourcePolygonSha256: prototype.source.sourcePolygonSha256,
    resultIdentitySha256: prototype.source.resultIdentitySha256,
    decisionHash: prototype.source.decisionHash,
    ...(prototype.source.sourceKind
      ? { sourceKind: prototype.source.sourceKind }
      : {}),
    ...(prototype.source.sourceLabel
      ? { sourceLabel: prototype.source.sourceLabel }
      : {}),
    ...(prototype.source.sourceContentHash
      ? { sourceContentHash: prototype.source.sourceContentHash }
      : {}),
    ...(prototype.source.provider
      ? { provider: prototype.source.provider }
      : {}),
    ...(prototype.appearance ? { appearance: prototype.appearance } : {}),
    geometrySha256: prototype.renderManifest.geometrySha256,
    envelopeMm: prototype.envelopeMm,
    genericQuantities: prototype.genericQuantities,
  };
}

function profileFootprint(
  prototype: DerivedProfileWingPrototype,
): CourseFootprint {
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    configurationHash: prototype.prototypeSha256,
    units: "mm",
    width: 5900,
    depth: 800,
    anchor: {
      x: 0,
      y: 0,
      definition: "midpoint_of_primary_pole_centerline",
    },
    polygon: prototype.footprint.polygon,
    evidenceStatus: "inferred",
    notForSurveyOrFabrication: true,
  };
}

function profileBillOfMaterials(
  prototype: DerivedProfileWingPrototype,
): BillOfMaterials {
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    configurationHash: prototype.prototypeSha256,
    evidenceStatus: "inferred",
    lines: prototype.genericQuantities.map((line) => ({
      componentKey:
        line.componentKey === "prototype_pole"
          ? "prototype_pole"
          : line.componentKey === "prototype_track"
            ? "prototype_track"
            : line.componentKey === "foot_or_ballast"
              ? "foot_or_ballast_assembly"
              : line.componentKey,
      label: line.label,
      quantity: line.quantity,
      evidenceStatus: "inferred",
    })),
    notForOrdering: true,
  };
}

function profileProductionSpec(
  prototype: DerivedProfileWingPrototype,
): ProfileWingProductionSpecPreview {
  return {
    schemaVersion: PROFILE_WING_C1_SCHEMA_VERSION,
    configurationHash: prototype.prototypeSha256,
    evidenceStatus: "inferred_not_supplier_confirmed",
    humanReadable: [
      `${prototype.displayName} generated from ${prototype.source.fixtureId}.`,
      ...(prototype.appearance
        ? [
            `Prototype appearance uses the ${prototype.appearance.frameColor} frame and wing color.`,
          ]
        : []),
      "The silhouette, dimensions, supports, and quantities are deterministic prototype assumptions.",
      "No supplier geometry, structural validation, production material, safety status, or ordering readiness is claimed.",
    ],
    machineReadable: {
      documentStatus: "generated_prototype_not_for_production",
      familyId: prototype.familyId,
      sourceFixtureId: prototype.source.fixtureId,
      sourcePolygonSha256: prototype.source.sourcePolygonSha256,
      geometrySha256: prototype.renderManifest.geometrySha256,
      prototypeAssumptions: {
        envelopeMm: prototype.envelopeMm,
        inferredPlateThicknessMm:
          prototype.renderManifest.sharedProfileGeometry
            .inferredExtrusionDepthMm,
      },
      missingSupplierConfirmation: [
        "plate material and thickness",
        "support geometry and structural performance",
        "component compatibility and safety",
        "fabrication tolerances and finishes",
        "supplier quantities, price, freight, and ordering terms",
      ],
    },
    notForProduction: true,
  };
}

function profileSnapshot(
  prototype: DerivedProfileWingPrototype,
): ProfileWingRevisionSnapshot {
  return {
    kind: "profile-wing-generated",
    prototype,
    footprint: profileFootprint(prototype),
    billOfMaterials: profileBillOfMaterials(prototype),
    productionSpec: profileProductionSpec(prototype),
    renderManifest: prototype.renderManifest,
    provenance: {
      classification: "generated",
      evidenceStatus: "inferred_not_supplier_confirmed",
      sourceFixtureId: prototype.source.fixtureId,
      sourceDecisionHash: prototype.source.decisionHash,
      sourcePolygonSha256: prototype.source.sourcePolygonSha256,
      ...(prototype.source.sourceKind
        ? { sourceKind: prototype.source.sourceKind }
        : {}),
      ...(prototype.source.sourceLabel
        ? { sourceLabel: prototype.source.sourceLabel }
        : {}),
      ...(prototype.source.sourceContentHash
        ? { sourceContentHash: prototype.source.sourceContentHash }
        : {}),
      ...(prototype.source.provider
        ? { provider: prototype.source.provider }
        : {}),
    },
  };
}

export function createLocalDesignLibrary(input: {
  readonly now: string;
  readonly draftId: string;
  readonly legacyWorkspace?: LocalDesignWorkspace;
}): LocalDesignLibrary {
  const workspace =
    input.legacyWorkspace ??
    createLocalDesignWorkspace({ draftId: input.draftId, now: input.now });
  return {
    schemaVersion: LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION,
    spj04Workspace: workspace,
    profileWingRevisions: [],
    migration: {
      legacyStorageKey: "course-design.spj-04.local-workspace.v1",
      importedLegacyWorkspace: input.legacyWorkspace !== undefined,
      importedRevisionIds: workspace.revisions.map(
        (revision) => revision.revisionId,
      ),
      migratedAt: input.now,
    },
  };
}

export function localDesignLibraryRevisions(
  library: LocalDesignLibrary,
): readonly LocalDesignRevision[] {
  return [...library.spj04Workspace.revisions, ...library.profileWingRevisions];
}

export function isProfileWingRevision(
  revision: LocalDesignRevision,
): revision is ProfileWingDesignRevision {
  return (
    "familyId" in revision && revision.familyId === "profile-wing-vertical-v1"
  );
}

export function saveProfileWingRevision(
  library: LocalDesignLibrary,
  input: {
    readonly prototype: DerivedProfileWingPrototype;
    readonly revisionId: string;
    readonly now: string;
    readonly name?: string;
  },
): LocalDesignLibraryResult<LocalDesignLibrary> {
  const all = localDesignLibraryRevisions(library);
  if (all.some((revision) => revision.revisionId === input.revisionId))
    return failure(
      "duplicate_revision_id",
      "Design revision identifiers must be unique across the local library.",
    );
  if (
    stableHash(profileIdentity(input.prototype)) !==
      input.prototype.prototypeSha256 ||
    input.prototype.renderManifest.geometrySha256 !==
      input.prototype.renderManifest.sharedProfileGeometry.geometrySha256 ||
    !input.prototype.renderManifest.projectionParity.exactSharedGeometry
  )
    return failure(
      "invalid_profile_revision",
      "The generated prototype failed its immutable identity checks.",
    );
  const designId = `local-profile-wing-${input.prototype.source.fixtureId}`;
  const ordinal =
    library.profileWingRevisions.filter(
      (revision) => revision.designId === designId,
    ).length + 1;
  const revision: ProfileWingDesignRevision = {
    schemaVersion: LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION,
    revisionId: input.revisionId,
    designId,
    familyId: input.prototype.familyId,
    ordinal,
    name:
      input.name?.trim() ||
      `${input.prototype.displayName} · ${input.prototype.source.fixtureId} · Revision ${ordinal}`,
    createdAt: input.now,
    configurationHash: input.prototype.prototypeSha256,
    snapshot: profileSnapshot(input.prototype),
  };
  return {
    ok: true,
    value: {
      ...library,
      profileWingRevisions: [...library.profileWingRevisions, revision],
    },
  };
}

function parseProfileRevision(
  value: unknown,
): LocalDesignLibraryResult<ProfileWingDesignRevision> {
  if (!isRecord(value) || !isRecord(value.snapshot))
    return failure(
      "invalid_profile_revision",
      "A profile revision is malformed.",
    );
  const candidate = value as unknown as ProfileWingDesignRevision;
  const prototypeCandidate = candidate.snapshot.prototype;
  if (
    candidate.schemaVersion !== LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION ||
    candidate.familyId !== "profile-wing-vertical-v1" ||
    typeof candidate.revisionId !== "string" ||
    typeof candidate.designId !== "string" ||
    !candidate.designId.startsWith("local-profile-wing-") ||
    !Number.isInteger(candidate.ordinal) ||
    candidate.ordinal < 1 ||
    typeof candidate.name !== "string" ||
    typeof candidate.createdAt !== "string" ||
    !isRecord(prototypeCandidate)
  )
    return failure(
      "invalid_profile_revision",
      "A profile revision failed its immutable identity checks.",
    );
  const prototype =
    prototypeCandidate as unknown as DerivedProfileWingPrototype;
  if (
    stableHash(profileIdentity(prototype)) !== prototype.prototypeSha256 ||
    candidate.configurationHash !== prototype.prototypeSha256
  )
    return failure(
      "invalid_profile_revision",
      "A profile revision failed its immutable identity checks.",
    );
  const canonicalSnapshot = profileSnapshot(prototype);
  if (stableHash(candidate.snapshot) !== stableHash(canonicalSnapshot))
    return failure(
      "invalid_profile_revision",
      "A profile revision projection was changed after saving.",
    );
  return {
    ok: true,
    value: { ...candidate, snapshot: canonicalSnapshot },
  };
}

export function parseLocalDesignLibrary(
  serialized: string,
): LocalDesignLibraryResult<LocalDesignLibrary> {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return failure(
      "invalid_library",
      "The local design library is not valid JSON.",
    );
  }
  if (!isRecord(value))
    return failure("invalid_library", "The local design library is malformed.");
  if (value.schemaVersion !== LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION)
    return failure(
      "unsupported_library_schema",
      "This local design library uses an unsupported schema.",
    );
  if (
    !isRecord(value.spj04Workspace) ||
    !Array.isArray(value.profileWingRevisions) ||
    !isRecord(value.migration)
  )
    return failure("invalid_library", "The local design library is malformed.");
  const spj04 = parseLocalDesignWorkspace(
    serializeLocalDesignWorkspace(
      value.spj04Workspace as unknown as LocalDesignWorkspace,
    ),
  );
  if (!spj04.ok)
    return failure(
      "invalid_library",
      `The imported SPJ-04 workspace is invalid: ${spj04.error.message}`,
    );
  const profiles: ProfileWingDesignRevision[] = [];
  const ids = new Set(
    spj04.value.revisions.map((revision) => revision.revisionId),
  );
  const ordinalByDesign = new Map<string, number>();
  for (const rawRevision of value.profileWingRevisions) {
    const parsed = parseProfileRevision(rawRevision);
    if (!parsed.ok) return parsed;
    if (ids.has(parsed.value.revisionId))
      return failure(
        "duplicate_revision_id",
        "Design revision identifiers must be unique across the local library.",
      );
    const expectedOrdinal =
      (ordinalByDesign.get(parsed.value.designId) ?? 0) + 1;
    if (parsed.value.ordinal !== expectedOrdinal)
      return failure(
        "invalid_profile_revision",
        "Profile revision ordinals must be append-only within one design.",
      );
    ordinalByDesign.set(parsed.value.designId, expectedOrdinal);
    ids.add(parsed.value.revisionId);
    profiles.push(parsed.value);
  }
  const migration = value.migration;
  if (
    migration.legacyStorageKey !== "course-design.spj-04.local-workspace.v1" ||
    typeof migration.importedLegacyWorkspace !== "boolean" ||
    !Array.isArray(migration.importedRevisionIds) ||
    !migration.importedRevisionIds.every(
      (id: unknown) => typeof id === "string",
    ) ||
    typeof migration.migratedAt !== "string"
  )
    return failure("invalid_library", "The migration record is malformed.");
  return {
    ok: true,
    value: {
      schemaVersion: LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION,
      spj04Workspace: spj04.value,
      profileWingRevisions: profiles,
      migration: migration as LocalDesignLibrary["migration"],
    },
  };
}

export function serializeLocalDesignLibrary(library: LocalDesignLibrary) {
  return JSON.stringify(library);
}

export function migrateLocalDesignLibrary(input: {
  readonly librarySerialized: string | null;
  readonly legacyWorkspaceSerialized: string | null;
  readonly now: string;
  readonly draftId: string;
}): LocalDesignLibraryResult<{
  readonly library: LocalDesignLibrary;
  readonly source: "v2_restored" | "legacy_v1_imported" | "fresh";
}> {
  if (input.librarySerialized !== null) {
    const parsed = parseLocalDesignLibrary(input.librarySerialized);
    if (parsed.ok)
      return {
        ok: true,
        value: { library: parsed.value, source: "v2_restored" },
      };
    return parsed;
  }
  if (input.legacyWorkspaceSerialized !== null) {
    const legacy = parseLocalDesignWorkspace(input.legacyWorkspaceSerialized);
    if (legacy.ok)
      return {
        ok: true,
        value: {
          library: createLocalDesignLibrary({
            now: input.now,
            draftId: input.draftId,
            legacyWorkspace: legacy.value,
          }),
          source: "legacy_v1_imported",
        },
      };
  }
  return {
    ok: true,
    value: {
      library: createLocalDesignLibrary({
        now: input.now,
        draftId: input.draftId,
      }),
      source: "fresh",
    },
  };
}
