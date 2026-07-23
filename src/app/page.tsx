import Link from "next/link";

export default function HomePage() {
  return (
    <main className="route-entry">
      <p className="eyebrow">Browser-local prototype studios</p>
      <h1>Course Design</h1>
      <p>Deterministic product work and creative concepts remain separate.</p>
      <div className="route-entry-links">
        <Link href="/studio/obstacles/spj-04">Customize SPJ-04</Link>
        <Link href="/studio/concepts/new">Create a jump concept</Link>
        <Link href="/studio/silhouettes/review">
          Review Phase 1H silhouettes
        </Link>
        <Link href="/studio/obstacles/profile-wing/new">
          Create your own Profile Wing
        </Link>
      </div>
    </main>
  );
}
