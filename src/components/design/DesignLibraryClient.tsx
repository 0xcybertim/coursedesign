"use client";

import Link from "next/link";
import { PrototypeBoundary } from "@/components/shared/PrototypeBoundary";
import { useLocalWorkspaceSummary } from "@/components/workspace/useLocalWorkspaceSummary";

export function DesignLibraryClient() {
  const { hydrated, summary, sources } = useLocalWorkspaceSummary();
  const draft = sources?.designLibrary.value?.spj04Workspace.draft ?? null;

  return (
    <main className="workspace-page design-library-page">
      <section className="workspace-title-block">
        <p className="eyebrow">Saved in this browser</p>
        <h1>Designs</h1>
        <p>
          Every item groups immutable revisions of one exact obstacle design.
          Existing course placements keep the revision they already pin.
        </p>
        <Link href="/designs/local-spj-04/edit">Customize a jump</Link>
      </section>
      {!hydrated || !summary || !sources ? (
        <div className="workspace-loading" aria-label="Loading design library">
          <span />
          <span />
          <span />
        </div>
      ) : sources.designLibrary.status === "invalid" ||
        sources.designLibrary.status === "unavailable" ? (
        <section className="workspace-source-errors">
          <h2>Saved designs are unavailable.</h2>
          <p>{sources.designLibrary.error}</p>
          <p>No stored value was overwritten.</p>
        </section>
      ) : summary.designs.length === 0 ? (
        <section className="design-library-empty">
          <p className="eyebrow">No saved revisions</p>
          <h2>Save a revision to build your design library.</h2>
          <p>
            A working draft is not an immutable revision and will stay under
            Continue work until you save it.
          </p>
          <div>
            {draft ? (
              <Link href="/designs/local-spj-04/edit">
                Continue SPJ-04 draft
              </Link>
            ) : null}
            <Link href="/designs/local-spj-04/edit">
              Customize your first jump
            </Link>
          </div>
        </section>
      ) : (
        <ol className="design-library-list">
          {summary.designs.map((design) => (
            <li key={design.designId}>
              <span
                className="design-family-mark"
                data-family={design.family}
                aria-hidden="true"
              />
              <div>
                <p className="eyebrow">
                  {design.evidenceStatus === "configured"
                    ? "Configured"
                    : "Generated · inferred"}
                </p>
                <h2>{design.displayName}</h2>
                <p>
                  Latest Revision{" "}
                  {String(design.latestOrdinal).padStart(2, "0")} ·{" "}
                  {design.revisionCount} saved{" "}
                  {design.revisionCount === 1 ? "revision" : "revisions"}
                </p>
                <small>
                  Saved locally · existing placements never auto-update
                </small>
              </div>
              <div className="design-library-actions">
                <Link href={`/designs/${design.designId}`}>View design</Link>
                {design.latestRevisionId ? (
                  <Link
                    href={`/courses/local-course-1?revision=${encodeURIComponent(
                      design.latestRevisionId,
                    )}`}
                  >
                    Add latest revision to course
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      <PrototypeBoundary variant="local" />
    </main>
  );
}
