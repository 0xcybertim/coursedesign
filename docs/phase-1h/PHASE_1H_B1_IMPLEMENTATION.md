# Phase 1H-B1 deterministic vectorization kernel

Date: 2026-07-22  
Status: complete for the bounded local kernel  
External calls: 0

## Outcome

Phase 1H-B1 converts a trusted local raster mask into either one canonical `WingSilhouette` polygon or an explicit typed rejection. It does not create an obstacle, product revision, renderer, course placement, or user interface.

The exact approved Phase 1H-A corpus produced:

- 18 accepted clean silhouettes;
- 2 rejected clean silhouettes (`clean-bicycle` and `clean-teapot`) because v1 deliberately forbids holes;
- all 3 empty fixtures rejected as `empty_mask`;
- all 3 multi-subject fixtures rejected as `multiple_significant_subjects`;
- all 3 badly occluded fixtures rejected as `outside_prototype_envelope`;
- identical results and polygon hashes on a second run of every fixture.

This meets the Phase 1H provider-to-vector threshold of at least 16 usable clean fixtures while keeping every unsafe case out of geometry.

## Deterministic contract

`src/domain/silhouette/` now provides a pure TypeScript pipeline:

1. Validate raster dimensions and byte length.
2. Threshold grayscale bytes at 128.
3. Find four-connected foreground components.
4. Remove islands smaller than 0.2% of the raster.
5. Require exactly one significant component.
6. Count and reject enclosed holes.
7. Trace the directed pixel-edge boundary.
8. Remove collinear points and simplify with a bounded deterministic tolerance.
9. Normalize to integer coordinates in a 10,000 × 10,000 top-left coordinate system.
10. Canonicalize clockwise screen-coordinate winding and rotate to a stable first point.
11. Validate vertex count, area, feature core, prototype envelope, reserved bottom region, self-intersection, and winding.
12. Hash only the canonical polygon identity with SHA-256 and retain the exact source-mask hash plus vectorizer and validator versions.

Accepted output is schema `1.0.0-phase1h-b1-wing-silhouette`. A rejection never returns a partial silhouette. Cleanup evidence remains available in both paths.

## Provenance and zero-call evidence

`pnpm benchmark:phase1h:vectorize` is local-only. Before vectorization it cross-checks every input against the Phase 1H-A manifest and remove.bg result hashes. It requires exactly 26 approved saved provider masks. The three remove.bg HTTP 400 empty cases use their repository-generated ground-truth masks only to exercise deterministic empty rejection.

The runner aborts on a missing mask, provider/result disagreement, hash mismatch, corpus-count mismatch, or non-deterministic repeat. It imports no provider adapter and performs no network operation.

Evidence:

- `vectorization-benchmark-results.json` records all 29 decisions, cleanup values, canonical polygons, hashes, versions, and the zero-call boundary.
- `vectorization-preview.svg` places each source mask beside its canonical polygon or rejection reason.

## Mandatory visual inspection

Codex rendered and inspected the full 29-card comparison board on 2026-07-22. The 18 accepted polygons preserve the visible source silhouettes without contour folding, self-crossing, detached geometry, or visibly missing subject parts. Bicycle and teapot visibly contain holes and are correctly rejected under the v1 rule. Empty, multi-subject, and occluded cases visibly match their typed rejection. Visual inspection therefore passes for this synthetic benchmark.

This inspection is benchmark evidence, not user design approval, supplier approval, fabrication validation, or production safety evidence.

## Explicit boundary

Phase 1H-B1 does not implement retries, provider calls, crop/edit controls, manual correction, user acceptance, artifact persistence, `Profile Wing Vertical`, mirrored wings, poles, tracks, cups, feet, rendering, immutable revisions, storage migration, course integration, pricing, commerce, supplier truth, fabrication, or safety claims. Those remain separate gates.

The next honest milestone is a separately bounded Phase 1H-B2 review surface over these immutable B1 results. It should show source, polygon, findings, provenance, and an explicit accept/retain-without-conversion decision without yet generating authoritative obstacle geometry.
