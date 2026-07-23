# Phase 1E — Explicit Course Revision Updates

## Outcome

Phase 1E closes the passive newer-revision notice loop on
`/studio/courses/local-course-1/review` with two explicit, preview-first
browser-local operations:

- `update_one` repins one exact `instanceId`;
- `replace_all_from_revision` repins only the placements currently pinned to
  one exact source `revisionId`.

Neither operation runs automatically. Both remain non-sellable prototype
actions and do not imply supplier, fabrication, safety, production, or order
approval.

## Domain schemas

`src/domain/course/revision-update.ts` owns the pure deterministic contract.
`CourseRevisionUpdateOperation` is the tagged union above. A successful
`CourseRevisionUpdatePreview` contains:

- source and destination revision ID, ordinal, design ID, name, and pinned
  configuration hash;
- sorted affected instance IDs and display numbers with before/after pinned
  revision IDs;
- exact before/after `CourseQuantitySummary` values and explicit numeric
  deltas, including all lower-element kinds;
- complete before/after Phase 1C geometry-warning arrays;
- current and proposed Phase 1D course-review hashes;
- proposed draft version;
- the exact course, review, revision-hash, and affected-placement precondition
  consumed by confirmation.

Typed failures cover missing course instances, missing source or destination
revisions, incompatible designs, non-newer destinations, no exact source
matches, stale preconditions, invalid complete replacement drafts, and browser
storage failure.

## Exact targeting and no downgrade

Update-one resolves exactly the requested instance and proves that it is still
pinned to the named source revision. Replace-all selects by exact
`obstacleDesignRevisionId`, not by design family. A placement already updated
to the destination and a placement pinned to an intermediate revision are both
outside a Revision 01 replace-all target set.

The destination must exist, belong to the same design, and have a greater
ordinal than the source. Phase 1E exposes no downgrade flow.

## Preview and stale preconditions

`buildCourseRevisionUpdatePreview` is pure. It creates a complete candidate
draft with one version increment and derives its review without mutating the
input course or revisions. The preview precondition pins:

- course ID, draft version, and `updatedAt`;
- current course-review hash;
- source and destination configuration hashes;
- the sorted exact affected placement records.

`confirmCourseRevisionUpdate` re-resolves both revisions, rebuilds the current
review, compares every precondition, and rechecks the exact target set. It
returns `stale_course_precondition` before producing a draft when any input has
changed. Confirmation cannot expand or recompute an ambiguous replace-all set.

## Atomic browser-local confirmation

The review hook re-reads the course and obstacle workspace from localStorage at
confirmation time. The domain creates and parses one complete replacement
`CourseDraft`, increments `draftVersion` once, sets `updatedAt` once, rebuilds
the review, and proves that its hash equals the previewed proposed hash. Only
then does the hook call one `localStorage.setItem` for the course key and update
React state. There is no per-placement write and no partial replace-all state.

`ObstacleDesignRevision` objects are only read. They are never edited,
replaced, deleted, or reserialized by the update path.

## Quantity, warning, and hash derivation

The preview uses the existing `buildCourseReviewSnapshot` boundary for both
sides. That boundary continues to call the Phase 1C
`aggregateCourseQuantities` and `deriveCourseWarnings` functions. Phase 1E does
not introduce alternate bill-of-materials, footprint, overlap, boundary, or
hash semantics.

The proposed hash includes the incremented draft version and new pinned IDs.
`updatedAt` remains outside the Phase 1D review schema, so confirmation can set
the real timestamp while still producing the exact previewed hash.

## Cancel and failure behavior

Cancel is first and receives initial focus. The explicit Cancel button, close
button, and Escape all dismiss without writing. Focus returns to the invoking
action. A confirmation failure stays in the dialog as an accessible typed
alert; the current rendered review and browser storage are unchanged. Success
closes the dialog, focuses a polite status announcement, and renders the new
review.

## Accessibility, responsive, and print behavior

The native modal dialog has an accessible name and description, `aria-modal`,
a keyboard focus loop, visible 2 px focus indicators, and 44 px minimum
controls. Long revision IDs wrap or remain inside their scrolling region. The
dialog fits 1440 × 1000, 768 × 1024, and 375 × 812 viewports without horizontal
overflow; mobile keeps the scope and safe/confirm actions visible while details
scroll inside the dialog.

