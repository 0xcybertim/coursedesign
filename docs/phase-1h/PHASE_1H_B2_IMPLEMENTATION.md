# Phase 1H-B2 silhouette review and decision boundary

Date: 2026-07-22  
Status: complete for the bounded browser-local review surface  
External calls: 0

## Outcome

Phase 1H-B2 adds `/studio/silhouettes/review`, a human review surface over the exact immutable Phase 1H-B1 evidence. It shows all 29 repository fixtures, the approved source mask, canonical polygon or typed rejection, cleanup evidence, processing versions, and full hash provenance.

The surface makes the B1 result inspectable without pretending it is an obstacle:

- 18 valid polygons may be marked `accepted_for_future_prototyping` or `retained_without_conversion`;
- 11 rejected results can only be retained without conversion;
- a rejected result never exposes partial polygon geometry;
- the current choice is derived from immutable append-only decision events;
- changing a choice appends a new hash-pinned event instead of overwriting history;
- browser reload restores the exact decision history;
- malformed, unsupported, evidence-mismatched, or hash-tampered metadata is rejected visibly and replaced with a fresh empty review.

## Evidence identity

The review domain imports the machine-readable B1 benchmark and derives one SHA-256 identity over:

- B2 schema version;
- B1 benchmark, vectorizer, and validator versions;
- the zero-call execution boundary;
- all 29 fixture IDs and their individual result identities.

Each result identity pins fixture ID, source-mask SHA-256, accepted/rejected status, polygon SHA-256 when present, and typed finding codes. Each decision event pins the global evidence hash, result identity, source mask hash, action, ID, and timestamp before receiving its own SHA-256.

The browser-local key is `course-design.local-silhouette-review.v1`. It stores decision metadata only. It contains no image bytes, polygon copy, product configuration, obstacle revision, course placement, bill of materials, quote, or supplier data.

## Review experience

The route provides:

- all, convertible, must-retain, and decided filters;
- a responsive fixture rail with current decision state;
- source-mask and canonical-polygon comparison;
- typed findings and explicit no-partial-geometry state;
- source, result, vectorizer, and validator provenance;
- cleanup counts;
- eligible and ineligible decision controls;
- per-fixture immutable decision history;
- persistent boundary copy stating that this is non-authoritative evidence.

The allowlisted `/phase-1h/masks/[fixtureId]` route serves only the 29 known repository-generated masks, uses `Cache-Control: no-store`, returns the approved SHA-256 header, rejects unknown fixture IDs, and reads only from the two exact Phase 1H fixture directories.

## Production-browser acceptance

The exact production build passed 15 browser checks at 1,440 × 1,000, 768 × 1,024, and 375 × 812 px:

- all 29 fixtures and the 18/11 split are visible;
- mask bytes and response hashes match B1 evidence;
- eligible acceptance and retain decisions work;
- hole-bearing bicycle evidence cannot be accepted;
- changed decisions append immutable history;
- three test decisions contain hashes and no product fields;
- SPJ-04, concept, and course local-storage keys remain unchanged;
- reload restores decisions;
- tampered evidence fails visibly and resets safely;
- no horizontal overflow or interactive target below 44 px;
- visible keyboard focus and polite status announcements;
- zero POST requests, external requests, console warnings/errors, or failed requests.

Codex inspected the five desktop, rejected-state, tablet, and mobile captures. Mask/vector hierarchy, rejection state, controls, provenance, boundary copy, and responsive header are visually intact. User visual sign-off remains separate.

## Explicit boundary

B2 does not call remove.bg, Photoroom, OpenAI, or any other provider. It does not upload a selected concept, create a new mask or polygon, edit contours, create `Profile Wing Vertical`, derive supports or product geometry, render an obstacle, save a product revision, migrate storage, place anything in a course, calculate production quantities, price, quote, order, or claim supplier, fabrication, or safety approval.

The next honest milestone is a separately scoped Phase 1H-C1 deterministic profile-family derivation for one explicitly accepted silhouette. It should define renderer-neutral prototype geometry, fixed non-supplier support assumptions, generic quantities, envelope, and failure behavior before any revision, persistence migration, or course integration.
