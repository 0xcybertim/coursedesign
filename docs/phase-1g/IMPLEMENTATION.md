# Phase 1G concept-generation implementation

## Status

Phase 1G mechanics and simulator usability are implemented and verified on the exact production build as of 2026-07-16. The deterministic route is now explicitly a **Workflow simulator**: it assembles one readable creative brief from authoritative structured controls plus optional creative direction, blocks obvious supported-subject contradictions, and creates zero-cost labelled fixtures that visibly respond to subject, known colors, style, lower element, sponsor area, and refinement direction. Dog, butterfly, castle, generic fallback, photo preprocessing, immutable history, cancellation, reload, selection, and Phase 1F isolation are covered.

A bounded earlier OpenAI pass proved real four-image generation on the pinned `gpt-image-2-2026-04-21` snapshot; its original refinement/edit request returned HTTP 429. On 2026-07-21, Tim separately authorized exactly one paid edit-only follow-up. The request used a local deterministic dog fixture, made zero generation calls, used `maxRetries: 0`, and returned four 1,024 px JPEG refinements. Dog silhouettes became substantially larger, ears became clearer, and the navy/rust/cream palette, gate, and sponsor areas survived. All four outputs nevertheless rendered three horizontal poles instead of the authoritative four, so technical edit delivery is verified but the broader structural-fidelity/creative-quality gate is not passed. Tim subsequently said “Perfect.”; this approves the images as creative-only source material, not their three-pole obstacle structure.

Phase 1H-A later completed behind separate approval gates: Photoroom sandbox failed because of visible watermarking, while remove.bg free preview passed the synthetic mask, negative-case, cost, latency, and mandatory visual gates. No Phase 1H conversion/product implementation has occurred. Selecting and accepting a concept records only the intended handoff boundary and never creates obstacle geometry, a configuration, an immutable product revision, course quantities, a quote, or supplier-approved evidence.

## Architecture

```text
/studio/concepts/new
  -> browser-only request and history state
  -> optional processed reference derivative in shared IndexedDB
  -> same-origin /api/generation/concepts
  -> local gate + request policy + one-active-session guard
  -> deterministic test provider OR server-only OpenAI adapter
  -> exactly four returned image byte arrays
  -> SHA-256 verification + shared content-addressed IndexedDB
  -> immutable localStorage metadata containing hashes and IDs only
```

The API is dynamic, uses `Cache-Control: no-store`, accepts only local host chains, checks same-origin POSTs against the incoming host, bounds the request to 12 MiB and each encoded raster to 8 MiB, and never logs prompt or image bodies. A deployment remains unavailable unless the developer flag, provider configuration, server credential, and localhost boundary all pass. Both the actual host and any forwarded-host chain must be local, preventing a public host from being bypassed with a spoofed forwarded header.

The schemas are versioned as `1.0.0-phase1g`. A local workspace contains:

- canonical, hash-pinned immutable `GenerationRequest` records;
- exactly-four-result immutable `ConceptBatch` records;
- `GeneratedConcept` records containing content hashes and `concept_only` status;
- append-only completed, failed, and cancelled outcomes;
- append-only selected and accepted-for-Phase-1H events;
- explicit parent batch and parent concept ancestry for sibling regeneration and child refinement;
- provider, configured model, adapter version, provider request ID, optional seed, and optional revised-prompt provenance.

Restoration replays and validates the graph, canonical hashes, dates, IDs, outcomes, ancestry, selection references, and schema version. Unsupported, malformed, orphaned, or hash-tampered metadata is rejected and replaced with a visibly fresh workspace instead of becoming trusted state.

## Coherent creative brief and conflict boundary

The structured controls are authoritative: family, silhouette subject, four locked poles, colors, lower-element preference, sponsor area, and style. The free-text field is labelled `Creative direction — optional` and is reserved for pose, expression, markings, mood, or composition. `generationBriefRows` and `assembleGenerationBrief` are shared by the visible summary and server prompt construction so the two representations cannot drift.

A deliberately bounded common-subject recognizer covers dog, butterfly, castle/building, horse, leaf, and wave terms plus a small set of obvious synonyms. When optional direction mentions one recognized subject while the structured subject names another, both fields are marked invalid, submission is disabled, and a keyboard-operable action can adopt the detected subject. The server repeats the check. The interface explicitly says this is not infallible natural-language understanding.

## Workflow simulator fixtures

