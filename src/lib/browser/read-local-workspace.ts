import {
  COURSE_STORAGE_KEY,
  parseCourseDraft,
  type CourseDraft,
} from "@/domain/course";
import {
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  LOCAL_WORKSPACE_STORAGE_KEY,
  migrateLocalDesignLibrary,
  type LocalDesignLibrary,
} from "@/domain/design";
import {
  LOCAL_CONCEPT_WORKSPACE_KEY,
  parseLocalConceptWorkspace,
  type LocalConceptWorkspace,
} from "@/domain/generation";
import {
  LOCAL_PROFILE_WING_CREATION_KEY,
  parseLocalProfileWingCreationWorkspace,
  type LocalProfileWingCreationWorkspace,
} from "@/domain/profile-wing-creation";
import type {
  WorkspaceSourceState,
  WorkspaceSources,
} from "@/domain/workspace";

type BrowserStorage = Pick<Storage, "getItem">;

function empty<T>(): WorkspaceSourceState<T> {
  return { status: "empty", value: null, error: null };
}

function invalid<T>(message: string): WorkspaceSourceState<T> {
  return { status: "invalid", value: null, error: message };
}

function unavailable<T>(message: string): WorkspaceSourceState<T> {
  return { status: "unavailable", value: null, error: message };
}

function ready<T>(value: T): WorkspaceSourceState<T> {
  return { status: "ready", value, error: null };
}

function readValue(storage: BrowserStorage, key: string) {
  return storage.getItem(key);
}

export function readLocalWorkspaceSources(
  storage: BrowserStorage,
): WorkspaceSources {
  let librarySerialized: string | null;
  let legacySerialized: string | null;
  let conceptsSerialized: string | null;
  let profileSerialized: string | null;
  let courseSerialized: string | null;
  try {
    librarySerialized = readValue(storage, LOCAL_DESIGN_LIBRARY_STORAGE_KEY);
    legacySerialized = readValue(storage, LOCAL_WORKSPACE_STORAGE_KEY);
    conceptsSerialized = readValue(storage, LOCAL_CONCEPT_WORKSPACE_KEY);
    profileSerialized = readValue(storage, LOCAL_PROFILE_WING_CREATION_KEY);
    courseSerialized = readValue(storage, COURSE_STORAGE_KEY);
  } catch {
    const message =
      "Browser storage is unavailable; no local data was changed.";
    return {
      designLibrary: unavailable<LocalDesignLibrary>(message),
      concepts: unavailable<LocalConceptWorkspace>(message),
      profileCreation: unavailable<LocalProfileWingCreationWorkspace>(message),
      course: unavailable<CourseDraft>(message),
    };
  }

  let designLibrary = empty<LocalDesignLibrary>();
  if (librarySerialized !== null || legacySerialized !== null) {
    const migrated = migrateLocalDesignLibrary({
      librarySerialized,
      legacyWorkspaceSerialized: legacySerialized,
      now: "1970-01-01T00:00:00.000Z",
      draftId: "workspace-summary-read-only-draft",
    });
    designLibrary = migrated.ok
      ? ready(migrated.value.library)
      : invalid(
          `Your saved design library is unavailable; no data was overwritten. ${migrated.error.message}`,
        );
  }

  let concepts = empty<LocalConceptWorkspace>();
  if (conceptsSerialized !== null) {
    const parsed = parseLocalConceptWorkspace(conceptsSerialized);
    concepts = parsed.ok
      ? ready(parsed.value)
      : invalid(
          `Some local concept history could not be trusted. ${parsed.error.message}`,
        );
  }

  let profileCreation = empty<LocalProfileWingCreationWorkspace>();
  if (profileSerialized !== null) {
    const parsed = parseLocalProfileWingCreationWorkspace(profileSerialized);
    profileCreation = parsed.ok
      ? ready(parsed.value)
      : invalid(
          `Some local Profile Wing creation history could not be trusted. ${parsed.error.message}`,
        );
  }

  let course = empty<CourseDraft>();
  if (courseSerialized !== null) {
    const parsed = parseCourseDraft(courseSerialized);
    course = parsed.ok
      ? ready(parsed.value)
      : invalid(
          `Your local course could not be trusted; no data was overwritten. ${parsed.error.message}`,
        );
  }

  return { designLibrary, concepts, profileCreation, course };
}
