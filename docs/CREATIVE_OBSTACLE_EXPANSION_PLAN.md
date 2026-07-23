# Creative Obstacle Expansion Plan

Status: Approved for phased implementation on 2026-07-15  
Scope: Product, interaction-design, data, rendering, persistence, generation, testing, and phase boundaries for logo customization and generated obstacle concepts  
Implementation status: Phase 1F and the honest, tester-ready Phase 1G workflow simulator are complete. A separately authorized 2026-07-21 edit-only live follow-up returned four genuinely changed dog concepts with zero generation calls and no retries, but every output rendered three horizontal poles instead of the authoritative four. Live edit delivery is verified; structural fidelity failed. Tim approved the result as creative-only source material. Phase 1H is complete end to end within its browser-local, non-sellable boundary. The Photoroom sandbox was rejected for watermarking; the separately authorized remove.bg free-preview run passed 20/20 clean masks, rejected all 9 unsafe cases, passed mandatory visual inspection, made exactly 29 calls with zero retries, and cost $0. Deterministic vectorization accepted 18/20 clean masks and rejected every unsafe result. The hash-pinned B2 review, pure C1 profile derivation, exact shared-polygon 2.5D/3D renderer, immutable generated revisions, one-time SPJ-04 v1-to-v2 library migration, mixed-family course placement, quantities, footprints, and generated/inferred review provenance are implemented and production-browser verified. The separately approved user-created extension now adds PNG/JPEG or accepted-concept source selection, a consent-gated local-only remove.bg adapter, browser-side vectorization, mandatory mask-versus-polygon acceptance, retain/retry decisions, immutable save, and course handoff. Deterministic browser QA is complete; one real user-owned image remains pending because no new live remove.bg call was made during implementation. No supplier, safety, production, price, ordering, account, server-persistence, or sharing claim was added.

## Decision summary

The approved product direction is a controlled concept-to-obstacle workflow:

- Logo upload is a constrained customization workflow for the known SPJ-04 prototype.
- Concept generation is a separate workflow and record type.
- Generated concepts do not receive configuration hashes, footprints, quantities, or revision identities.
- An accepted concept may be built as a controlled `Profile Wing Vertical` prototype.
- The structural family is predefined; the pictured subject is open-ended.
- Dogs, butterflies, castles, horses, leaves, waves, and similar profile subjects may become constrained silhouettes.
- Model output never directly controls supports, feet, tracks, cups, poles, footprint, quantities, or production truth.
- Arbitrary generated 3D meshes remain concept-only and are not accepted into the deterministic product system.
- Real concept generation uses a stateless external model route, but the first implementation is local/developer-only.
- Photo mode is `Match this subject`: preserve the subject outline, recognizable markings, and palette, then translate them into obstacle graphics.
- Animals, objects, buildings, and user-owned artwork are allowed initially; identifiable people are not.

## Product promise

Use this language:

> Generate visual jump concepts, then build an accepted concept as a controlled, non-sellable prototype obstacle.

Keep these distinctions explicit:

- **Customize this known jump:** changes artwork and controlled options on SPJ-04.
- **Generate a concept:** produces imaginative, unvalidated images.
- **Build this concept:** translates an accepted concept into the controlled `Profile Wing Vertical` family.
- **Generate a manufacturable jump:** not offered. That requires supplier-confirmed materials, connections, dimensions, structural review, print specifications, and production approval.

“Predefined” means the structural family, not the subject. The generated silhouette remains open-ended inside a constrained prototype envelope.

## Current repository contracts

The current system already proves:

- deterministic SPJ-04 configuration and SHA-256 configuration hashes;
- renderer-neutral manifests;
- matching 2.5D and Three.js views for existing controlled options;
- immutable saved revision snapshots;
- course placements pinned to exact revision IDs;
- deterministic quantities, geometry warnings, course-review hashes, and explicit revision-update previews;
- browser-local persistence with defensive parsing;
- visible non-sellable, non-production, and non-supplier-approved boundaries.

