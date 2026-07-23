# Phase 1H final implementation

Date: 2026-07-23  
Status: **complete within the browser-local non-sellable prototype boundary**

## Delivered outcome

An explicitly accepted B2 silhouette can now become a deterministic `Profile Wing Vertical` prototype, render from one shared polygon in 2.5D and 3D, save as an immutable generated revision, migrate into the shared v2 local design library, and be placed beside SPJ-04 revisions in a course.

The implementation preserves the core truth boundary:

- generated silhouette, dimensions, supports, and quantities are inferred prototype assumptions;
- no supplier geometry, structural or aerodynamic validation, safety status, fabrication readiness, price, or ordering status is claimed;
- browser-local storage is the only persistence;
- no provider or product API call occurs anywhere after the already completed Phase 1H-A benchmark.

## Renderer parity

Route: `/studio/obstacles/profile-wing`

- Requires a current hash-verified B2 action of `accepted_for_future_prototyping`.
- A later `retained_without_conversion` action supersedes historical acceptance and blocks derivation.
- SVG 2.5D and Three.js use the same `ProfileWingRenderManifest.geometrySha256`.
- The two plates mirror one canonical integer-mm polygon.
- Three.js extrudes that exact polygon by the fixed inferred 40 mm depth.
- Tracks, feet, flags, and four poles come from the fixed C1 manifest.
- `?force3d=fail` and real WebGL failures leave the exact 2.5D silhouette active.
- Generated geometries and materials are disposed on unmount.

Repository acceptance geometry:

`f1611dd49ffcc3f306600c741a86674b6af0a205f78951696652353e9995c8d2`

## Immutable v2 design library

Storage key: `course-design.local-design-library.v2`

The library contains the SPJ-04 workspace plus generated profile revisions. Migration behavior is deterministic:

1. Restore a valid v2 library when present.
2. Otherwise import one valid `course-design.spj-04.local-workspace.v1` payload.
3. Preserve every legacy revision ID and configuration hash.
4. Leave the legacy key byte-for-byte untouched.
5. Write every subsequent SPJ-04 and generated-profile change only to v2.

Each generated revision pins:

- B2 decision identity and hash;
- source mask and canonical polygon hashes;
- shared renderer geometry hash;
- deterministic envelope and footprint;
- generic inferred component counts;
- generated/inferred/non-supplier provenance;
- explicit non-production and non-ordering status.

Parsing recomputes the prototype identity and every shared projection. Modified footprints, quantities, provenance, or prototype geometry are rejected instead of trusted.

## Mixed-family course integration

The course consumes one `LocalDesignRevision` union. Existing course instance references remain revision-ID based and require no migration or repinning.

- SPJ-04 footprint: 5,100 × 800 mm.
- Profile Wing footprint: 5,900 × 800 mm.
- Quantities aggregate only from exact pinned revision snapshots.
- The saved-design rail and course symbols identify configured SPJ-04 versus generated profiles.
- Course Review includes family, configured/generated provenance, evidence status, footprint, quantities, and production limitation.
- Newer revisions are visible but never silently repin placements.
- Update-one and replace-all reject destinations from another design.

## Evidence

- `phase-1h-c2-browser-acceptance.json`: renderer parity, forced fallback, blocked state, responsive layout, and network boundary.
- `phase-1h-end-to-end-browser-acceptance.json`: production UI creation of an SPJ-04 v1 revision, exact v1-to-v2 migration, generated revision save/reload, mixed-family placement, review provenance, newer-revision immutability, responsive course/review layouts, and zero-call boundary.
- `phase-1h-c2-screenshots/`: profile renderer at desktop, tablet, mobile, and forced fallback.
- `phase-1h-end-to-end-screenshots/`: mixed-family course and review at desktop, tablet, and mobile.

All screenshots received mandatory visual inspection. No visible watermark, overflow, renderer mismatch, missing provenance, or misleading production claim was accepted.
