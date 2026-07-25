"use client";

import Link from "next/link";
import type { WorkspaceSources, WorkspaceSummary } from "@/domain/workspace";
import { PrototypeBoundary } from "@/components/shared/PrototypeBoundary";
import { useLocalWorkspaceSummary } from "./useLocalWorkspaceSummary";
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";
import { useServerWorkspaceCore } from "@/components/persistence/useServerWorkspaceCore";

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function WorkspaceHomeView({
  hydrated,
  summary,
  sources,
}: {
  readonly hydrated: boolean;
  readonly summary: WorkspaceSummary | null;
  readonly sources: WorkspaceSources | null;
}) {
  return (
    <main className="workspace-page workspace-home">
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Browser-local design workspace</p>
          <h1>Customize a jump. Build a course.</h1>
          <p>
            Customize or create an obstacle, save an exact revision, then place
            that revision intentionally in Local Course 01.
          </p>
        </div>
        <p className="workspace-hero-proof">
          Exact revisions
          <span>Immutable local history</span>
        </p>
      </section>

      <section className="workspace-section" aria-labelledby="create-title">
        <div className="workspace-section-heading">
          <p className="eyebrow">Start</p>
          <h2 id="create-title">Customize a jump</h2>
        </div>
        <div className="creation-paths">
          <article>
            <p className="eyebrow">One complete jump</p>
            <h3>Choose the wing design</h3>
            <p>
              Use standard panels, describe custom wings, or upload an image.
            </p>
            <Link href="/designs/local-spj-04/edit">Start customizing</Link>
          </article>
          <article>
            <p className="eyebrow">Continue standard jump</p>
            <h3>SPJ-04 · Club Classic</h3>
            <p>Return directly to its colors, lower element, and artwork.</p>
            <Link href="/designs/local-spj-04/edit">
              Continue standard customization
            </Link>
          </article>
        </div>
      </section>

      {!hydrated || !summary || !sources ? (
        <div className="workspace-loading" aria-label="Loading local workspace">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          {summary.sourceErrors.length > 0 ? (
            <section className="workspace-source-errors" aria-live="polite">
              <strong>Some local work needs attention.</strong>
              <ul>
                {summary.sourceErrors.map((error) => (
                  <li key={error.source}>
                    {error.message} <Link href={error.href}>Open details</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            className="workspace-section"
            aria-labelledby="continue-title"
          >
            <div className="workspace-section-heading">
              <p className="eyebrow">Resume</p>
              <h2 id="continue-title">Continue work</h2>
            </div>
            {summary.resumeItems.length === 0 ? (
              <p className="workspace-empty">No work in progress yet.</p>
            ) : (
              <ol className="workspace-rows">
                {summary.resumeItems.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <span>
                      <small>{item.kind.replaceAll("-", " ")}</small>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    <Link href={item.href}>Continue</Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="workspace-section" aria-labelledby="recent-title">
            <div className="workspace-section-heading">
              <p className="eyebrow">Saved revisions</p>
              <h2 id="recent-title">Recent designs</h2>
              <Link href="/designs">View all designs</Link>
            </div>
            {summary.recentDesigns.length === 0 ? (
              <p className="workspace-empty">
                Designs appear here after you save an immutable revision.
              </p>
            ) : (
              <ol className="workspace-rows">
                {summary.recentDesigns.map((design) => (
                  <li key={design.designId}>
                    <span>
                      <small>
                        {design.evidenceStatus === "configured"
                          ? "Configured"
                          : "Generated · inferred"}
                      </small>
                      <strong>{design.displayName}</strong>
                      <span>
                        Revision {String(design.latestOrdinal).padStart(2, "0")}{" "}
                        · {design.revisionCount} saved{" "}
                        {design.revisionCount === 1 ? "revision" : "revisions"}{" "}
                        · {formatDate(design.latestCreatedAt)}
                      </span>
                    </span>
                    <Link href={`/designs/${design.designId}`}>
                      View design
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="workspace-section" aria-labelledby="course-title">
            <div className="workspace-section-heading">
              <p className="eyebrow">Current course</p>
              <h2 id="course-title">Local Course 01</h2>
            </div>
            <div className="current-course-summary">
              <p>
                <strong>{summary.course.placementCount}</strong>
                <span>placements</span>
              </p>
              <p>
                <strong>{summary.course.warningCount}</strong>
                <span>planning warnings</span>
              </p>
              <p>
                <strong>
                  {summary.course.updatedAt
                    ? formatDate(summary.course.updatedAt)
                    : "Not started"}
                </strong>
                <span>last local update</span>
              </p>
              <div>
                <Link href="/courses/local-course-1">Edit course</Link>
                {summary.course.placementCount > 0 ? (
                  <Link href="/courses/local-course-1/review">
                    Review course
                  </Link>
                ) : (
                  <Link href="/designs/local-spj-04/edit">
                    Customize a jump first
                  </Link>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      <div id="local-prototype" className="workspace-local-boundary">
        <PrototypeBoundary variant="local" />
      </div>
    </main>
  );
}

export function WorkspaceHomeClient() {
  const mode = usePersistenceMode();
  const state = useLocalWorkspaceSummary(mode === "browser");
  const server = useServerWorkspaceCore(mode === "server");
  if (mode === "server") {
    return (
      <main className="workspace-page workspace-home">
        <section className="workspace-hero">
          <div>
            <p className="eyebrow">Server-backed design workspace</p>
            <h1>Customize a jump. Build a course.</h1>
            <p>
              Core designs, immutable revisions, canonical render artwork, and
              the course cross contexts through this public workspace selector.
            </p>
          </div>
          <p className="workspace-hero-proof">
            Exact revisions
            <span>Append-only server history</span>
          </p>
        </section>
        {!server.hydrated ? (
          <div
            className="workspace-loading"
            aria-label="Loading server workspace"
          >
            <span />
            <span />
            <span />
          </div>
        ) : server.error ? (
          <section className="workspace-source-errors" role="status">
            <strong>Open a public server workspace to continue.</strong>
            <p>{server.error}</p>
            <p>
              Existing browser-local work was not read, imported, or changed.
            </p>
          </section>
        ) : (
          <>
            <section className="workspace-section">
              <div className="workspace-section-heading">
                <p className="eyebrow">Server working draft</p>
                <h2>SPJ-04 · Club Classic</h2>
                <Link href="/designs/local-spj-04/edit">
                  Customize this jump
                </Link>
              </div>
              <p>
                Draft version {server.design?.draft.draftVersion ?? 1} ·{" "}
                {server.revisions.length} immutable server{" "}
                {server.revisions.length === 1 ? "revision" : "revisions"}
              </p>
            </section>
            <section className="workspace-section">
              <div className="workspace-section-heading">
                <p className="eyebrow">Server course</p>
                <h2>Local Course 01</h2>
              </div>
              <div className="current-course-summary">
                <p>
                  <strong>{server.course?.draft.instances.length ?? 0}</strong>
                  <span>pinned placements</span>
                </p>
                <div>
                  <Link href="/courses/local-course-1">Edit course</Link>
                  <Link href="/courses/local-course-1/review">
                    Review course
                  </Link>
                </div>
              </div>
            </section>
          </>
        )}
        <p className="workspace-local-boundary">
          Lab histories, raw uploads, masks, and processing evidence remain on
          this device.
        </p>
      </main>
    );
  }
  return <WorkspaceHomeView {...state} />;
}