Important current seams:

- `src/domain/product/types.ts` represents artwork only as `fixed_panel_artwork`.
- `src/domain/render/manifest.ts` hard-codes `/prototype-assets/panel-artwork.png`.
- `src/components/studio/ObstacleTwoD.tsx` reads the manifest artwork URL.
- `src/components/studio/ThreeScene.tsx` does not dynamically replace left/right artwork textures.
- The GLB already contains named `left_fixed_artwork_*` and `right_fixed_artwork_*` meshes that can receive dynamic textures.
- `src/domain/design/local-revisions.ts` re-derives stored configuration and rejects hash tampering.
- `src/domain/course/types.ts` and the current local workspace hard-code `local-spj-04`.
- Product geometry, artwork area, bleed, safe-area, fastener clearance, accepted production formats, materials, and fabrication rules remain supplier-unconfirmed.

## Decision matrix

| Approach                                       |        Demo impact |    Effort |                   Visual quality |                                   2.5D/3D parity |   Latency/cost | Persistence and repeatability                          | Course/BOM compatibility                                              | Fabrication risk                            |
| ---------------------------------------------- | -----------------: | --------: | -------------------------------: | -----------------------------------------------: | -------------: | ------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------- |
| A. Concept image only                          |               High |       Low |                  Highest freedom |                                             None |         Medium | Store accepted pixels; model replay unnecessary        | None                                                                  | Low if clearly labelled concept-only        |
| B. AI artwork on SPJ-04                        |             Medium |    Medium | Strong graphics, fixed rectangle |                                        Excellent |         Medium | Strong once rendered asset is hashed                   | Existing footprint and bill of materials remain valid                 | Low to medium                               |
| C. AI selects validated families/configuration |               High |    Medium |               Limited by library |                                        Excellent |            Low | Structured and deterministic after validation          | Excellent for defined families                                        | Lowest                                      |
| D. Constrained generated silhouette            |            Highest |      High |        Open-ended profile shapes | Excellent when one polygon drives both renderers | Medium to high | Strong once mask/vector is accepted and hashed         | Controlled family provides footprint and generic prototype quantities | Medium; shape is not structurally validated |
| E. Arbitrary generated 3D mesh                 | High when it works | Very high |                    Unpredictable |                                             Poor |        Highest | Mesh can be stored, but integration remains unreliable | No trustworthy footprint or quantities                                | Unacceptable                                |

The chosen direction is a hybrid of C and D: a validated structural family containing an open-ended, AI-assisted profile silhouette.

## Core data flow

```text
LOGO CUSTOMIZATION
==================

Original file bytes
    |
    +-- SHA-256 source hash
    +-- validate and sanitize
    `-- canonical rendered PNG
             |
             `-- SHA-256 render hash
                      |
             ArtworkPlacement left/right
                      |
             Validated configuration
                      |
             configuration hash
                      |
             immutable revision
                      |
             course placement pins revision ID


CONCEPT GENERATION
==================

GenerationRequest
    |
    +-- text prompt
    +-- structured constraints
    `-- optional metadata-stripped photo derivative
             |
             v
      external concept provider
             |
       GeneratedConcept[]
             |
       select and refine
             |
       extract subject mask
             |
      deterministic vectorization
             |
      strict silhouette validation
        +-- reject -> preserve as concept
        `-- accept
             |
      AcceptedDesignArtifact
             |
      Profile Wing Vertical draft
             |
      2.5D + deterministic 3D extrusion
             |
      immutable revision -> course
```

Model output never directly becomes configuration, footprint, quantities, or production truth.

## Data model

### ArtworkAsset

- `assetId`
- `sourceContentHash`
- `renderContentHash`
- original filename and detected media type
- source and rendered byte lengths
- pixel dimensions and alpha status
- processing version
- SVG sanitization and rasterization provenance
- `createdAt`
- `status: ready | missing | corrupt`

