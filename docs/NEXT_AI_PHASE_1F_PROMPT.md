# Next AI Prompt: Execute Phase 1F with Codex Goals

Copy and paste everything below into the next Codex task.

---

Work in:

`/Users/timwijnhoven/Documents/coursedesign`

Implement and fully verify **Phase 1F: artwork foundation and logo customization**. Use Codex Goals to persist until the bounded Phase 1F outcome is genuinely complete.

## First action: create the Codex Goal

Before editing files, call `create_goal` with this objective and no token budget:

> Implement and verify the complete browser-local Phase 1F artwork foundation and SPJ-04 logo-customization workflow described in `docs/CREATIVE_OBSTACLE_EXPANSION_PLAN.md`, including content-addressed artwork storage, PNG/JPEG/sanitized-SVG processing, constrained left/right placement, exact 2.5D/3D parity, immutable revision support, reload persistence, course/review integrity, accessibility, responsive browser acceptance, documentation, and all regression checks. Do not begin Phase 1G concept generation or Phase 1H silhouette conversion.

Keep the goal active across continuations. Mark it complete only after every required automated and browser acceptance check passes and no required Phase 1F work remains.

## Read before changing anything

Read these files completely and confirm in your first progress update that you have read them:

- `docs/CREATIVE_OBSTACLE_EXPANSION_PLAN.md`
- `TODOS.md`
- `DESIGN.md`
- `product-truth/PRODUCT_TRUTH.md`
- `product-truth/SOURCE_EVIDENCE.md`
- `product-truth/SUPPLIER_REQUEST.md`
- `product-truth/canonical-obstacle.json`
- `docs/phase-1a/IMPLEMENTATION.md`
- `docs/phase-1b/IMPLEMENTATION.md`
- `docs/phase-1e/IMPLEMENTATION.md`
- `src/domain/product/types.ts`
- `src/domain/product/definition.ts`
- `src/domain/design/derive-configuration.ts`
- `src/domain/design/local-revisions.ts`
- `src/domain/design/stable-hash.ts`
- `src/domain/render/manifest.ts`
- `src/components/studio/StudioClient.tsx`
- `src/components/studio/ObstacleTwoD.tsx`
- `src/components/studio/ThreeScene.tsx`
- `src/components/studio/ThreeStage.tsx`
- `src/components/studio/useLocalDesignWorkspace.ts`
- `src/domain/course/types.ts`
- `src/domain/course/quantities.ts`
- `src/domain/course/geometry.ts`
- `src/domain/course/review.ts`
- `src/domain/course/revision-update.ts`
- `src/components/course/useLocalCourseWorkspace.ts`
- `src/components/course/useLocalCourseReview.ts`
- `assets/spj-04/prototype-v1/asset-manifest.json`
- `assets/spj-04/prototype-v1/BENCHMARK.md`
- existing tests under `tests/domain/` and `tests/components/`

Inspect `git status --short` before editing. The workspace previously appeared entirely untracked. Preserve every existing file and unrelated user change. Do not stage, commit, delete, reset, or rewrite unrelated work unless the user separately authorizes it.

Run the existing ordered quality gate before implementation and record any pre-existing failure separately:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If a baseline check fails, investigate the cause before changing product behavior. Do not hide a pre-existing failure inside the Phase 1F diff.

## Locked product decisions

- Phase 1F is browser-local and non-sellable.
- Accept PNG, JPEG, and sanitized SVG.
- PDF is unsupported and must receive a clear error.
- PNG transparency is preserved.
- JPEG requires an explicit background.
- Raw SVG is never inserted directly into the DOM or Three.js.
- Store the SHA-256 hash of original bytes and a separate SHA-256 hash of the accepted canonical rendered artifact.
- Artwork is linked across both wings by default.
- `Edit wings separately` enables independent left/right asset and placement records.
- Relinking requires confirmation because it replaces the right placement with the left placement.
- Both 2.5D and Three.js must consume the same hashed artwork and placement truth.
- Saving a revision is blocked until every referenced artifact exists and passes hash verification.
- Replacing/removing the draft logo never mutates or deletes assets referenced by saved revisions.
- Existing course placements remain pinned to exact immutable revision IDs.
- Missing local blobs never resolve by filename and never fall back to the current draft logo.
- Bleed, safe area, dimensions, and resolution guidance are visibly labelled prototype assumptions, not supplier-confirmed print rules.
- Do not implement Phase 1G or Phase 1H.

## Required Phase 1F outcome

### 1. Artwork domain and hashing

Add the planned artwork types and pure validation/placement rules:

