import Link from "next/link";

export function LabIndex() {
  return (
    <main className="workspace-page lab-index-page">
      <section className="workspace-title-block">
        <p className="eyebrow">Developer Lab</p>
        <h1>Internal evidence screens</h1>
        <p>
          These screens verify benchmark evidence and renderer parity. They are
          not normal creation steps and do not create production truth.
        </p>
      </section>
      <div className="lab-index-list">
        <article>
          <p className="eyebrow">Phase 1H-B2 · fixtures</p>
          <h2>Silhouette benchmark</h2>
          <p>
            Inspect all deterministic mask, polygon, and rejection evidence.
          </p>
          <Link href="/lab/silhouettes">Open silhouette benchmark</Link>
        </article>
        <article>
          <p className="eyebrow">Phase 1H-C2 · renderer proof</p>
          <h2>Profile Wing renderer</h2>
          <p>Verify one accepted benchmark polygon in exact 2.5D and 3D.</p>
          <Link href="/lab/profile-wing-renderer">
            Open Profile Wing renderer proof
          </Link>
        </article>
      </div>
    </main>
  );
}