### ArtworkPlacement

- rendered asset hash
- `fit: contain | cover`
- integer scale, X/Y offset, and rotation values
- background: transparent or explicit color
- panel side: left or right
- prototype bleed/safe-area display state
- no floating-point transforms in hashed configuration

### ArtworkConfiguration

- `mapping: linked | independent`
- explicit left and right placements
- relinking copies the left placement only after confirmation

### GenerationRequest

- prompt and structured constraints
- optional photo derivative hash
- `photoMode: match_subject`
- rights and external-processing consent timestamps
- parent concept ID when refining
- status and cancellation state

### GenerationResult

- provider request metadata
- model/provider/version
- seed when supplied, otherwise `null`
- revised prompt when supplied
- ordered concept IDs
- partial, failed, cancelled, or completed status

### GeneratedConcept

- immutable concept image hash
- prompt/request provenance
- parent concept ID
- generation ordinal
- `concept_only` status
- no configuration hash, footprint, or bill of materials

### WingSilhouette

- canonical JSON polygon, not executable SVG
- integer coordinates in a fixed normalized coordinate system
- vectorizer and validator versions
- source mask hash
- validation findings
- prototype envelope and reserved-region references

### AcceptedDesignArtifact

- accepted silhouette hash
- styling/artwork hashes
- source concept and photo provenance
- acceptance timestamp
- `generated_prototype` evidence status
- no requirement to replay the model

### ObstacleFamily

- `profile-wing-vertical-v1`
- fixed poles, cups, tracks, feet, flags, anchor, and maximum envelope
- fixed prototype component rules
- permitted silhouette regions
- inferred, non-supplier-approved status

## Hash and persistence rules

- Hash original upload bytes before processing.
- Hash the accepted rendered artifact separately.
- Include rendered hashes and placements in the validated configuration.
- Immutable revisions pin the complete configuration hash and artifact references.
- Course instances continue to pin only immutable revision IDs.
- Course-review identity continues to derive from revision IDs and configuration hashes.
- Device-local asset availability must not alter the logical course-review hash.
- Missing blobs produce a visible local-availability warning and never fall back to the newest working asset.
- Generated results do not need to be reproducible by calling the model again.
- Store the accepted mask, polygon, texture, and provenance so accepted revisions remain deterministic.
- localStorage retains small workspace/course metadata only.
- IndexedDB stores content-addressed blobs and artifact records.
- Object URLs are temporary rendering adapters and never persisted.
- A future object-storage backend may use the same content hashes without changing revision semantics.

## Phase 1F: artwork foundation and logo customization

### Outcome

Deliver a complete browser-local logo customization workflow for SPJ-04 with exact asset hashing, constrained placement, dynamic 2.5D/3D parity, immutable revisions, reload persistence, and unchanged older course placements.

### User journey

1. Open `Customize SPJ-04`.
2. Choose or drag PNG, JPEG, or SVG.
3. Validate extension, detected content, file size, decoded dimensions, and complexity.
4. Sanitize SVG, remove active/external content, and rasterize it.
5. Show the artwork editor with:
   - contain/cover;
   - scale and X/Y position;
   - alignment shortcuts;
   - rotation;
   - transparent, white, navy, or custom background;
   - prototype bleed and safe-area overlays;
   - explicit notice that fastener positions and supplier print requirements are unknown.
6. Apply edits to both wings by default.
7. Optionally choose `Edit wings separately`.
8. Show live 2.5D and 3D previews from the same placement records.
9. `Cancel` restores the prior draft without writing.
10. `Confirm artwork` stores blobs first, verifies their hashes, then updates draft metadata.
11. `Save immutable revision` refuses to proceed unless every referenced artifact is available and hash-verified.
12. Reload resolves the same content-addressed artifacts.
13. Replacing or removing draft artwork never changes or deletes assets referenced by older revisions.
14. Course placements continue pinning exact revision IDs.

