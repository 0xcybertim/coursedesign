"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  isProfileWingRevision,
  localDesignLibraryRevisions,
  type LocalDesignRevision,
} from "@/domain/design";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { PrototypeBoundary } from "@/components/shared/PrototypeBoundary";
import { ProfileWingTwoD } from "@/components/profile-wing/ProfileWingTwoD";
import { useLocalWorkspaceSummary } from "@/components/workspace/useLocalWorkspaceSummary";

function validDesignId(value: string) {
  return /^[a-z0-9][a-z0-9-]{2,127}$/.test(value);
}

function revisionLabel(revision: LocalDesignRevision) {
  return `Revision ${String(revision.ordinal).padStart(2, "0")}`;
}

export function DesignDetailClient({
  designId,
}: {
  readonly designId: string;
}) {
  const { hydrated, sources } = useLocalWorkspaceSummary();
  const library = sources?.designLibrary.value ?? null;
  const revisions = useMemo(
    () =>
      library
        ? localDesignLibraryRevisions(library)
            .filter((revision) => revision.designId === designId)
            .sort((left, right) => right.ordinal - left.ordinal)
        : [],
    [designId, library],
  );
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
    null,
  );

  const selected =
    revisions.find((revision) => revision.revisionId === selectedRevisionId) ??
    revisions[0] ??
    null;
  const isSpj = designId === "local-spj-04";
  const draft = isSpj && library ? library.spj04Workspace.draft : null;

  if (!validDesignId(designId))
    return (
      <main className="workspace-page missing-design-page">
        <h1>Design not found in this browser.</h1>
        <p>The route does not contain a valid local design identifier.</p>
        <Link href="/designs">Return to Designs</Link>
      </main>
    );

  if (!hydrated)
    return (
      <main className="workspace-page">
        <div className="workspace-loading" aria-label="Loading design">
          <span />
          <span />
        </div>
      </main>
    );

  if (
    sources?.designLibrary.status === "invalid" ||
    sources?.designLibrary.status === "unavailable"
  )
    return (
      <main className="workspace-page missing-design-page">
        <h1>Saved designs are unavailable.</h1>
        <p>{sources.designLibrary.error}</p>
        <p>No stored value was overwritten.</p>
        <Link href="/designs">Return to Designs</Link>
      </main>
    );

  if (revisions.length === 0)
    return (
      <main className="workspace-page missing-design-page">
        <h1>
          {isSpj && draft
            ? "SPJ-04 has no saved revisions yet."
            : "Design not found in this browser."}
        </h1>
        <p>
          {isSpj && draft
            ? "The working draft is still available. Save an immutable revision before adding it to a course."
            : "No trusted saved revision matches this design identifier."}
        </p>
        {isSpj && draft ? (
          <Link href="/designs/local-spj-04/edit">Edit working draft</Link>
        ) : (
          <Link href="/designs">Return to Designs</Link>
        )}
      </main>
    );

  if (!selected) return null;
  const profile = isProfileWingRevision(selected);
  const displayName = profile
    ? selected.snapshot.prototype.displayName
    : "SPJ-04 · Club Classic";

  return (
    <main className="workspace-page design-detail-page">
      <Breadcrumbs
        items={[{ label: "Designs", href: "/designs" }, { label: displayName }]}
      />
      <section className="design-detail-hero">
        <div>
          <p className="eyebrow">
            {profile ? "Generated · inferred" : "Configured"}
          </p>
          <h1>{displayName}</h1>
          <p>
            {revisionLabel(selected)} · saved locally · exact immutable revision
          </p>
          <div className="design-detail-actions">
            {profile ? (
              <Link href="/designs/local-spj-04/edit?wing=image">
                Create another from a new source
              </Link>
            ) : (
              <Link
                href={`/designs/local-spj-04/edit?revision=${encodeURIComponent(
                  selected.revisionId,
                )}`}
              >
                {selected.ordinal === revisions[0]?.ordinal
                  ? "Open saved revision"
                  : "Create new revision from this"}
              </Link>
            )}
            <Link
              href={`/courses/local-course-1?revision=${encodeURIComponent(
                selected.revisionId,
              )}`}
            >
              Add {revisionLabel(selected)} to course
            </Link>
          </div>
        </div>
        <div className="design-detail-preview">
          {profile ? (
            <ProfileWingTwoD manifest={selected.snapshot.renderManifest} />
          ) : (
            <div
              className="spj-light-preview"
              data-frame={selected.snapshot.configuration.frameColor}
              role="img"
              aria-label={`SPJ-04 ${selected.snapshot.configuration.frameColor} frame with ${selected.snapshot.configuration.lowerElement.replaceAll(
                "_",
                " ",
              )}`}
            >
              <span />
              <span />
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
      </section>

      <section
        className="design-revision-history"
        aria-labelledby="history-title"
      >
        <div>
          <p className="eyebrow">Immutable history</p>
          <h2 id="history-title">Saved revisions</h2>
          {draft ? (
            <p>
              Working draft Version {draft.draftVersion} remains separate from
              every saved revision.
            </p>
          ) : null}
        </div>
        <ol>
          {revisions.map((revision) => (
            <li key={revision.revisionId}>
              <button
                type="button"
                aria-pressed={selected.revisionId === revision.revisionId}
                onClick={() => setSelectedRevisionId(revision.revisionId)}
              >
                <strong>{revisionLabel(revision)}</strong>
                <span>{revision.name}</span>
                <time dateTime={revision.createdAt}>
                  {new Date(revision.createdAt).toLocaleString()}
                </time>
                <code>{revision.configurationHash.slice(0, 12)}</code>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="design-technical-evidence">
        <p className="eyebrow">Technical evidence</p>
        <h2>Exact saved identity</h2>
        <dl>
          <div>
            <dt>Design ID</dt>
            <dd>{selected.designId}</dd>
          </div>
          <div>
            <dt>Revision ID</dt>
            <dd>{selected.revisionId}</dd>
          </div>
          <div>
            <dt>Configuration identity</dt>
            <dd>{selected.configurationHash}</dd>
          </div>
        </dl>
      </section>
      <PrototypeBoundary variant={profile ? "generated-design" : "local"} />
    </main>
  );
}
