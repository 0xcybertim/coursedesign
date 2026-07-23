import { DEFAULT_OBSTACLE_INTENT } from "../product/definition";
import {
  DOMAIN_SCHEMA_VERSION,
  type DerivedConfiguration,
  type FrameColor,
  type LowerElement,
  type ObstacleIntent,
} from "../product/types";
import { deriveConfiguration } from "./derive-configuration";
import { referencedArtworkHashes, type ArtworkConfiguration } from "../artwork";

export const LOCAL_WORKSPACE_SCHEMA_VERSION = "1.0.0-phase1b" as const;
export const LOCAL_WORKSPACE_STORAGE_KEY =
  "course-design.spj-04.local-workspace.v1" as const;

export interface StoredObstacleIntent {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  frameColor: FrameColor;
  poleTreatment: "two_color_alternating_segments";
  lowerElement: LowerElement;
  artwork: "fixed_panel_artwork" | "custom_artwork";
  artworkConfiguration?: ArtworkConfiguration;
}

export interface ObstacleDraft {
  schemaVersion: typeof LOCAL_WORKSPACE_SCHEMA_VERSION;
  draftId: string;
  designId: "local-spj-04";
  draftVersion: number;
  basedOnRevisionId: string | null;
  intent: StoredObstacleIntent;
  updatedAt: string;
}

export interface ObstacleDesignRevision {
  schemaVersion: typeof LOCAL_WORKSPACE_SCHEMA_VERSION;
  revisionId: string;
  designId: "local-spj-04";
  ordinal: number;
  name: string;
  createdAt: string;
  configurationHash: string;
  snapshot: DerivedConfiguration;
}

export interface LocalDesignWorkspace {
  schemaVersion: typeof LOCAL_WORKSPACE_SCHEMA_VERSION;
  designId: "local-spj-04";
  draft: ObstacleDraft;
  revisions: readonly ObstacleDesignRevision[];
}

export function referencedLocalDesignWorkspaceArtworkHashes(
  workspace: LocalDesignWorkspace,
): readonly string[] {
  const configurations = [
    workspace.draft.intent.artworkConfiguration,
    ...workspace.revisions.map(
      (revision) => revision.snapshot.configuration.artworkConfiguration,
    ),
  ].filter(
    (configuration): configuration is ArtworkConfiguration =>
      configuration !== undefined,
  );
  return [
    ...new Set(
      configurations.flatMap((configuration) =>
        referencedArtworkHashes(configuration),
      ),
    ),
  ].sort();
}

export interface LocalWorkspaceFailure {
  ok: false;
  error: {
    kind:
      | "invalid_workspace"
      | "unsupported_workspace_schema"
      | "invalid_draft"
      | "invalid_revision"
      | "revision_not_found"
      | "artifact_verification_required";
    message: string;
  };
}

export interface LocalWorkspaceSuccess<T> {
  ok: true;
  value: T;
}

export type LocalWorkspaceResult<T> =
  | LocalWorkspaceSuccess<T>
  | LocalWorkspaceFailure;

function failure(
  kind: LocalWorkspaceFailure["error"]["kind"],
  message: string,
): LocalWorkspaceFailure {
  return { ok: false, error: { kind, message } };
}

function snapshotIntent(snapshot: DerivedConfiguration): StoredObstacleIntent {
  const { configuration } = snapshot;
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    frameColor: configuration.frameColor,
    poleTreatment: configuration.poleTreatment,
    lowerElement: configuration.lowerElement,
    artwork: configuration.artwork,
    ...(configuration.artworkConfiguration
      ? { artworkConfiguration: configuration.artworkConfiguration }
      : {}),
  };
}

function deriveStoredIntent(
  intent: unknown,
): LocalWorkspaceResult<DerivedConfiguration> {
  const result = deriveConfiguration(intent);
  if (!result.ok) {
    return failure(
      "invalid_draft",
      "The locally stored draft contains unsupported prototype choices.",
    );
  }
  return result;
}