### Format policy

- PNG: preserve transparency.
- JPEG: require an explicit panel background.
- SVG: sanitize, reject scripts, event handlers, external references, remote fonts, `foreignObject`, and excessive complexity; then rasterize.
- PDF: clearly unsupported in this prototype.

Prototype technical limits:

- PNG/JPEG: 10 MiB source maximum.
- SVG: 2 MiB source maximum.
- Raster decode: 40 megapixels maximum.
- Canonical panel texture: maximum 2,048 px on the longest edge, matching the existing prototype budget.
- Low-resolution warning: based on preview-texture coverage only, explicitly not a supplier print threshold.

### Storage behavior

- IndexedDB object store `blobs`, keyed by SHA-256 content hash.
- IndexedDB object store `artifactRecords`, keyed by artifact ID.
- localStorage retains configuration and revision metadata containing hashes only.
- Confirm writes blobs first, verifies them, then updates draft metadata.
- If metadata persistence fails, the unreferenced blob remains harmless and may be cleaned later.
- Replacing an asset may create an unreferenced blob; cleanup removes only blobs proven unreferenced by drafts, revisions, concepts, or accepted artifacts.
- Never silently evict revision-referenced blobs.
- Check `navigator.storage.estimate()` before large writes.
- Soft application limit: 100 MiB, with a user-visible cleanup prompt rather than automatic deletion.
- Object URLs are created only while rendering and revoked during replacement/unmount.

### Exact files

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

Modify:

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
- existing derivation, revision, studio, course, and review tests as required
- `TODOS.md` after implementation verification

The Three.js adapter should replace textures on the named `left_fixed_artwork_*` and `right_fixed_artwork_*` GLB meshes rather than rebuilding the SPJ-04 model.

## Phase 1G: concept generation

### Outcome

Deliver a separate local/developer-only concept studio with real external generation, text and optional photo input, immutable concept batches, refinement history, cancellation, typed failures, provenance, and browser-local persistence. Concepts remain concept records.

### Route boundary

- UI: `/studio/concepts/new`
- API: `/api/generation/concepts`
- Local-only gate: route disabled unless an explicit environment flag and provider credential are present.
- No public deployed endpoint.
- `Cache-Control: no-store`.
- No prompt or photo body logging.
- One active generation per browser session.
- No automatic retry that could duplicate paid work.

Use a single provider adapter initially:

- concept generation through the current GPT Image API;
- refinement through stateless image editing using selected concept bytes plus a refinement prompt;
- provider/model/version metadata stored with every result;
- provider organization verification is a setup gate.

### Interaction

1. Enter a prompt.
2. Optionally add a `Match this subject` photograph.
3. Confirm rights and disclosure that a derivative leaves the device.
4. Set structured controls:
   - family: Profile Wing Vertical;
   - silhouette subject;
   - four poles, locked for this prototype;
   - colors;
   - lower-element preference;
   - sponsor area;
   - style.
5. Submit.
6. Show real status only: preparing reference, sending, generating, storing results. Do not fake a percentage.
7. Receive four concepts.
8. `Regenerate` creates another immutable sibling batch.
9. `Refine` creates a child request from the chosen concept.
10. Earlier concepts remain visible.
11. Cancellation aborts the browser request and discards late output. Copy warns that provider work may already have incurred cost.
12. Selecting a concept enables `Build this concept`; it does not mutate the concept or create a revision.

### Photo handling

- Animals, objects, buildings, and user-owned artwork only.
- No identifiable people in this phase.
- Logos route to exact artwork upload.
- Original remains local.
- Browser applies orientation, resizes to a maximum 2,048 px edge, re-encodes, strips metadata, and hashes the derivative.
- The UI names the provider before submission.
- Our server retains nothing; the provider’s current retention policy must be reviewed and linked before implementation approval.
- If the photo is ambiguous or contains multiple prominent subjects, ask for a crop or clearer image.

