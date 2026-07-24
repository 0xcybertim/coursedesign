"use client";

import Link from "next/link";
import { PrototypeBoundary } from "@/components/shared/PrototypeBoundary";
import { useLocalWorkspaceSummary } from "@/components/workspace/useLocalWorkspaceSummary";

export function CoursesOverviewClient() {
  const { hydrated, summary, sources } = useLocalWorkspaceSummary();
  return (
    <main className="workspace-page courses-overview-page">
      <section className="workspace-title-block">
        <p className="eyebrow">Browser-local course</p>
        <h1>Courses</h1>
        <p>
          This prototype contains one 60 × 40 m course that pins exact saved
          design revisions.
        </p>
      </section>
      {!hydrated || !summary || !sources ? (
        <div className="workspace-loading" aria-label="Loading courses">
          <span />
          <span />
        </div>
      ) : sources.course.status === "invalid" ||
        sources.course.status === "unavailable" ? (
        <section className="workspace-source-errors">
          <h2>Local Course 01 is unavailable.</h2>
          <p>{sources.course.error}</p>
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
                <dd>{summary.course.placementCount}</dd>
              </div>
              <div>
                <dt>Planning warnings</dt>
                <dd>{summary.course.warningCount}</dd>
              </div>
              <div>
                <dt>Persistence</dt>
                <dd>Saved in this browser</dd>
              </div>
            </dl>
          </div>
          <div className="course-overview-actions">
            <Link href="/courses/local-course-1">Edit course</Link>
            {summary.course.placementCount > 0 ? (
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