export function createLocalDesignWorkspace(input: {
  draftId: string;
  now: string;
}): LocalDesignWorkspace {
  const result = deriveConfiguration(DEFAULT_OBSTACLE_INTENT);
  if (!result.ok) {
    throw new Error("The built-in SPJ-04 default intent is invalid.");
  }

  return {
    schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
    designId: "local-spj-04",
    draft: {
      schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
      draftId: input.draftId,
      designId: "local-spj-04",
      draftVersion: 1,
      basedOnRevisionId: null,
      intent: snapshotIntent(result.value),
      updatedAt: input.now,
    },
    revisions: [],
  };
}

export function updateLocalDraft(
  workspace: LocalDesignWorkspace,
  intent: ObstacleIntent,
  now: string,
): LocalWorkspaceResult<LocalDesignWorkspace> {
  const derived = deriveStoredIntent(intent);
  if (!derived.ok) return derived;

  return {
    ok: true,
    value: {
      ...workspace,
      draft: {
        ...workspace.draft,
        draftVersion: workspace.draft.draftVersion + 1,
        intent: snapshotIntent(derived.value),
        updatedAt: now,
      },
    },
  };
}

export function saveLocalRevision(
  workspace: LocalDesignWorkspace,
  input: {
    revisionId: string;
    now: string;
    name?: string;
    verifiedArtifactHashes?: ReadonlySet<string>;
  },
): LocalWorkspaceResult<LocalDesignWorkspace> {
  if (
    workspace.revisions.some(
      (revision) => revision.revisionId === input.revisionId,
    )
  ) {
    return failure(
      "invalid_revision",
      "Local revision identifiers must be unique.",
    );
  }

  const derived = deriveStoredIntent(workspace.draft.intent);
  if (!derived.ok) return derived;
  const artworkConfiguration = derived.value.configuration.artworkConfiguration;
  if (artworkConfiguration) {
    const verified = input.verifiedArtifactHashes;
    const missing = referencedArtworkHashes(artworkConfiguration).filter(
      (hash) => !verified?.has(hash),
    );
    if (missing.length > 0) {
      return failure(
        "artifact_verification_required",
        "Every custom artwork source and rendered blob must be hash-verified before saving an immutable revision.",
      );
    }
  }

  const ordinal = workspace.revisions.length + 1;
  const revision: ObstacleDesignRevision = {
    schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
    revisionId: input.revisionId,
    designId: workspace.designId,
    ordinal,
    name: input.name?.trim() || `Club Classic · Revision ${ordinal}`,
    createdAt: input.now,
    configurationHash: derived.value.configurationHash,
    snapshot: derived.value,
  };

  return {
    ok: true,
    value: {
      ...workspace,
      revisions: [...workspace.revisions, revision],
    },
  };
}

export function findLocalRevision(
  workspace: LocalDesignWorkspace,
  revisionId: string,
): LocalWorkspaceResult<ObstacleDesignRevision> {
  const revision = workspace.revisions.find(
    (candidate) => candidate.revisionId === revisionId,
  );
  return revision
    ? { ok: true, value: revision }
    : failure("revision_not_found", "That local revision no longer exists.");
}