### Exact files

Add:

- `src/domain/generation/types.ts`
- `src/domain/generation/history.ts`
- `src/domain/generation/index.ts`
- `src/server/generation/concept-provider.ts`
- `src/server/generation/openai-concept-provider.ts`
- `src/server/generation/request-policy.ts`
- `src/app/api/generation/concepts/route.ts`
- `src/app/studio/concepts/new/page.tsx`
- `src/components/concepts/ConceptStudioClient.tsx`
- `src/components/concepts/PhotoInput.tsx`
- `src/components/concepts/ConceptGallery.tsx`
- `src/components/concepts/useLocalConceptWorkspace.ts`
- `tests/domain/generation.test.ts`
- `tests/server/concept-route.test.ts`
- `tests/components/concept-studio.test.tsx`
- `tests/evals/concept-generation.cases.ts`
- `tools/evaluate-concept-generation.ts`
- `docs/phase-1g/IMPLEMENTATION.md`

Modify:

- `package.json`
- `src/app/page.tsx`
- `src/app/globals.css`
- shared IndexedDB artifact store from Phase 1F

## Phase 1H: controlled silhouette conversion

### Outcome

Convert an accepted concept into a validated, deterministic `Profile Wing Vertical` prototype using a dedicated subject mask, browser-side vectorization and validation, matching 2.5D/3D rendering, immutable revisions, generic prototype quantities, a controlled footprint, and course placement.

### Provider gate before implementation

Do not use an image-generation editing mask as geometry. Benchmark a dedicated subject-segmentation provider first.

**Phase 1H-A status (2026-07-22):** complete. The repository contains exactly 20 clean generated fixtures plus 3 empty, 3 multi-subject, and 3 badly occluded cases, an objective evaluator, and zero-retry provider adapters. The Photoroom free sandbox produced watermarked masks and failed. The separately authorized remove.bg free-preview run then made exactly 29 calls with zero retries and $0 cost, accepted 20/20 clean masks, rejected all 9 unsafe cases, and passed mandatory inspection of every returned mask. remove.bg is suitable only as raster input to a separately approved Phase 1H-B deterministic-vectorization experiment. No conversion-flow or product work below has started.

**Phase 1H-B1 status (2026-07-22):** complete. A local-only TypeScript kernel now thresholds and cleans approved masks, enforces exactly one significant subject and no holes, traces and simplifies one contour, emits canonical integer normalized coordinates with stable SHA-256 identity, and validates vertex count, area, feature core, envelope, reserved region, self-intersection, and winding. It accepted 18/20 clean masks, rejected bicycle and teapot for holes, rejected all 9 unsafe fixtures, reproduced all 29 results exactly, and passed full-board visual inspection. It made zero provider calls and adds no review UI, persistence, product geometry, renderer, revision, migration, or course integration. Phase 1H-B2 must be separately scoped as the explicit human-review boundary.

**Phase 1H-B2 status (2026-07-22):** complete. `/studio/silhouettes/review` presents the exact immutable B1 source mask, polygon or typed rejection, cleanup, versions, and hashes for all 29 fixtures. Eligible results can be explicitly accepted for future prototyping or retained without conversion; rejected results can only be retained. Decisions append hash-pinned browser-local events, restore after reload, reject tampering, and never mutate B1 evidence or existing SPJ-04, concept, or course state. Production-browser acceptance passed 15 checks at desktop, tablet, and mobile sizes with zero provider, POST, or external requests. Phase 1H-C1 must be separately scoped before deriving any profile-family product geometry.

**Phase 1H-C1 status (2026-07-22):** complete. The pure TypeScript derivation validates the complete B2 review and only its current accepted decision, proportionally fits the canonical B1 polygon into an inferred integer-mm profile region, creates two mirrored instances of one shared geometry, and adds four fixed poles plus explicit inferred tracks, feet, flags, footprint, and generic component counts. The 2.5D polygon and 3D extrusion source pin the exact same geometry SHA-256. Repository evidence uses a deterministic test decision and explicitly claims no user acceptance. C1 adds no UI, provider call, persistence, revision, migration, course integration, price, fabrication, supplier, or safety truth. Phase 1H-C2 must be separately scoped as the visible renderer-parity proof.

