# Phase 1H final completion audit

Date: 2026-07-23  
Overall status: **complete**

| Requirement                          | Status | Evidence                                                                                                                                                       |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated subject-mask provider gate | Passed | remove.bg: 20/20 clean accepted, 9/9 unsafe rejected, exactly 29 calls, zero retries, $0, mandatory visual pass.                                               |
| Deterministic vectorization          | Passed | 18/20 clean canonical polygons; bicycle and teapot rejected for holes; 9/9 unsafe rejected; repeated identities stable.                                        |
| Explicit human acceptance            | Passed | B2 append-only hash-verified current decisions; rejected results cannot be accepted.                                                                           |
| Pure profile derivation              | Passed | Fixed 5,900 × 800 × 1,800 mm inferred envelope, two mirrored plates, four poles, fixed supports, generic counts.                                               |
| Exact 2.5D/3D polygon parity         | Passed | Shared geometry SHA-256 is identical in SVG, stage, Three.js container, and WebGL canvas.                                                                      |
| Honest 3D fallback                   | Passed | `?force3d=fail` disables 3D and preserves the exact 2.5D geometry hash.                                                                                        |
| Three.js resource ownership          | Passed | Generated geometry/material disposal unit coverage plus browser context-loss fallback.                                                                         |
| Immutable generated revision         | Passed | Snapshot pins decision, polygon, geometry, footprint, quantities, provenance, and limitations; tampering rejected.                                             |
| One-time v1-to-v2 migration          | Passed | Production UI acceptance preserves the SPJ-04 revision ID and `721cfa28f279bc077a811d94a4b3b42b204e8f84331a82d0d69a4f44ce4a0c80` hash; legacy bytes unchanged. |
| All new design writes use v2         | Passed | SPJ-04 studio, profile studio, course studio, and review restore the unified v2 library.                                                                       |
| Mixed-family course placement        | Passed | Generated profile and configured SPJ-04 place together with exact pinned references.                                                                           |
| Mixed quantities and footprints      | Passed | Domain tests and browser review prove 5,100/5,900 mm footprints and exact mixed counts.                                                                        |
| Same-design update constraint        | Passed | Update-one and replace-all reject cross-design destinations.                                                                                                   |
| No silent repinning                  | Passed | Saving Profile Revision 02 leaves the course pinned to Profile Revision 01.                                                                                    |
| Generated/inferred review truth      | Passed | Course Review visibly records `generated · inferred not supplier confirmed`.                                                                                   |
| Responsive and accessible controls   | Passed | Profile, course, and review at 1440 × 1000, 768 × 1024, and 375 × 812; zero horizontal overflow and all visible buttons/links at least 44 px.                  |
| Production-browser cleanliness       | Passed | Zero product POST, provider, external, failed-request, or console-error activity.                                                                              |
| Mandatory visual inspection          | Passed | Profile renderer, forced fallback, course, and Course Review screenshots inspected at required sizes.                                                          |
| Repository gates                     | Passed | Prettier, ESLint, TypeScript, 25 test files / 212 tests, and Next.js production build.                                                                         |

## Preserved exclusions

Phase 1H does not add arbitrary generated support geometry or 3D meshes, supplier or production approval, structural or safety validation, pricing, freight, tax, checkout, ordering, accounts, server persistence, cross-device sync, public sharing, or automatic placement repinning.

The only external work remains the already consumed Phase 1H-A remove.bg benchmark authorization. C2, revision persistence, migration, course integration, and final acceptance made zero external calls.