export function duplicateLocalRevision(
  workspace: LocalDesignWorkspace,
  revisionId: string,
  input: { draftId: string; now: string },
): LocalWorkspaceResult<LocalDesignWorkspace> {
  const found = findLocalRevision(workspace, revisionId);
  if (!found.ok) return found;

  return {
    ok: true,
    value: {
      ...workspace,
      draft: {
        schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
        draftId: input.draftId,
        designId: workspace.designId,
        draftVersion: 1,
        basedOnRevisionId: found.value.revisionId,
        intent: snapshotIntent(found.value.snapshot),
        updatedAt: input.now,
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseRevision(
  value: unknown,
  expectedOrdinal: number,
): LocalWorkspaceResult<ObstacleDesignRevision> {
  if (!isRecord(value)) {
    return failure("invalid_revision", "A saved revision is malformed.");
  }
  if (
    value.schemaVersion !== LOCAL_WORKSPACE_SCHEMA_VERSION ||
    value.designId !== "local-spj-04" ||
    value.ordinal !== expectedOrdinal ||
    !isNonEmptyString(value.revisionId) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.createdAt) ||
    !isNonEmptyString(value.configurationHash) ||
    !isRecord(value.snapshot) ||
    !isRecord(value.snapshot.configuration)
  ) {
    return failure("invalid_revision", "A saved revision is malformed.");
  }

  const derived = deriveStoredIntent(value.snapshot.configuration);
  if (
    !derived.ok ||
    derived.value.configurationHash !== value.configurationHash ||
    value.snapshot.configurationHash !== value.configurationHash
  ) {
    return failure(
      "invalid_revision",
      "A saved revision no longer matches its pinned configuration hash.",
    );
  }

  return {
    ok: true,
    value: {
      schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
      revisionId: value.revisionId,
      designId: "local-spj-04",
      ordinal: expectedOrdinal,
      name: value.name,
      createdAt: value.createdAt,
      configurationHash: value.configurationHash,
      snapshot: derived.value,
    },
  };
}

export function parseLocalDesignWorkspace(
  serialized: string,
): LocalWorkspaceResult<LocalDesignWorkspace> {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return failure(
      "invalid_workspace",
      "The local workspace is not valid JSON.",
    );
  }

  if (!isRecord(value)) {
    return failure("invalid_workspace", "The local workspace is malformed.");
  }
  if (value.schemaVersion !== LOCAL_WORKSPACE_SCHEMA_VERSION) {
    return failure(
      "unsupported_workspace_schema",
      "This local workspace was created by an unsupported prototype version.",
    );
  }
  if (
    value.designId !== "local-spj-04" ||
    !isRecord(value.draft) ||
    !Array.isArray(value.revisions)
  ) {
    return failure("invalid_workspace", "The local workspace is malformed.");
  }

  const draft = value.draft;
  if (
    draft.schemaVersion !== LOCAL_WORKSPACE_SCHEMA_VERSION ||
    draft.designId !== "local-spj-04" ||
    !isNonEmptyString(draft.draftId) ||
    !Number.isInteger(draft.draftVersion) ||
    (draft.draftVersion as number) < 1 ||
    !isNonEmptyString(draft.updatedAt) ||
    (draft.basedOnRevisionId !== null &&
      !isNonEmptyString(draft.basedOnRevisionId))
  ) {
    return failure("invalid_draft", "The locally stored draft is malformed.");
  }

  const draftDerived = deriveStoredIntent(draft.intent);
  if (!draftDerived.ok) return draftDerived;

  const revisions: ObstacleDesignRevision[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < value.revisions.length; index += 1) {
    const parsed = parseRevision(value.revisions[index], index + 1);
    if (!parsed.ok) return parsed;
    if (ids.has(parsed.value.revisionId)) {
      return failure(
        "invalid_revision",
        "Local revision identifiers must be unique.",
      );
    }
    ids.add(parsed.value.revisionId);
    revisions.push(parsed.value);
  }

  if (
    draft.basedOnRevisionId !== null &&
    !ids.has(draft.basedOnRevisionId as string)
  ) {
    return failure(
      "invalid_draft",
      "The local draft refers to a saved revision that does not exist.",
    );
  }

  return {
    ok: true,
    value: {
      schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
      designId: "local-spj-04",
      draft: {
        schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
        draftId: draft.draftId,
        designId: "local-spj-04",
        draftVersion: draft.draftVersion as number,
        basedOnRevisionId: draft.basedOnRevisionId as string | null,
        intent: snapshotIntent(draftDerived.value),
        updatedAt: draft.updatedAt,
      },
      revisions,
    },
  };
}

export function serializeLocalDesignWorkspace(
  workspace: LocalDesignWorkspace,
): string {
  return JSON.stringify(workspace);
}
