"use client";

import Link from "next/link";
import { PrototypeBoundary } from "@/components/shared/PrototypeBoundary";
import { useLocalWorkspaceSummary } from "@/components/workspace/useLocalWorkspaceSummary";
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";
import { useServerWorkspaceCore } from "@/components/persistence/useServerWorkspaceCore";
import { deriveCourseWarnings } from "@/domain/course";

export function CoursesOverviewClient() {
  const mode = usePersistenceMode();
  const { hydrated, summary, sources } = useLocalWorkspaceSummary(
    mode === "browser",
  );
  const server = useServerWorkspaceCore(mode === "server");
  const serverPlacementCount = server.course?.draft.instances.length ?? 0;
  const serverWarningCount = server.course
    ? deriveCourseWarnings(server.course.draft, server.revisions).length
    : 0;
  const placementCount =
    mode === "server"
      ? serverPlacementCount
      : (summary?.course.placementCount ?? 0);
  const warningCount =
    mode === "server"
      ? serverWarningCount
      : (summary?.course.warningCount ?? 0);
  const loaded =
    mode === "server"
      ? server.hydrated
      : hydrated && Boolean(summary && sources);
  const unavailableError =
    mode === "server"
      ? server.error
      : sources?.course.status === "invalid" ||
          sources?.course.status === "unavailable"
        ? sources.course.error
        : null;
  return (
    <main className="workspace-page courses-overview-page">
      <section className="workspace-title-block">
        <p className="eyebrow">
          {mode === "server"
            ? "Server workspace course"
            : "Browser-local course"}
        </p>
        <h1>Courses</h1>
        <p>
          This prototype contains one 60 × 40 m course that pins exact saved
          design revisions.
        </p>
      </section>
      {!loaded ? (
        <div className="workspace-loading" aria-label="Loading courses">
          <span />
          <span />
        </div>
      ) : unavailableError ? (
        <section className="workspace-source-errors" role="status">
          <h2>Local Course 01 is unavailable.</h2>
          <p>{unavailableError}</p>
        </section>
      ) : (
        <article className="course-overview-card">
          <span className="course-overview-arena" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <p className="eyebrow">60 × 40 m prototype arena</p>
            <h2>Local Course 01</h2>
            <dl>
              <div>
                <dt>Placements</dt>
                <dd>{placementCount}</dd>
              </div>
              <div>
                <dt>Planning warnings</dt>
                <dd>{warningCount}</dd>
              </div>
              <div>
                <dt>Persistence</dt>
                <dd>
                  {mode === "server"
                    ? "Saved to server workspace"
                    : "Saved in this browser"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="course-overview-actions">
            <Link href="/courses/local-course-1">Edit course</Link>
            {placementCount > 0 ? (
              <Link href="/courses/local-course-1/review">Review course</Link>
            ) : (
              <span>Review becomes available after the first placement.</span>
            )}
          </div>
        </article>
      )}
      <PrototypeBoundary variant="course" />
    </main>
  );
}
