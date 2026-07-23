# Phase 1A — SPJ-04 Configurator Foundation

Status: complete for the bounded non-sellable prototype. This note does not claim supplier confirmation, production readiness, safety validation, ordering, or sellable commerce.

## Architecture

The route uses one pure domain flow:

```text
ObstacleIntent
  -> validate and normalize
  -> ValidatedConfiguration
  -> deterministic SHA-256 configuration hash
  -> CompatibilityResult
  -> BillOfMaterials
  -> RenderManifest -> SVG 2.5D + lazy Three.js/GLB adapters
  -> PrototypePriceState
  -> CourseFootprint
  -> ProductionSpecPreview (human + machine)
```

`src/domain/product/definition.ts` reads the existing `canonical-obstacle.json` and `prototype-config-v1.json` inputs. `deriveConfiguration(intent)` is pure and returns typed success or typed validation failure. Expected invalid selections do not throw. Every derived object carries the same configuration hash.

The renderer-neutral manifest owns asset references, geometry, component counts, colors, material intent, artwork mapping, and the selected optional lower element. Neither visual adapter owns compatibility, price, footprint, bill-of-materials, or production truth.

## Commands

```bash
pnpm install
pnpm dev
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Route

- Main: `http://localhost:3000/studio/obstacles/spj-04`
- Forced 3D fallback acceptance: `http://localhost:3000/studio/obstacles/spj-04?force3d=fail`

The original GLB and fixed panel artwork are served directly from the existing benchmark directory through allowlisted asset route handlers. They are not replaced or regenerated.

## Contracts

Versioned domain schemas include:

- `ObstacleIntent`
- `ValidatedConfiguration`
- `CompatibilityResult`
- `BillOfMaterials`
- `RenderManifest`
- `PrototypePriceState`
- `CourseFootprint`
- `ProductionSpecPreview`
- typed validation success and failure results

Supported prototype controls are white, blue, red, or yellow frame; the single read-only two-color alternating pole treatment; mutually exclusive none, decorative panel, gate, or filler lower element; and the fixed Club Classic artwork mapped to both wing panels. Unsupported or malformed values return typed failures.

The only displayed price is:

`Prototype supplier example · CNY 9,000 · excludes tax, freight and retail markup`

Unknown frame/lower-element surcharges are named but never alter CNY 9,000.

## Rendering

- SVG 2.5D is server-visible first, requires no WebGL, and responds to frame and lower-element changes from the shared manifest.
- Three.js loads after the 2.5D view. It uses the existing named GLB meshes/materials for frame and fixed obstacle parts, the embedded fixed artwork, and manifest-driven prototype geometry for the optional lower-element slot.
- WebGL creation failure, GLB load failure, forced failure, and context loss return to the accurate 2.5D view without resetting configuration.
- Renderer, cloned materials, geometry, textures, controls, resize observer, animation frame, context, and event listener are disposed on teardown.

## Test and runtime evidence

- Formatting: pass
- ESLint: pass
- Strict TypeScript: pass
- Vitest/React Testing Library: 32 tests pass
- Next.js production build: pass
- Desktop runtime: 1440 × 1000, every frame/lower-element option, 2.5D, 3D, keyboard Space/Enter, bill of materials, footprint, spec, price wording, and console checked
- Mobile runtime: 375 × 812, 2.5D, 3D, option changes, 44 × 44 px minimum targets, zero horizontal overflow, and console checked
- Forced 3D failure: blue frame plus filler preserved in 2.5D; bill of materials retained one filler and four poles
- GLB response: HTTP 200, `model/gltf-binary`, 207,740 bytes
- Artwork response: HTTP 200, `image/png`, 43,671 bytes

## Screenshots

- `screenshots/spj-04-desktop.png` — full desktop default route with interactive 3D active
- `screenshots/spj-04-mobile.png` — mobile viewport with the first 2.5D product view
- `screenshots/spj-04-desktop-red-gate.png` — manifest-driven red frame and gate in 3D
- `screenshots/spj-04-3d-fallback.png` — forced failure preserving blue frame and filler in 2.5D

## Known prototype limitations

- All geometry, footprint, complete bill of materials, option compatibility, colors, fixed print area, and optional lower-element treatments remain inferred prototype values unless separately present under supplier-confirmed fields.
- The GLB represents the pinned default benchmark. Optional lower elements are renderer-neutral prototype primitives, not supplier-authored meshes.
- The approved Cabinet Grotesk, Instrument Sans, and IBM Plex Mono files are not present. The interface uses documented metric-conscious system fallbacks and does not claim final typography.
- No representative physical device/network profile has been named or measured; local responsive browser checks are complete, but that separate benchmark remains pending.
- There is no account, persistence, saved revision, sharing, course planning, artwork upload/scanning, checkout, payment, factory order, or production-grade export.

## Exact next milestone

Phase 1B: implement the versioned `ObstacleDesign` draft and immutable saved-revision boundary, including anonymous same-device restoration plus reopen and duplicate behavior. Reuse the Phase 1A `deriveConfiguration` output and renderer manifest unchanged. Keep course planning, sharing, artwork processing, pricing beyond the supplier example, payments, ordering, and production commitments out of that milestone.