- `ArtworkAsset`
- `ArtworkPlacement`
- `ArtworkConfiguration`
- source and rendered content hashes
- integer normalized transform values suitable for stable hashing
- linked and independent left/right mappings
- typed validation and storage failures

The validated obstacle configuration must contain artifact hashes and placement records. Its existing SHA-256 configuration hash must therefore change when the accepted artwork or placement changes, while the unchanged built-in Club Classic configuration retains its current hash.

### 2. Safe format processing

Implement:

- PNG/JPEG source maximum: 10 MiB.
- SVG source maximum: 2 MiB.
- Raster decode maximum: 40 megapixels.
- Canonical panel render maximum: 2,048 px on the longest edge.
- Real content detection rather than trusting filename or browser MIME alone.
- Correct image orientation before canonical rendering.
- SVG sanitization that rejects scripts, event handlers, external references, remote fonts, `foreignObject`, unsupported active content, and excessive complexity.
- Canonical rendered PNG output used by both renderers.
- Preview-quality warnings that never claim to be supplier print thresholds.

Prefer a maintained sanitizer over custom string replacement. Treat SVG as active input until sanitization and rasterization are complete.

### 3. Browser artifact store

Use IndexedDB for blobs and artifact records. Keep localStorage limited to existing small workspace/course metadata and content-hash references.

Required stores:

- `blobs`, keyed by SHA-256 content hash.
- `artifactRecords`, keyed by artifact ID.

Required behavior:

- write and verify blob before updating draft metadata;
- detect missing, corrupt, quota, and unavailable storage states;
- check storage estimates before large writes;
- no silent eviction;
- no deletion of revision-referenced content;
- object URLs created only for active rendering and revoked when replaced/unmounted;
- unreferenced cleanup must prove that no draft or revision references a blob.

### 4. Artwork editor interaction

Add the complete UI to the existing SPJ-04 route:

- labelled file picker and drag/drop;
- accepted types and limits before selection;
- visible filename and processing state after selection;
- contain/cover;
- scale;
- X/Y position and alignment shortcuts;
- rotation;
- transparent, white, navy, and custom backgrounds;
- prototype bleed and safe-area guides;
- explicit unresolved fastener/edge guidance;
- linked left/right default;
- optional independent left/right editing;
- replace, remove, cancel, and confirm;
- safe relink confirmation;
- typed recoverable errors;
- no draft mutation on cancel.

Follow `DESIGN.md`: product remains visually dominant; studio controls stay calm; body copy never drops below 16 px; all touch targets are at least 44 x 44 px; visible 2 px focus rings; drag interactions always have keyboard/numeric alternatives.

### 5. Renderer parity

Refactor the render manifest so it carries deterministic artwork slot references and placement data rather than a temporary object URL.

- `ObstacleTwoD.tsx` must render left/right from the shared manifest plus resolved artifact URLs.
- `ThreeScene.tsx` must replace textures on the named `left_fixed_artwork_*` and `right_fixed_artwork_*` meshes already present in the GLB.
- Dispose replaced Three.js textures/material resources correctly.
- Do not recreate or mutate product geometry for logo placement.
- `?force3d=fail` must preserve the exact selected artwork and placements in 2.5D.

### 6. Immutable revisions, reload, and course behavior

- The mutable draft contains artwork hash references and placement records.
- Saving appends a complete immutable revision snapshot.
- Opening a saved revision resolves its exact assets read-only.
- `Duplicate to edit` preserves source hashes and placements without mutating the source.
- Reload restores the same draft, assets, revision hashes, and rendering.
- Replacing the working logo leaves every older revision byte-for-byte unchanged.
- Course placements remain pinned to revision IDs and do not repin automatically.
- Course review identity continues to derive from pinned revision/configuration truth.
- Local missing-artifact availability is visible but does not silently change the logical course-review identity or quantities.

## Planned files

Add:

- `src/domain/artwork/types.ts`
- `src/domain/artwork/validate.ts`
- `src/domain/artwork/placement.ts`
- `src/domain/artwork/index.ts`
- `src/lib/browser/artifact-store.ts`
- `src/components/studio/ArtworkEditor.tsx`
- `src/components/studio/useArtworkAssets.ts`
- `tests/domain/artwork.test.ts`
- `tests/browser/artifact-store.test.ts`
- `tests/components/artwork-editor.test.tsx`
- `docs/phase-1f/IMPLEMENTATION.md`

Modify only as required:

