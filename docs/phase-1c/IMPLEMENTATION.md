# Phase 1C — Browser-local course planning

## Outcome

Phase 1C adds the direct `/studio/courses/local-course-1` route as a bounded,
non-sellable course-planning prototype. A user can place exact saved obstacle
revisions in a 60 × 40 m arena, move and rotate repeated instances, review
advisory geometry warnings, and see deterministic equipment quantities. The
course restores on the same browser and device.

The obstacle studio at `/studio/obstacles/spj-04` remains the only place that
creates immutable obstacle revisions. The course workspace consumes those
revisions; it does not edit or replace them.

## Domain and storage schemas

Course state uses `COURSE_SCHEMA_VERSION = "1.0.0-phase1c"` and the browser
storage key `course-design.local-course-1.v1`. The persisted `CourseDraft`
contains:

- the fixed `courseId` `local-course-1`;
- a monotonically increasing local `draftVersion` and ISO `updatedAt` value;
- the exact arena contract `{ units: "mm", width: 60000, height: 40000,
gridSize: 5000 }`;
- zero or more `CourseInstance` records with a unique `instanceId`, exact
  `obstacleDesignRevisionId`, integer `xMm` and `yMm`, normalized 15-degree
  `rotationDeg`, and stable positive `displayNumber`.

Parsing rejects malformed JSON, unknown course schemas, changed arena values,
invalid coordinates or rotations, and duplicate instance IDs or display
numbers. A failed parse does not become trusted course state. New course state
is written back only after client hydration.

Saved obstacle inputs continue to use the Phase 1B workspace schema
`1.0.0-phase1b` at `course-design.spj-04.local-workspace.v1`. The course reads
the immutable `ObstacleDesignRevision` array from that workspace and never
modifies it.

## Coordinates, movement, and rotation

Coordinates are millimetres from the arena's upper-left corner: positive X
moves right and positive Y moves down. Each obstacle's `xMm`/`yMm` point is the
centre of its Phase 1A 5,100 × 800 mm footprint. Positive rotation follows the
screen coordinate system and therefore appears clockwise.

Pointer placement and drag snap to a 500 mm movement grid. Visible controls and
the arrow keys move by 500 mm; the alternate large step and Shift+arrow move by
2,000 mm. `R` and the rotation controls rotate clockwise in 15-degree steps;
the reverse control rotates counter-clockwise. Stored rotations are normalized
to 0–345 degrees.

## Revision-pinning invariant

Every placement stores an exact `obstacleDesignRevisionId`. A later obstacle
save appends a new revision and does not mutate that ID or the saved snapshot it
addresses. Existing placements therefore keep their original symbol,
footprint, bill of materials, and configuration identity. There is deliberately
no automatic revision upgrade, “update one,” or “replace all” behavior in this
phase.

The runtime acceptance journey proved the invariant by placing Revision 01
twice, creating a changed red-frame/gate Revision 02, reopening the course, and
confirming both existing placements still reported Revision 01 before placing
Revision 02 separately.

## Geometry-warning semantics

Geometry is derived from the exact footprint pinned by each instance's saved
revision. Its centre-anchored rectangle is rotated to a four-point polygon.
Overlap uses the separating axis theorem and requires positive intersection
area; edge-touching alone is not an overlap. An out-of-bounds warning appears
when any polygon point extends beyond the fixed arena. A missing local revision
produces its own typed warning.

Warnings are purchase-planning aids only. They do not certify safety,
federation rules, course validity, venue measurement, clearances, or regulatory
compliance. The UI and accessible live region update after selection, movement,
pointer drag, placement, and rotation.

## Quantity aggregation

The equipment summary folds only the bills of materials from successfully
resolved pinned snapshots. It reports obstacle instances, printed wing
assemblies, poles, cups/release adapters, track assemblies, foot/ballast
assemblies, flags, pole end caps, and selected decorative panels, gates, or
fillers. Missing revisions are excluded rather than guessed and are paired with
a warning.

The accepted mixed-revision example contains three obstacle instances and
rolls up to 6 wings, 12 poles, 24 cups/release adapters, 6 tracks, 6
foot/ballast assemblies, 6 flags, 24 pole end caps, and 1 gate.

## Browser-local limitations and exclusions

Clearing browser storage removes the course. There are no accounts, server or
PostgreSQL persistence, cross-device sync, public links, course-sharing tokens,
archive/delete recovery, automatic revision upgrades, artwork workflows,
pricing, freight, tax, duty, margin, checkout, factory quantities, production
approval, payment, or ordering. Derived quantities are not retail or supplier
commitments.

## Acceptance evidence

The final automated gate passed on 2026-07-13:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` — 65 tests
- `pnpm build`

Real-runtime acceptance ran against the exact local application at
`http://localhost:3520`. It covered the empty course, repeated Revision 01
placement, pointer drag, keyboard movement and rotation, overlap and boundary
warning trigger/clear cycles, exact quantity roll-up, reload restoration,
Revision 02 creation and pinning proof, mixed-revision quantities, normal
interactive 3D readiness, and the intentional `?force3d=fail` 2.5D fallback.

The responsive workspace was inspected at 1440 × 1000, approximately 900 px,
and 375 × 812. The mobile document had no horizontal overflow and no visible
interactive target below 44 × 44 px. Keyboard focus showed a 2 px solid outline
with 3 px offset. Browser warning/error logs were empty for the course, normal
obstacle studio, and forced fallback states.

## Screenshots

- `docs/phase-1c/screenshots/local-course-1-desktop.png`
- `docs/phase-1c/screenshots/local-course-1-desktop-warning.png`
- `docs/phase-1c/screenshots/local-course-1-mobile-controls.png`
- `docs/phase-1c/screenshots/local-course-1-revision-pinning.png`