**Phase 1H-C2 and completion status (2026-07-23):** complete. `/studio/obstacles/profile-wing` requires a current accepted B2 decision, renders the exact same canonical geometry hash in SVG 2.5D and a fixed-thickness Three.js extrusion, retains the SVG silhouette when `?force3d=fail` or WebGL fails, and disposes generated Three.js geometry and materials. Saving appends an immutable generated-prototype revision to `course-design.local-design-library.v2`. A valid SPJ-04 v1 workspace is imported once with revision IDs and hashes unchanged, the legacy key is left untouched, and all new SPJ-04 and profile writes target v2. Course placement, geometry warnings, quantities, reviews, and update constraints consume either revision family; update-one and replace-all remain same-design only. Production-browser acceptance passed the renderer route plus the save/migrate/place/review flow at 1440 × 1000, 768 × 1024, and 375 × 812 with zero provider, POST, or external requests. Mandatory visual inspection passed the profile, mixed-family course, and review screenshots.

**User-created Profile Wing extension status (2026-07-23):** implementation complete. `/studio/obstacles/profile-wing/new` accepts a local PNG/JPEG or the currently accepted Concept Studio artifact, produces and stores a metadata-stripped derivative by SHA-256, and requires four explicit confirmations before one local-only server request may send the derivative to remove.bg. The key remains server-only. Host, origin, byte length, media magic, SHA-256, one-active-request, 60-second timeout, and zero-automatic-retry boundaries are enforced. The returned transparent PNG is stored by hash, its alpha enters the existing deterministic vectorizer, and the user must compare source, cutout, and canonical polygon before accepting or retaining without conversion. Acceptance reuses the exact C1/C2 renderer, immutable v2 library, course, and review contracts. Production-browser acceptance passed with one deterministic local POST, zero live remove.bg calls, zero external requests, and inspected desktop/tablet/mobile evidence. A real user-owned image and live provider result still require Tim's explicit action and visual sign-off.

Provider acceptance gate:

- At least 16 of 20 clean animal/object fixtures produce a usable mask after one attempt.
- All empty, multi-subject, and badly occluded fixtures fail visibly rather than inventing a silhouette.
- Retention/privacy terms approved.
- Latency and per-request cost accepted.
- Stateless API operation available for the local demo.

Meta Segment Anything Model 2 may be evaluated as a candidate, but self-hosting Python, PyTorch, model checkpoints, and GPU infrastructure is not silently added to this Next.js phase.

### Conversion flow

1. User selects a concept.
2. If `Match this subject` was used, extraction uses the sanitized source photograph; otherwise it uses the selected concept.
3. Provider returns a raster mask only.
4. Browser deterministically:
   - thresholds the mask;
   - removes tiny disconnected islands;
   - selects one connected subject;
   - traces the contour;
   - simplifies it;
   - converts it to integer normalized coordinates;
   - rejects self-intersections and invalid winding.
5. Validator checks:
   - one outer contour, no holes for v1;
   - maximum 256 vertices;
   - minimum area and feature thickness;
   - maximum family envelope;
   - no intersection with track, foot, cup, pole, or edge reserved regions.
6. User sees source, extracted silhouette, and validation findings side by side.
7. User may retry, crop the source, simplify, or retain the concept without conversion.
8. Acceptance stores the mask, canonical polygon, validation result, processing versions, and provenance.
9. The profile family deterministically generates:
   - two mirrored or independently oriented silhouette wing plates;
   - four poles;
   - fixed tracks, cups, feet, flags, and caps;
   - prototype footprint and generic quantities;
   - 2.5D polygon rendering;
   - fixed-thickness Three.js extrusion.
