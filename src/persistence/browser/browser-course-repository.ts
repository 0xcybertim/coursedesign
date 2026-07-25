import {
  COURSE_STORAGE_KEY,
  createCourseDraft,
  parseCourseDraft,
  serializeCourseDraft,
} from "@/domain/course";
import {
  STARTER_COURSE_ROUTE_KEY,
  type CourseRecord,
  type CourseRepository,
  type SaveCourseInput,
} from "@/persistence/course-repository";
import {
  persistenceFailure,
  staleVersionFailure,
  type PersistenceResult,
} from "@/persistence/result";

import {
  browserLocalStorage,
  type BrowserKeyValueStorage,
} from "./browser-storage";

interface BrowserCourseRepositoryOptions {
  readonly storage?: BrowserKeyValueStorage;
  readonly now?: () => string;
}

function record(draft: CourseRecord["draft"]): CourseRecord {
  return {
    routeKey: STARTER_COURSE_ROUTE_KEY,
    name: "Local Course 01",
    draft,
    lockVersion: draft.draftVersion,
    updatedAt: draft.updatedAt,
  };
}

export class BrowserCourseRepository implements CourseRepository {
  private readonly storage: BrowserKeyValueStorage;
  private readonly now: () => string;

  constructor(options: BrowserCourseRepositoryOptions = {}) {
    this.storage = options.storage ?? browserLocalStorage();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private load(): PersistenceResult<CourseRecord> {
    try {
      const serialized = this.storage.getItem(COURSE_STORAGE_KEY);
      if (serialized === null) {
        const fresh = createCourseDraft(this.now());
        this.storage.setItem(COURSE_STORAGE_KEY, serializeCourseDraft(fresh));
        return { ok: true, value: record(fresh) };
      }
      const parsed = parseCourseDraft(serialized);
      if (!parsed.ok) {
        return persistenceFailure(
          parsed.error.kind.includes("schema")
            ? "unsupported_schema"
            : "corrupt_record",
          parsed.error.message,
        );
      }
      return { ok: true, value: record(parsed.value) };
    } catch {
      return persistenceFailure(
        "temporarily_unavailable",
        "Browser course storage is unavailable.",
      );
    }
  }

  async loadCourse(
    routeKey: typeof STARTER_COURSE_ROUTE_KEY,
  ): Promise<PersistenceResult<CourseRecord>> {
    if (routeKey !== STARTER_COURSE_ROUTE_KEY) {
      return persistenceFailure(
        "missing_reference",
        "That course is unavailable.",
      );
    }
    return this.load();
  }

  async saveCourse(
    input: SaveCourseInput,
  ): Promise<PersistenceResult<CourseRecord, CourseRecord>> {
    const loaded = this.load();
    if (!loaded.ok) return loaded;
    if (loaded.value.lockVersion !== input.expectedLockVersion) {
      return staleVersionFailure({
        expectedLockVersion: input.expectedLockVersion,
        actualLockVersion: loaded.value.lockVersion,
        latest: loaded.value,
      });
    }
    const parsed = parseCourseDraft(serializeCourseDraft(input.draft));
    if (!parsed.ok) {
      return persistenceFailure("validation", parsed.error.message);
    }
    try {
      this.storage.setItem(
        COURSE_STORAGE_KEY,
        serializeCourseDraft(parsed.value),
      );
      return { ok: true, value: record(parsed.value) };
    } catch {
      return persistenceFailure(
        "temporarily_unavailable",
        "Browser course storage is unavailable.",
      );
    }
  }
}