The internal deterministic provenance remains `deterministic-test` for compatibility, while every user-facing surface calls it the Workflow simulator or deterministic fixture output. Fixtures are repeatable and make no external calls. Dog, butterfly, castle/building, horse, leaf, and wave use distinct bounded SVG silhouettes; unknown allowed subjects use a labelled generic fallback. Known color names map deterministically into visible fills. Style, lower element, sponsor area, variant ordinal, and refinement direction are drawn or printed inside each fixture. Four results remain distinct, but the UI states repeatedly that fixtures do not demonstrate AI image quality or creative fidelity.

In simulator photo mode, the same preprocessing, hashing, local storage, consent, request, history, and restoration mechanics are exercised, but the copy states that no OpenAI call occurs and genuine photo matching is not demonstrated.

## Provider and API choice

The production adapter uses the official JavaScript SDK with a server-only client. The configured default is the current pinned GPT Image 2 snapshot, `gpt-image-2-2026-04-21`, with `OPENAI_IMAGE_MODEL` available as a server-side override. Every batch stores the exact configured model string and adapter version `1.0.0-phase1g`.

The adapter follows the current official guidance: direct generation uses `openai.images.generate`; optional-photo generation and stateless refinement use `openai.images.edit` with exact local bytes; both request four low-quality JPEG results with `n: 4`. The Image API is the direct single-request generation/editing surface documented by OpenAI, and `gpt-image-2` is the current flagship GPT Image model. See the [official image-generation guide](https://developers.openai.com/api/docs/guides/image-generation) and [gpt-image-2 model page](https://developers.openai.com/api/docs/models/gpt-image-2).

The SDK client and every request use `maxRetries: 0`. The browser AbortSignal reaches the SDK request. No automatic retry can duplicate paid work.

## Environment setup

Do not place secrets in client-visible variables or browser storage. The OpenAI path requires these server process variables:

```text
PHASE_1G_ENABLED=true
PHASE_1G_PROVIDER=openai
OPENAI_API_KEY=<server-only credential>
OPENAI_IMAGE_MODEL=<optional configured model; defaults to gpt-image-2-2026-04-21>
```

The deterministic acceptance provider uses `PHASE_1G_PROVIDER=deterministic` and a presence-only `PHASE_1G_TEST_CREDENTIAL`. `PHASE_1G_TEST_SCENARIO=slow` is used only to exercise cancellation. Neither test setting enables a public route.

Before live acceptance, confirm that the OpenAI organization is permitted to use the selected image model. Never print the key; check presence only.

## Privacy and photo data flow

The optional `Match this subject` input accepts JPEG, PNG, or WebP up to 10 MiB. The browser decodes with EXIF orientation, constrains the longest edge to 2,048 px, composites to an opaque canvas, re-encodes as JPEG, strips source metadata, hashes the exact derivative bytes, and stores those bytes in the shared content-addressed IndexedDB database. The original file is not uploaded or persisted by this application. Only the processed derivative is read back, hash-verified, and sent with a submitted request.

Submission requires five explicit confirmations: usage rights, OpenAI processing disclosure, no identifiable person, no logo, and one clear allowed subject. The initial allowed classes are animals, objects, buildings, and user-owned artwork. Logos link to the exact SPJ-04 Phase 1F artwork workflow. These attestations are a truthful bounded policy measure, not a claim of infallible subject detection.

The application has no server persistence and intentionally logs no input body. Provider handling remains a separate boundary. OpenAI states that API data is not used for training by default unless an organization opts in; default abuse-monitoring logs may be retained for up to 30 days, eligible image endpoints can be used with Zero Data Retention, and suspected child-safety image inputs may have an exceptional manual-review retention path even with Zero Data Retention. Review the current [OpenAI data-controls documentation](https://developers.openai.com/api/docs/guides/your-data) and the organization's approved settings before live use.

## Immutability, storage, and cleanup

Phase 1G reuses the Phase 1F `course-design.artwork.v1` IndexedDB database without a schema migration. Reference derivatives and generated concepts are written through the generic SHA-256-verified blob path. The existing 100 MiB soft limit and typed quota/capacity failures remain unchanged.

`localStorage` contains small schema-validated metadata only. It never contains image bytes, base64, credentials, or blob URLs. Object URLs exist only while gallery components are mounted and are revoked on replacement and navigation.

Cleanup remains explicit and conservative. `cleanupUnreferencedWorkspaceArtifacts` constructs the proven reference set from every supplied Phase 1F draft and immutable revision, every Phase 1G request derivative and historical concept, plus any explicit additional references before deletion. Because all historical concept hashes are included, sibling batches, refinement parents, selected concepts, and accepted concepts remain protected; selected/accepted IDs do not create a second mutable byte record. Regression coverage proves a true orphan is removed while all cross-phase references survive.

Missing or corrupt generated bytes do not change logical history. The affected concept shows a typed visible failure and disables selection/refinement while the rest of the immutable history remains available.

## Cancellation, retries, and failures

Only one request may be active for a hashed browser-session ID. Cancellation aborts the browser request, propagates an abort signal, records a cancelled outcome, warns that provider cost may already have been incurred, and discards any late provider result before blob or batch publication.

Failures are typed and visible: `disabled_route`, `invalid_request`, `policy_failure`, `active_request`, `provider_rejection`, `rate_limit`, `timeout`, `cancellation`, `malformed_response`, `storage_failure`, `missing_artifact`, `tampered_history`, `unsupported_history`, and `unknown_provider_failure`. Photo preparation additionally reports stable `unsupported_photo`, `invalid_photo_size`, `photo_decode_failure`, and `photo_processing_failure` kinds. The OpenAI adapter rejects an incomplete batch or bytes that do not match the declared JPEG/PNG/WebP signature as `malformed_response`. There is no synthetic progress percentage and no hidden retry.

## Verification evidence

The final repository gate passes in the required order:

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test` — 164 tests across 16 files
5. `pnpm build`

`pnpm eval:concepts` also passes six offline contract cases and makes zero provider calls.

Production-browser acceptance uses the deterministic provider against `next start` and covers 24 checks: honest simulator copy, exact visible brief, accessible dog-versus-butterfly conflict resolution, visibly distinct dog/butterfly/castle flows, known colors, style/lower/sponsor representation, four distinct fixtures, immutable sibling regeneration and child refinement, privacy-preserving photo simulation, cancellation and late discard, five-batch reload restoration, exact selection/acceptance, missing bytes, SPJ-04 storage isolation, the Phase 1F route, keyboard focus, polite announcements, 44 px targets, no horizontal overflow at 375 × 812 / 768 × 1,024 / 1,440 × 1,000, object-URL cleanup, zero unexpected failed requests, zero console warnings/errors, and zero live OpenAI calls.

- Machine-readable result: [browser-acceptance.json](./browser-acceptance.json)
- Bounded live-provider result: [live-provider-acceptance.json](./live-provider-acceptance.json)
- Edit-only live follow-up: [live-refinement-followup.json](./live-refinement-followup.json)
- Requirement audit: [COMPLETION_AUDIT.md](./COMPLETION_AUDIT.md)
- Desktop: [desktop-concept-history.png](./screenshots/desktop-concept-history.png)
- Desktop simulator: [desktop-workflow-simulator.png](./screenshots/desktop-workflow-simulator.png)
- Desktop dog fixtures: [desktop-dog-fixtures.png](./screenshots/desktop-dog-fixtures.png)
- Tablet: [tablet-concept-studio.png](./screenshots/tablet-concept-studio.png)
- Mobile: [mobile-concept-studio.png](./screenshots/mobile-concept-studio.png)

The original bounded live-provider harness made one generation request and one refinement request with `maxRetries: 0`. Generation returned HTTP 200 with four JPEG images; refinement returned HTTP 429 and was not retried. The separately authorized edit-only follow-up then made zero generation calls and one edit request with `maxRetries: 0`; it returned HTTP 200 with four unique JPEGs. `live-refinement-followup.json` records the technical success and the failed four-pole visual constraint separately. Evidence files exclude prompts, revised prompts, image bytes, base64, filenames, and credentials. No further paid call is authorized.

## Exact limitations and Phase 1H boundary

This is a developer-only, same-browser concept studio. Its workflow simulator proves mechanics and input coherence, not real creative quality. It does not provide public deployment, accounts, cloud persistence, cross-device sync, sharing, production-ready artwork, identifiable-person support, logo generation, obstacle geometry, silhouette extraction/vectorization, configuration hashes, immutable obstacle revisions from concepts, course quantities, supplier approval, fabrication/safety claims, pricing, checkout, payment, or ordering.

The next possible milestone is the separately gated Phase 1H subject-mask benchmark and controlled silhouette conversion described in the expansion plan. Do not begin it automatically. It requires accepted retention/privacy terms, cost and latency approval, and the stated 16-of-20 clean-fixture mask threshold with visible failure on empty, ambiguous, or badly occluded inputs.
