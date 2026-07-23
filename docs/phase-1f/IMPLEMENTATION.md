# Phase 1F artwork foundation and logo customization

Status: complete for the bounded browser-local SPJ-04 prototype on 2026-07-15.

## Delivered boundary

The `/studio/obstacles/spj-04` workflow now accepts user-owned logo artwork and keeps it inside the same deterministic configuration, render, revision, course, and review graph already used by SPJ-04. It does not introduce a second editor authority or a filename-based asset lookup.

This phase deliberately does not implement Phase 1G concept generation or Phase 1H silhouette conversion. It also does not claim supplier-approved print readiness, fabrication readiness, safety approval, commerce, accounts, cloud storage, cross-device sync, sharing, or recovery.

## Content-addressed artifact contract

- Processing schema: `1.0.0-phase1f`.
- IndexedDB database: `course-design.artwork.v1`.
- `blobs` is keyed by SHA-256 content hash.
- `artifactRecords` is keyed by immutable artwork asset ID.
- Every accepted asset has two identities: the exact uploaded source-byte hash and the canonical rendered-PNG hash.
- Source and rendered bytes are hash-verified before their single IndexedDB transaction and verified again before an immutable revision can be saved.
- localStorage draft, revision, course, and review records contain IDs, hashes, placement metadata, and pinned snapshots—not blob URLs or file contents.
- Storage estimation is advisory; the write transaction and post-write hash verification remain authoritative. The application soft limit is 100 MiB and produces a typed, recoverable capacity failure instead of silent eviction.
- Cleanup requires an explicit proven set of referenced hashes and refuses to remove referenced content. Replacement and removal never delete bytes that an immutable revision may still use.

Object URLs exist only as ephemeral renderer handles. Retired URLs are revoked after a bounded 1.5-second decode-settle window so an in-flight Three.js texture decode can complete; repeated-replacement acceptance proves stale URLs are reclaimed without `blob:` request failures.

## Processing policy

### PNG and JPEG

- The processor detects media type from bytes and rejects extension/MIME spoofing.
- PNG and JPEG sources are limited to 10 MiB and 40 megapixels after decode.
- The canonical browser-canvas PNG is scaled to at most 2,048 px on its longest edge.
- PNG transparency is preserved.
- JPEG requires white, navy, or a custom panel background before confirmation; transparent background is a visible typed failure.
- Low-resolution messaging is preview-coverage guidance only and is explicitly not a supplier print threshold.

### SVG

- SVG sources are limited to 2 MiB, 5,000 elements, and 25,000 attributes.
- Scripts, event handlers, external references, remote fonts, `foreignObject`, and active content are rejected before rasterization.
- Accepted markup is sanitized with DOMPurify, normalized with an SVG namespace, decoded, and rasterized to the same canonical PNG contract as raster input.
- SVG decode supports a browser image fallback when `createImageBitmap` cannot decode sanitized SVG, while raster inputs continue to use the bitmap path.

### Explicit exclusions

PDF is visibly unsupported. There is no vector production export, color-profile conversion, supplier print validation, automatic background removal, generation, or silhouette extraction.

## Placement model

Each left/right placement pins:

- artwork asset ID, source hash, and rendered hash;
- pixel dimensions;
- `contain` or `cover` fit;
- integer scale in permille, X/Y offsets in basis points, and rotation in milli-degrees;
- transparent, white, navy, or validated custom background;
- independent prototype bleed and safe-area guide visibility.

Both wings are linked by default. `Edit wings separately` creates independent records. Relinking is destructive to the right-wing record and therefore requires an explicit confirmation that copies the left placement to the right. Cancel closes the editor without changing draft metadata. Confirm stores all new bytes first and only then publishes the configuration to the draft.

## Renderer parity

The renderer-neutral manifest is the only artwork input to both adapters:

- 2.5D places each exact content hash and normalized placement into the fixed panel slot.
- 3D applies textures only to named `left_fixed_artwork_*` and `right_fixed_artwork_*` meshes in the existing SPJ-04 GLB; it does not rebuild geometry.
- Both adapters expose deterministic hash/placement evidence attributes used by tests and production-browser acceptance.
- A generation guard prevents late async texture work from replacing a newer render, and textures/materials are disposed on replacement/unmount.
- `?force3d=fail` keeps the current content-addressed artwork in the deterministic 2.5D fallback.

The unchanged built-in Club Classic configuration still hashes to `721cfa28f279bc077a811d94a4b3b42b204e8f84331a82d0d69a4f44ce4a0c80`.

## Revision, course, and review integrity

- Immutable save verifies every custom artwork record and both source/render blobs before appending a revision.
- Reopening a revision is read-only and resolves only its pinned content hashes.
- Duplicate-to-edit carries the same artwork identity into a new mutable draft without changing its source revision.
- Replacing one wing in Revision 02 leaves Revision 01 and the other wing unchanged.
- Course instances continue to pin exact `obstacleDesignRevisionId` values.
- Course Review keeps the exact pinned configuration hashes and quantities.
- If local artwork bytes are missing or corrupt, the pinned logical revision remains intact and the UI reports incomplete artwork; it never falls back to the filename, current draft, or a newer revision.

## Accessibility and responsive behavior

- The editor uses a labelled file input, live processing state, native fieldsets/labels, pressed/selected states, an explicit relink alert dialog, visible focus, and keyboard-operable controls.
- Visible interactive targets are at least 44 × 44 px.
- Acceptance covers 375 × 812, 768 × 1024, and 1,440 × 1,000 viewports with no horizontal document overflow.
- At intermediate widths the configurator controls wrap instead of disappearing.

## Verification evidence

Repository gate:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` — 13 files, 133 tests
- `pnpm build`

Production-build browser acceptance (`node scripts/verify-phase-1f-browser.mjs`) passed 20 checks, including:

- visible typed rejection for PDF and unsafe SVG;
- successful PNG, JPEG, and sanitized-SVG processing;
- JPEG background enforcement;
- exact independent left/right hash and placement parity in 2.5D and 3D;
- two immutable revisions with Revision 01 unchanged after replacement;
- reload and read-only revision restoration;
- exact course placement and Course Review pinning across reload;
- forced WebGL failure with exact 2.5D artwork;
- object URL reclamation (`13` created, `11` revoked, `2` active for the final current pair);
- mobile/tablet/desktop containment, 44 px targets, visible keyboard focus;
- zero application warning/error console entries and zero failed requests.

The complete machine-readable result is in `browser-acceptance.json`. Screenshots are in `screenshots/`:

- `independent-wing-editor-desktop.png`
- `desktop-artwork-3d.png`
- `reload-read-only-revision.png`
- `course-revision-pinning.png`
- `course-review-artwork-pinning.png`
- `forced-2-5d-fallback.png`
- `mobile-artwork-editor.png`
- `tablet-artwork-editor.png`
- `desktop-reload-final.png`

Headless Chromium reported only its known SwiftShader readback performance notices; they are recorded separately from application console problems. Next.js navigation-cancelled React Server Component requests are also recorded separately from failed requests. No `blob:` load failure was accepted.

The real file input and upload pipeline were exercised with browser automation. The native operating-system picker could not be observed because the desktop session was locked, so native picker observation remains an explicit manual gate rather than a claimed pass.

## Next gate

Before any broader creative phase: obtain visual sign-off, measure a representative device, observe the native picker on an unlocked desktop, and confirm supplier print area, bleed, safe area, fastener clearance, material, color, and accepted-format rules. Phase 1G concept generation requires separate approval; Phase 1H remains excluded.
