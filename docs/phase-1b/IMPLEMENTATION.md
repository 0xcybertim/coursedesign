# Phase 1B — Local Draft and Immutable Revisions

## Outcome

Phase 1B extends the non-sellable SPJ-04 prototype with one versioned mutable draft and append-only saved revisions on the same browser/device.

The direct route remains:

`/studio/obstacles/spj-04`

The Phase 1A derivation and renderer contracts are unchanged. A draft or opened revision still drives the same deterministic configuration hash, compatibility result, bill of materials, render manifest, supplier-cost example, footprint, and production-spec preview.

## Persistence boundary

- Storage is browser-local `localStorage` under `course-design.spj-04.local-workspace.v1`.
- There is one mutable `ObstacleDraft` with a monotonic `draftVersion`.
- Every explicit save appends a new `ObstacleDesignRevision` containing the full derived snapshot and its configuration hash.
- Opening a revision is read-only. Option controls and revision saving are locked.
- `Duplicate to edit` creates a new draft identity at version 1, linked to its source revision.
- Editing a duplicate cannot update or replace the source revision.
- Valid local state restores automatically after a reload.
- Malformed or hash-tampered local data is rejected and replaced by a safe default draft; it never becomes trusted configuration.
- Clearing browser data removes the draft and revisions. Nothing is copied to an account or cloud service.

The local schema is deliberately a prototype adapter, not a substitute for the later authenticated, server-authoritative revision store and compare-and-swap rules described in the engineering plan.

## Typography

The primary display and interface font is now the same current font used by the Selfso frontend:

- `SelfsoSans-VF.woff2` — normal variable style, weights 100–900
- `SelfsoSans-Italic-VF.woff2` — italic variable style, weights 100–900

The exact source files were copied from `apps/selfso-fe/public/fonts/`, their SHA-256 hashes were checked after copying, and the normal style is preloaded. DIN Next LT Pro remains the same secondary fallback used by Selfso.

## Main implementation

- `src/domain/design/local-revisions.ts` — typed schema, creation, draft update, append-only save, lookup, duplicate, serialization, and defensive parsing.
- `src/components/studio/useLocalDesignWorkspace.ts` — browser-local restore and write adapter plus view/duplicate state.
- `src/components/studio/StudioClient.tsx` — local save state, immutable history, read-only reopen, and duplicate-to-edit interface.
- `public/fonts/` — exact SelfsoSans variable font assets.
- `tests/domain/local-revisions.test.ts` — deterministic domain and corruption coverage.
- `tests/components/studio-client.test.tsx` — real remount restoration and complete revision interaction coverage.

## Automated verification

All checks passed on 2026-07-13:

```text
pnpm format:check  pass
pnpm lint          pass
pnpm typecheck     pass
pnpm test          pass — 45 tests
pnpm build         pass — Next.js 16.2.10 production build
```

The 45 tests include:

- Draft schema and monotonic versioning.
- Typed rejection of unsupported choices.
- Complete hash-pinned revision snapshots.
- Append-only history and unique revision identifiers.
- Duplicate-to-edit without source mutation.
- JSON round-trip restoration.
- Malformed, unsupported, and hash-tampered storage rejection.
- Component-level reload restoration.
- Read-only reopen and locked controls.
- Revision history restoration after remount.
- Existing option, derivation, renderer fallback, price, accessibility, and reduced-motion coverage from Phase 1A.

## Real runtime acceptance

The local Next.js route was tested at 1440 × 1000 and 375 × 812 in the Codex in-app browser.

Passed behavior:

1. The initial 2.5D obstacle appeared and upgraded to interactive 3D.
2. The computed body stack began with `SelfsoSans`.
3. Red frame plus gate changed the visual and derived hash.
4. `Save immutable revision` created Revision 01 with the pinned hash.
5. Reload restored the red/gate draft and Revision 01.
6. The mutable draft was changed to blue/filler without changing Revision 01.
7. Opening Revision 01 restored the pinned red/gate projections and disabled every option and save action.
8. `Duplicate to edit` created a fresh editable version-1 draft from Revision 01.
9. Editing the duplicate and reopening Revision 01 proved the saved source remained red/gate with its original hash.
10. `?force3d=fail` retained the local draft, saved history, accurate 2.5D view, and all derived evidence.
11. Keyboard space activation changed a real radio option while retaining focus.
12. Mobile had `scrollWidth === clientWidth` and no interactive target below 44 × 44 px.
13. Browser warning/error log was empty.

## Screenshots

- `screenshots/spj-04-phase-1b-desktop.png` — 1440 × 1000 main studio with interactive 3D ready.
- `screenshots/spj-04-phase-1b-desktop-revisions.png` — desktop mutable draft, immutable Revision 01, and derived evidence.
- `screenshots/spj-04-phase-1b-mobile.png` — 375 × 812 product-first mobile studio.
- `screenshots/spj-04-phase-1b-mobile-revisions.png` — 375 × 812 local restore and draft/revision boundary.

## Explicit exclusions

Phase 1B still does not provide accounts, cross-device persistence, a server database, sharing, archive/delete workflows, course planning, artwork upload/scanning, payments, ordering, retail calculations, production confirmation, or safety claims.