10. Saving creates an immutable generated-prototype revision.
11. The course can place it, but every review shows generated/inferred and non-supplier-approved status.

### Multi-design migration

Phase 1H introduces one local design library rather than a second parallel workspace:

- New storage key: `course-design.local-design-library.v2`.
- Import valid SPJ-04 v1 data once.
- Preserve revision IDs and existing SPJ-04 configuration hashes.
- Leave the legacy key untouched for rollback, but all new writes go to v2.
- Existing course placements require no repinning because they already reference revision IDs.
- Mixed-family course quantities derive from each pinned revision’s shared projections.
- Update-one/replace-all remains limited to revisions from the same design.

### Exact files

Add:

- `src/domain/silhouette/types.ts`
- `src/domain/silhouette/vectorize.ts`
- `src/domain/silhouette/validate.ts`
- `src/domain/silhouette/index.ts`
- `src/domain/product/profile-wing-definition.ts`
- `src/domain/design/local-library.ts`
- `src/domain/design/derive-profile-wing.ts`
- `src/server/generation/subject-mask-provider.ts`
- `src/app/api/generation/silhouettes/route.ts`
- `src/app/studio/obstacles/profile-wing/[designId]/page.tsx`
- `src/components/concepts/SilhouetteReview.tsx`
- `src/components/profile-wing/ProfileWingStudioClient.tsx`
- `src/components/profile-wing/ProfileWingTwoD.tsx`
- `src/components/profile-wing/ProfileWingThreeScene.tsx`
- `tests/domain/silhouette.test.ts`
- `tests/domain/local-library-migration.test.ts`
- `tests/domain/profile-wing.test.ts`
- `tests/server/silhouette-route.test.ts`
- `tests/components/silhouette-review.test.tsx`
- `tests/components/profile-wing-studio.test.tsx`
- `docs/phase-1h/IMPLEMENTATION.md`

Modify:

- shared product, render-manifest, revision, and course types
- course workspace, quantities, geometry, review, and update flows
- course studio symbols and saved-design rail
- existing SPJ-04 code only where required to conform to the shared revision interface
- existing course and revision tests

## Test coverage plan

```text
ARTWORK
+-- valid PNG/JPEG/SVG                         [UNIT + COMPONENT]
+-- corrupt bytes / spoofed MIME / oversize   [UNIT]
+-- malicious or external SVG content         [SECURITY UNIT]
+-- transparent and opaque backgrounds        [BROWSER]
+-- linked -> independent -> relink confirm    [COMPONENT]
+-- cancel without writes                     [COMPONENT]
+-- IndexedDB quota/write failure             [INTEGRATION]
+-- missing or tampered referenced blob       [INTEGRATION]
+-- same artifact in 2.5D and 3D              [BROWSER]
`-- revision/reload/course immutability        [BROWSER]

