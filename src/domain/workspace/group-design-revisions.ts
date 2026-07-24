import { isProfileWingRevision, type LocalDesignRevision } from "../design";
import type { DesignSummary } from "./types";

function dateValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function groupDesignRevisions(
  revisions: readonly LocalDesignRevision[],
): readonly DesignSummary[] {
  const groups = new Map<string, LocalDesignRevision[]>();
  for (const revision of revisions) {
    const group = groups.get(revision.designId) ?? [];
    group.push(revision);
    groups.set(revision.designId, group);
  }

  return [...groups.entries()]
    .map(([designId, group]) => {
      const ordered = [...group].sort(
        (left, right) =>
          right.ordinal - left.ordinal ||
          dateValue(right.createdAt) - dateValue(left.createdAt) ||
          right.revisionId.localeCompare(left.revisionId),
      );
      const latest = ordered[0] ?? null;
      const profile = latest !== null && isProfileWingRevision(latest);
      const displayName =
        latest !== null && isProfileWingRevision(latest)
          ? latest.snapshot.prototype.displayName
          : "SPJ-04 · Club Classic";
      return {
        designId,
        family: profile ? ("profile-wing" as const) : ("spj-04" as const),
        displayName,
        revisionCount: ordered.length,
        latestRevisionId: latest?.revisionId ?? null,
        latestOrdinal: latest?.ordinal ?? null,
        latestCreatedAt: latest?.createdAt ?? null,
        evidenceStatus: profile
          ? ("generated_inferred" as const)
          : ("configured" as const),
      };
    })
    .sort(
      (left, right) =>
        dateValue(right.latestCreatedAt ?? "") -
          dateValue(left.latestCreatedAt ?? "") ||
        left.designId.localeCompare(right.designId),
    );
}
