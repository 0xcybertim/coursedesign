# Phase 1H-C1 deterministic Profile Wing Vertical derivation

Date: 2026-07-22  
Status: complete for the bounded renderer-neutral domain slice  
External calls: 0

## Outcome

Phase 1H-C1 derives one deterministic, non-sellable `Profile Wing Vertical` prototype description from the current accepted decision in a hash-valid Phase 1H-B2 review.

The derivation does not accept a polygon or historical decision in isolation. It validates the complete B2 review, finds the current decision for the requested fixture, and continues only when that decision is `accepted_for_future_prototyping`. A later `retained_without_conversion` event supersedes an earlier acceptance and blocks derivation.

## Deterministic contract

The C1 definition is schema `1.0.0-phase1h-c1` and deliberately labels every dimension and support position as `inferred_not_supplier_confirmed`.

For one accepted B1 polygon, C1:

1. Verifies the complete B2 evidence identity and every decision hash.
2. Requires the current fixture decision to permit future prototyping.
3. Fits the canonical normalized polygon proportionally into a maximum 1,200 × 1,500 mm profile region.
4. Converts it to integer millimetres, a y-up Cartesian coordinate system, and counterclockwise winding.
5. Keeps 150 mm inferred lower clearance and an inferred 40 mm extrusion depth.
6. Creates two instances of the exact shared polygon: left unchanged and right mirrored.
7. Adds only fixed inferred support assumptions: four 3,500 × 100 mm poles at 650, 950, 1,250, and 1,550 mm; two 1,800 mm tracks; two 800 mm-deep feet; and two flags.
8. Emits a controlled 5,900 × 800 × 1,800 mm envelope and matching 5,900 × 800 mm advisory footprint.
9. Emits generic prototype component counts, never material or fabrication quantities.
10. Carries one shared geometry SHA-256 into both the 2.5D polygon and 3D extrusion-source projections.

The shape hash excludes decision IDs and timestamps. Two accepted decisions over the same immutable silhouette therefore produce identical geometry. The prototype provenance hash includes the current decision hash, so two human events remain distinguishable without changing the shape.

## Generic counts

- 2 silhouette wing plates
- 4 prototype poles
- 8 cups or release adapters
- 2 prototype tracks
- 2 feet or ballast assemblies
- 2 flags
- 8 pole end caps

Every line is workflow evidence only, marked `inferred_not_supplier_confirmed`, and the complete output remains `notForProduction` and `notForOrdering`.

## Typed failure behavior

C1 returns an explicit failure for:

- malformed input;
- unsupported or tampered B2 review metadata;
- an unknown or undecided fixture;
- a current retain decision;
- a rejected B1 result;
- invalid source geometry that cannot fit the C1 envelope.

No failure path returns partial profile geometry.

## Evidence

`pnpm acceptance:phase1h:c1` creates a repository-deterministic test acceptance for `clean-dog-side`, derives twice, requires exact repeat equality, verifies 2.5D/3D geometry identity, and writes:

- `docs/phase-1h/profile-wing-c1-evidence.json`
- `docs/phase-1h/profile-wing-c1-preview.svg`

The evidence explicitly says `userDecisionClaimed: false`. It proves the domain seam without pretending that Tim accepted the dog fixture in his browser-local review.

The deterministic evidence geometry SHA-256 is `f1611dd49ffcc3f306600c741a86674b6af0a205f78951696652353e9995c8d2`. Codex rendered and inspected the front elevation: both dog profiles are intact and mirrored, the same profile geometry is used on each side, four poles are present, tracks/feet/flags are aligned, and the non-production warning is unobscured.

## Explicit boundary

C1 adds no product editor, preview route, local persistence, design library, storage migration, immutable obstacle revision, course placement, course quantities, production specification, price, quote, checkout, provider call, upload, supplier truth, fabrication instruction, structural validation, or safety claim.

The next honest milestone is a separately scoped Phase 1H-C2 read-only renderer proof. It should consume the C1 manifest from the current accepted B2 decision and prove that a visible deterministic SVG/2.5D projection and fixed-thickness Three.js extrusion use the exact same geometry hash, with explicit WebGL fallback, before any revision or storage migration.