- `package.json`
- `src/domain/product/types.ts`
- `src/domain/product/definition.ts`
- `src/domain/design/derive-configuration.ts`
- `src/domain/render/manifest.ts`
- `src/domain/design/local-revisions.ts`
- `src/domain/design/index.ts`
- `src/components/studio/StudioClient.tsx`
- `src/components/studio/useLocalDesignWorkspace.ts`
- `src/components/studio/ThreeStage.tsx`
- `src/components/studio/ObstacleTwoD.tsx`
- `src/components/studio/ThreeScene.tsx`
- `src/app/globals.css`
- relevant existing domain/component tests
- `TODOS.md` only after the implementation and acceptance results are known

If the implementation proves that a listed file is unnecessary or a smaller explicit structure is safer, use the smaller structure and document the deviation. Do not create speculative abstractions for Phase 1G/1H.

## Test requirements

Add complete coverage for:

- valid PNG, JPEG, transparent PNG, and SVG;
- corrupt bytes, spoofed MIME/type, unsupported PDF, and size/dimension limits;
- SVG script, event-handler, external-resource, remote-font, `foreignObject`, and complexity rejection;
- source and rendered SHA-256 hashes;
- integer placement normalization;
- linked editing, unlinking, independent placement, safe relinking, cancel, replace, and remove;
- IndexedDB round-trip, missing records, corrupt hashes, quota failure, and unavailable storage;
- configuration hash changes for artwork/placement changes;
- unchanged built-in SPJ-04 hash regression;
- append-only revisions and byte-for-byte older-revision immutability;
- reload and read-only reopen;
- object URL and Three.js texture cleanup;
- exact 2.5D/3D artifact and placement parity;
- WebGL fallback;
- course placement/review behavior and no silent repinning;
- accessible labels, focus restoration, live announcements, keyboard controls, reduced motion, and print-hidden mutation controls where applicable.

All existing Phase 1A-1E tests must remain green.

## Real browser acceptance

Run the production build and test the real route, not only jsdom:

- desktop: 1440 x 1000;
- tablet: 768 x 1024;
- mobile: 375 x 812;
- normal Three.js;
- forced 2.5D fallback with `?force3d=fail`.

Demonstrate:

1. Upload a transparent SVG logo.
2. Sanitize and preview it.
3. Position it with contain mode and prototype safe-area guides.
4. Keep wings linked, then edit the right wing separately.
5. Confirm matching 2.5D and 3D rendering.
6. Save an immutable revision.
7. Reload and reopen it read-only.
8. Replace the working draft logo without changing the saved source.
9. Place old and new revisions in the course.
10. Verify pinned revision IDs, distinct hashes, stable reload, quantities, and review behavior.

Acceptance also requires:

- no horizontal overflow;
- no touch target smaller than 44 x 44 px;
- visible keyboard focus;
- file picker alternative to drag/drop;
- numeric/keyboard alternatives to direct manipulation;
- empty browser warning/error console;
- no failed asset requests;
- no object URL or Three.js texture leak visible during repeated replace/remove cycles;
- exact artwork preserved in forced fallback;
- clear errors for unsupported files, storage failure, missing blobs, and invalid SVG.

Capture final desktop, mobile, independent-wing, reload/revision, course-pinning, and forced-fallback screenshots in `docs/phase-1f/screenshots/` and inspect each image.

## Ordered final gate

Run in this order:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Then complete production-build browser acceptance. If any gate fails, keep the Codex Goal active, fix the root cause, and rerun the relevant checks plus the final ordered gate.

## Documentation and boundaries

Update `docs/phase-1f/IMPLEMENTATION.md` with:

- final schemas and storage contract;
- source/render hash behavior;
- renderer texture ownership and cleanup;
- revision and course behavior;
- validation and failure modes;
- automated-check results;
- browser acceptance and screenshots;
- deviations from this prompt;
- exact prototype limitations and next gate.

Update `TODOS.md` only with the verified Phase 1F result and honest next gate. Do not claim supplier approval, production readiness, or completion of generation work.

## Non-goals

- No concept-generation UI or model API.
- No Phase 1G or Phase 1H code.
- No profile-wing family or generated silhouette.
- No PDF parsing.
- No automatic background removal.
- No accounts, server persistence, cloud object storage, sharing, or cross-device sync.
- No checkout, payment, ordering, tax, freight, or pricing expansion.
- No supplier, structural, safety, federation, regulatory, fabrication, or production claim.
- No arbitrary generated mesh.
- No mutation of saved revisions.
- No automatic course repinning.
- No staging, commit, push, or pull request unless the user separately requests it.

When every required outcome and check is complete, call `update_goal` with `status: "complete"`, then report the verified result, exact files changed, tests, browser acceptance, screenshots, limitations, and remaining Phase 1G gate.

---
