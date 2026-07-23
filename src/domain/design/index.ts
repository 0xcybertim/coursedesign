export { deriveConfiguration } from "./derive-configuration";
export {
  deriveProfileWingPrototype,
  deriveProfileWingPrototypeFromCreation,
} from "./derive-profile-wing";
export {
  PROFILE_WING_C1_DEFINITION,
  PROFILE_WING_C1_SCHEMA_VERSION,
} from "../product/profile-wing-definition";
export type * from "../product/profile-wing-definition";
export {
  createLocalDesignWorkspace,
  duplicateLocalRevision,
  findLocalRevision,
  LOCAL_WORKSPACE_SCHEMA_VERSION,
  LOCAL_WORKSPACE_STORAGE_KEY,
  parseLocalDesignWorkspace,
  referencedLocalDesignWorkspaceArtworkHashes,
  saveLocalRevision,
  serializeLocalDesignWorkspace,
  updateLocalDraft,
} from "./local-revisions";
export { stableHash, stableSerialize } from "./stable-hash";
export {
  createLocalDesignLibrary,
  isProfileWingRevision,
  localDesignLibraryRevisions,
  LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION,
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  migrateLocalDesignLibrary,
  parseLocalDesignLibrary,
  saveProfileWingRevision,
  serializeLocalDesignLibrary,
} from "./local-library";
export type {
  LocalDesignLibrary,
  LocalDesignLibraryResult,
  LocalDesignRevision,
  ProfileWingDesignRevision,
} from "./local-library";
export {
  DEFAULT_OBSTACLE_INTENT,
  FRAME_COLORS,
  LOWER_ELEMENTS,
} from "../product/definition";
export type * from "../product/types";
export type {
  LocalDesignWorkspace,
  LocalWorkspaceFailure,
  LocalWorkspaceResult,
  LocalWorkspaceSuccess,
  ObstacleDesignRevision,
  ObstacleDraft,
  StoredObstacleIntent,
} from "./local-revisions";
export * from "../artwork";
