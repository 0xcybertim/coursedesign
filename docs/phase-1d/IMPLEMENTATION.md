# Phase 1D — Course Review Sheet

## Outcome

Phase 1D adds a deterministic, read-only Course Review Sheet at
`/studio/courses/local-course-1/review`. It reads the existing browser-local
course and immutable obstacle-revision workspace without writing either one.
The sheet presents the 60,000 × 40,000 mm arena, numbered placements, exact
pinned revision evidence, Phase 1C geometry warnings, exact equipment
quantities, and matching human- and machine-readable production-spec previews.

This remains a non-sellable local prototype. The route does not add accounts,
server persistence, sharing, automatic upgrades, supplier approval, production
release, pricing, checkout, payment, or ordering.

## Deterministic review contract

`buildCourseReviewSnapshot(courseDraft, revisions)` is the single pure review
boundary. It produces schema `1.0.0-phase1d` with:

- the course ID, course draft version, and arena contract;
- placements sorted by display number and then instance ID;
- each exact `obstacleDesignRevisionId` plus its immutable configuration hash,
  footprint, bill of materials, and production-spec snapshot;
- geometry warnings sorted by kind, display number, instance ID, and message;
- the unchanged Phase 1C quantity roll-up;
- explicit `complete` or `incomplete` status and missing-revision references;
- a human-readable specification and the same full object as formatted JSON;
- explicit prototype disclaimer, exclusions, hash algorithm, and review hash.

The SHA-256 review hash is calculated from the canonical review content. Moving
or rotating an instance, changing a pinned revision, changing a pinned snapshot,
or changing a warning/quantity result changes the hash. Revision-array and
placement-array ordering do not. `newerRevisionAvailable` is deliberately
excluded: creating an unused later revision may add a non-mutating notice, but
cannot change the identity of the course being reviewed.

## Pinning, completeness, and newer revisions

Every placement remains pinned to the exact immutable revision stored by Phase
1C. The sheet never substitutes the latest revision. If a later revision exists
for that design, a status line names it while restating the pinned revision ID.
There is no update button in Phase 1D.

If a pinned revision cannot be resolved, the placement remains visible with its
stored coordinates and missing ID. Its unavailable product data is represented
as `null`, its quantities are excluded rather than estimated, a
`missing_revision` warning is included, and the review becomes `incomplete` and
explicitly unsuitable for production.

## Geometry and quantity reuse

The review calls the existing `deriveCourseWarnings` and
`aggregateCourseQuantities` functions. It does not introduce a second geometry
or bill-of-materials interpretation. Warnings remain advisory purchase-planning
checks, not safety, federation, regulatory, venue-measurement, or course-validity
certification.

## Human and machine previews

The human-readable preview states each placement's coordinates, rotation,
revision, revision ID, and configuration hash, followed by warning and quantity
statements. The machine preview is `JSON.stringify(review, null, 2)` of the same
in-memory object rendered elsewhere on the page. Copying JSON only writes to the
user's clipboard; it does not publish, approve, upload, or order anything.

## Responsive and print presentation

The arena-first layout is responsive at desktop, tablet, and 375 px mobile
widths. Long revision identifiers wrap without widening the page, machine JSON
scrolls inside its own region, actionable controls retain a minimum 44 px target,
and keyboard focus has a visible 2 px outline with 3 px offset.

The loaded print stylesheet removes navigation and copy controls, removes the
screen background and width cap, preserves section headings with their content,
avoids breaking arena/register/summary blocks where possible, expands the
placement register to three print columns, and wraps the JSON preview on white.
It does not label the artifact as approved or production-ready.

## Browser acceptance evidence

The local browser journey created Revision 01, changed the configuration to a
red gate for Revision 02, and placed Revision 01 twice plus Revision 02 once.
The initial overlapping course produced review hash
`6f9ae2b4025930d89d500fadc02fc1e22e92ce2f7d14bd4de7ed25964b92030b`.
Reload preserved both hash and content. Creating unused Revision 03 added
newer-revision notices without changing the hash, quantities, or pinned IDs.

Moving placement 02 to X 18,000 mm and placement 03 to X 42,000 mm, then
rotating placement 03 to 15 degrees, cleared the overlap warning and changed the
review hash to
`66b70511287e9d44f1303d37e018bf45ea53bc74a6815dcc9182e7fdc0539f2e`.
The final exact roll-up is 3 obstacle instances, 6 printed wing assemblies, 12
poles, 24 cups/release adapters, 6 track assemblies, 6 foot/ballast assemblies,
6 flags, 24 pole end caps, and 1 gate. The visible register and quantity values
matched the JSON preview.

The journey also covered overlap trigger/clear, reload stability, unused-revision
stability, hash change after movement/rotation, JSON copy feedback, visible
keyboard focus, desktop/tablet/mobile layouts, 44 px touch targets, no 375 px
horizontal overflow, normal interactive 3D, the explicit 2.5D fallback, and an
empty browser warning/error console.

## Automated evidence

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` — 80 tests
- `pnpm build`

Domain tests cover canonical ordering, hash sensitivity, unused-newer-revision
stability, exact mixed-revision quantities, geometry warnings, missing revisions,
and human/machine parity. Component tests cover the local route, read-only
storage behavior, placement and quantity rendering, copy feedback, empty state,
incomplete state, and keyboard activation.

## Screenshots

- `screenshots/course-review-desktop.png`
- `screenshots/course-review-mobile.png`
- `screenshots/course-review-placement-register.png`
- `screenshots/course-review-machine-readable.png`
- `screenshots/course-review-newer-revision.png`

## Future update-one / replace-all design contract

A later milestone may add explicit update actions, but must preserve these
rules:

1. Detection remains passive. A newer revision notice does not mutate the
   course and does not affect its current review hash.
2. `Update this placement` targets exactly one instance ID. `Replace all using
this revision` targets only placements pinned to the explicitly named source
   revision and shows the exact affected count.
3. A confirmation preview names source and destination revision IDs, lists all
   affected display numbers, and shows before/after quantity and warning deltas.
4. Cancel is the default and leaves storage untouched. No mutation occurs before
   explicit confirmation.
5. Confirmation writes one validated, atomic course-draft replacement with a
   new draft version. It never edits or deletes an obstacle revision.
6. The resulting course review is rebuilt from the new pinned IDs and receives
   a new hash. Partial replacement failures cannot leave a mixed intermediate
   draft.
7. Missing, incompatible, or no-longer-current source/destination revisions
   produce a typed failure and require the user to refresh the preview.

That future action remains outside Phase 1D and must not be conflated with
production approval or commerce.