GENERATION
+-- text-only request                          [SERVER + COMPONENT]
+-- permitted photo with consent              [SERVER + COMPONENT]
+-- no consent / person / invalid photo        [UNIT + COMPONENT]
+-- moderation, timeout, rate-limit, failure   [SERVER]
+-- cancellation and late provider response   [SERVER + COMPONENT]
+-- partial result batch                       [SERVER + COMPONENT]
+-- regenerate/refine history                  [DOMAIN + COMPONENT]
+-- concept persistence and quota failure      [INTEGRATION]
`-- concept relevance and photo matching       [EVAL]

SILHOUETTE
+-- valid dog/butterfly/castle masks           [GOLDEN UNIT]
+-- empty/multiple/disconnected masks          [UNIT]
+-- self-intersection / too many vertices      [UNIT]
+-- thin feature / reserved-region collision   [UNIT]
+-- deterministic canonical polygon hash       [UNIT]
+-- 2.5D/3D same polygon                       [BROWSER]
+-- accepted artifact reload                   [INTEGRATION]
+-- legacy SPJ-04 library migration            [UNIT + INTEGRATION]
+-- mixed-family course quantities/footprints  [DOMAIN]
`-- unchanged older placements and hashes      [REGRESSION + BROWSER]
```

Critical regressions:

- Existing SPJ-04 hashes remain stable when built-in artwork is unchanged.
- Old saved revisions never start referencing the current draft logo.
- Existing course placements never repin during library migration.
- `?force3d=fail` preserves exact 2.5D artwork and silhouettes.
- Missing local blobs never resolve by filename or fall back to another asset.
- Three.js textures and generated geometry are disposed on replacement/unmount.

## Browser acceptance

Desktop: 1440 x 1000. Tablet: 768 x 1024. Mobile: 375 x 812.

Required:

- No horizontal overflow.
- Product remains dominant; editors become bottom sheets or stacked sections on mobile.
- File picker is always available as an alternative to drag-and-drop.
- All controls are keyboard-operable and at least 44 x 44 px.
- Position, scale, and rotation have numeric/stepper controls; dragging is never the only method.
- Visible 2 px focus indicators.
- Upload retains a visible filename and status.
- Progress uses live regions without announcing every animation frame.
- Concept gallery uses one selected-state control per concept.
- Cancellation returns focus to the invoking control.
- Reduced motion uses direct replacement/crossfade.
- WebGL failure preserves the exact 2.5D configuration.
- Browser warning/error console is empty after success and every tested failure.
- Reload restores artifacts, concepts, revisions, placements, and the same logical hashes.
- Private/incognito storage denial produces a recoverable tab-only mode or blocks immutable save honestly.

## End-to-end demonstration

1. Upload a transparent SVG logo to SPJ-04.
2. Sanitize and preview it.
3. Position it with contain mode and prototype safe-area guides.
4. Keep wings linked, then demonstrate independent right-wing placement.
5. Confirm and see matching 2.5D and 3D textures.
6. Save Revision 02.
7. Reload and reopen Revision 02.
8. Place it in the course while an older Revision 01 placement remains unchanged.
9. Open the review and show distinct revision/configuration hashes.
10. Open `Create a jump concept`.
11. Enter: “Create a butterfly-shaped jump with navy wings, gold details, and four blue-and-white poles.”
12. Optionally add an owned butterfly reference photo with `Match this subject`.
13. Generate four concepts.
14. Refine one with “larger gold edge details”; keep the earlier batch.
15. Choose one and select `Build this concept`.
16. Extract and review the butterfly silhouette.
17. Resolve or acknowledge any thin-antenna validation warning.
18. Accept the controlled silhouette.
19. See the same polygon in 2.5D and deterministic 3D extrusion.
20. Save the generated-prototype revision and place it in the course.
21. Show fixed prototype quantities, footprint, generated provenance, and explicit production limitations.

## Explicitly not in scope

- PDF import.
- Identifiable people or likeness generation.
- Accounts, sharing, cross-device sync, or cloud libraries.
- Public paid-generation endpoint.
- Automatic background removal in the logo workflow.
- Arbitrary generated 3D meshes.
- Generated supports, feet, tracks, cups, poles, or attachment geometry.
- Supplier approval or production release.
- Structural, safety, federation, regulatory, or fabrication claims.
- Retail pricing, tax, freight, checkout, payment, or ordering.
- Automatic mutation of saved revisions.
- Silent course repinning.
- Deriving production material quantities from generated silhouettes.
- Deleting blobs referenced by immutable revisions.
- Claiming that matching a photograph proves exact geometry or intellectual-property rights.

## Approved sequencing

1. Phase 1F strengthens the deterministic core with real artwork assets and renderer parity.
2. Phase 1G proves creative generation without contaminating product truth.
3. Phase 1H crosses into configuration only through an explicit mask, vectorization, validation, and acceptance boundary.

Do not combine these into one implementation phase.
