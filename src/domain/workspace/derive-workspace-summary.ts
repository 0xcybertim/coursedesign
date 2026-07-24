import { deriveCourseWarnings } from "../course";
import { localDesignLibraryRevisions } from "../design";
import { groupDesignRevisions } from "./group-design-revisions";
import { deriveResumeItems } from "./resume-items";
import type {
  WorkspaceSourceError,
  WorkspaceSources,
  WorkspaceSummary,
} from "./types";

const SOURCE_META = {
  designLibrary: {
    source: "design-library",
    href: "/designs",
    unavailable:
      "Your saved design library is unavailable; no data was overwritten.",
  },
  concepts: {
    source: "concept-history",
    href: "/designs/local-spj-04/edit?wing=description",
    unavailable: "Some local concept history could not be trusted.",
  },
  profileCreation: {
    source: "profile-creation",
    href: "/designs/local-spj-04/edit?wing=image",
    unavailable:
      "Some local Profile Wing creation history could not be trusted.",
  },
  course: {
    source: "course",
    href: "/courses",
    unavailable:
      "Your local course could not be trusted; no data was overwritten.",
  },
} as const;

export function deriveWorkspaceSummary(
  sources: WorkspaceSources,
): WorkspaceSummary {
  /*
  authoritative stores
    ├─ design library
    ├─ concepts
    ├─ profile creation
    └─ course
         ↓ parse independently
  trusted partial source states
         ↓ derive only
  workspace summary
  */
  const library = sources.designLibrary.value;
  const concepts = sources.concepts.value;
  const profileCreation = sources.profileCreation.value;
  const course = sources.course.value;
  const revisions = library ? localDesignLibraryRevisions(library) : [];
  const designs = groupDesignRevisions(revisions);
  const warnings = course ? deriveCourseWarnings(course, revisions) : [];
  const unavailableRevisionCount = course
    ? new Set(
        course.instances
          .filter(
            (instance) =>
              !revisions.some(
                (revision) =>
                  revision.revisionId === instance.obstacleDesignRevisionId,
              ),
          )
          .map((instance) => instance.obstacleDesignRevisionId),
      ).size
    : 0;

  const sourceErrors: WorkspaceSourceError[] = [];
  for (const key of Object.keys(SOURCE_META) as (keyof typeof SOURCE_META)[]) {
    const state = sources[key];
    if (state.status === "invalid" || state.status === "unavailable") {
      const meta = SOURCE_META[key];
      sourceErrors.push({
        source: meta.source,
        href: meta.href,
        message: state.error || meta.unavailable,
      });
    }
  }

  return {
    designs,
    recentDesigns: designs.slice(0, 4),
    course: {
      courseId: "local-course-1",
      placementCount: course?.instances.length ?? 0,
      updatedAt: course?.updatedAt ?? null,
      warningCount: warnings.length,
      unavailableRevisionCount,
    },
    resumeItems: deriveResumeItems({
      designLibrary: library,
      concepts,
      profileCreation,
      course,
    }),
    sourceErrors,
  };
}
