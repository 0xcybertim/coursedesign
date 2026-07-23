# Phase 1H-B1 completion audit

Date: 2026-07-22  
Decision: complete within the approved deterministic-kernel boundary

## Acceptance matrix

| Gate                          | Result | Evidence                                                                                           |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Existing approved inputs only | Pass   | 26 Phase 1H-A remove.bg masks plus 3 repository ground-truth empty masks                           |
| External calls                | Pass   | 0 calls, 0 retries, no network dependency                                                          |
| Input integrity               | Pass   | Every loaded PNG is checked against its approved SHA-256                                           |
| Cleanup                       | Pass   | Threshold, four-connected components, and deterministic tiny-island removal                        |
| One subject                   | Pass   | All 3 multi-subject cases rejected explicitly                                                      |
| One outer contour, no holes   | Pass   | Bicycle and teapot rejected explicitly; no partial geometry returned                               |
| Canonical coordinates         | Pass   | Integer 0–10,000 coordinates, stable start point, clockwise screen winding                         |
| Geometry validation           | Pass   | Vertex, area, feature-core, envelope, reserved-region, intersection, and winding checks            |
| Determinism                   | Pass   | All 29 second runs exactly match their first result                                                |
| Unsafe fixtures               | Pass   | 9/9 rejected                                                                                       |
| Usable clean fixtures         | Pass   | 18/20 accepted; threshold was at least 16                                                          |
| Visual inspection             | Pass   | Full source-versus-vector board inspected; no visible accepted-contour corruption                  |
| Scope containment             | Pass   | No UI, product geometry, revision, storage migration, renderer, course, provider, or commerce work |

## Finding totals

- `empty_mask`: 3
- `holes_not_supported`: 2
- `multiple_significant_subjects`: 3
- `outside_prototype_envelope`: 3

## Automated evidence

- `pnpm benchmark:phase1h:vectorize`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

The canonical machine-readable result is `docs/phase-1h/vectorization-benchmark-results.json`; the rendered review artifact is `docs/phase-1h/vectorization-preview.svg`.

## Residual risk

The corpus is synthetic and small. The B1 polygon is suitable only as deterministic prototype input. Hole support, manual contour editing, real-photo variability, fine-feature preservation beyond these fixtures, reserved regions for a final supplier profile, material thickness, structural behavior, fabrication, and safety remain unproven.

## Next gate

Do not silently create the profile-wing product. Scope Phase 1H-B2 separately as a read-only review and explicit human-decision surface over B1 evidence. Product generation remains blocked until that decision boundary is proven.