All update controls, the open dialog, navigation, and the copy control use the
existing print-hidden presentation. The read-only review evidence remains
printable.

## Automated evidence

The final ordered gate passes:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` — 8 files and 99 tests
- `pnpm build` — all seven application routes build successfully, including
  the local app icon

Focused Phase 1E tests cover exact update-one and replace-all targeting, cancel
without mutation, proposed/confirmed hash parity, one version increment,
byte-for-byte revision immutability, unrelated placements, exact quantities
and deltas, unchanged Phase 1C warning semantics, missing/incompatible
revisions, stale previews, no matches, invalid resulting courses, reload
persistence, keyboard cancellation and focus, accessible announcements, and
print-hidden controls. All Phase 1A–1D tests remain green.

## Production-build browser acceptance

The real browser fixture used two Revision 01 placements, one Revision 02
placement, and a newer Revision 03. The separated arena produced no geometry
warnings and the initial exact quantities were 3 obstacle instances, 6 printed
wing assemblies, 12 poles, 24 cups/adapters, 6 track assemblies, 6
foot/ballast assemblies, 6 flags, 24 pole end caps, and 1 gate.

- Initial draft version: 4
- Initial review hash:
  `5bfd119dc39ea9f449ec2e8427300a0433925f921a0da6da651f26c0b3ade393`
- Update-one preview and confirmed hash:
  `cb234425e3d07ee09547020b2d8e1c225cfea313139ba0254a92aa8aac36add3`
- Replace-all preview and confirmed hash:
  `fcf7087dc4dcfd57b3de7134a647c1932c0c078eb791125101d3de124ce04d8f`
- Update-one changed only display 01 and wrote one complete version-5 draft.
- Reload restored version 5 and the confirmed hash.
- Replace-all then targeted only remaining display 02; display 01 and the
  Revision 02 display 03 were outside its target set. It wrote one complete
  version-6 draft.
- Browser instrumentation observed exactly one course-key write per confirmed
  operation and byte-for-byte unchanged revision storage.
- Cancel and Escape preserved course JSON, draft version, workspace JSON,
  pinned IDs, quantities, and review hash.
- A deliberately stale open preview returned `stale_course_precondition` and
  did not overwrite the externally changed course value.
- Visible placements, quantities, warnings, and hash matched the machine JSON.
- Keyboard JSON copy produced the exact visible JSON and retained button focus.
- Desktop, tablet, and 375 × 812 mobile passed containment; every visible
  action was at least 44 × 44 px.
- Print emulation hid update controls, dialog, navigation, and copy control.
- Normal interactive 3D rendered one canvas. `?force3d=fail` disabled 3D,
  retained the deterministic SVG 2.5D view, and kept the selected revision.
- The final fresh production route completed a six-second console and network
  check with no warnings, errors, failed responses, or horizontal overflow.

## Screenshots

- `screenshots/update-one-preview.png` — 1440 × 1000
- `screenshots/update-one-confirmed.png` — 1440 × 1000
- `screenshots/replace-all-preview.png` — 1440 × 1000
- `screenshots/replace-all-confirmed-review.png` — 1440 × 1000
- `screenshots/mobile-update-flow.png` — 375 × 812

Every image was captured from the final production build and visually
inspected. The two preview images deliberately show complementary scroll
positions: update-one shows exact scope and quantity deltas; replace-all shows
warnings, current/proposed hashes, validation, boundary copy, and safe/confirm
actions.

## Prototype limitations and next gate

Phase 1E still has no accounts, server/database authority, cross-device sync,
sharing, collaborative editing, recovery/history system, supplier approval,
fabrication or safety claim, course certification, pricing, tax, freight,
checkout, payment, ordering, or production release.

The next honest gate is not an automatic server or commerce phase. It is Tim's
visual sign-off, representative-device performance validation, and supplier
confirmation of the unresolved product truth. Server-backed or commercial work
should wait until those gates and the separate Phase 2 commerce architecture
review are approved.
