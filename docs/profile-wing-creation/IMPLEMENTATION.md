# User-created Profile Wing implementation

Date: 2026-07-23  
Route: `/studio/obstacles/profile-wing/new`  
Status: complete for the browser-local, non-sellable prototype

## Outcome

The studio can now create a new `Profile Wing Vertical` from either:

- a user-selected PNG or JPEG; or
- the currently accepted Concept Studio artifact.

The browser creates a metadata-stripped derivative up to 2,048 px, hashes it with SHA-256, and stores it in the existing content-addressed IndexedDB asset store. Selecting a file does not contact remove.bg.

After four explicit confirmations, one user action may send only that derivative through the local server route to remove.bg. The returned transparent PNG is stored by SHA-256. Its alpha channel is passed through the existing deterministic Phase 1H vectorizer and validator. The user then sees source, returned cutout, and canonical polygon together before deciding what the result permits.

## User flow

1. Open `/studio/obstacles/profile-wing/new`.
2. Choose a PNG/JPEG or use an accepted concept.
3. Confirm:
   - image rights;
   - remove.bg processing disclosure;
   - no identifiable person; and
   - one clear subject.
4. Press the processing button. This is the only step that may create one provider request.
5. Inspect the source, returned cutout, polygon, validation findings, hashes, and request/retry count.
6. Choose one:
   - `Accept & build Profile Wing`;
   - `Retain without conversion`; or
   - explicitly run the provider again.
7. An accepted result creates exact shared 2.5D and 3D geometry.
8. Save an immutable generated-prototype revision.
9. Open the course studio, place the revision, and inspect it in the Course Review Sheet.

## Provider and security boundary

`POST /api/profile-wings/mask` is deliberately local-only and disabled by default.

The route enforces:

- localhost host restriction;
- same-origin requests;
- 10 MiB source and bounded multipart request limits;
- PNG/JPEG byte-signature validation;
- exact source SHA-256 agreement;
- all four confirmations;
- one active request per browser session;
- a 60-second provider timeout;
- zero automatic retries;
- a server-only credential; and
- no-store responses.

The remove.bg adapter sends one multipart `image_file` request to `https://api.remove.bg/v1.0/removebg` with preview PNG output. Provider failure, rejection, rate limit, timeout, cancellation, and malformed response remain typed and visible. Retrying always requires another explicit user action.

## Local setup

The API key previously pasted into chat should be re-issued before use. Do not put a real key in source control.

```bash
cp .env.local.example .env.local
```

Edit ignored `.env.local`:

```dotenv
PROFILE_WING_CREATION_ENABLED=true
PROFILE_WING_MASK_PROVIDER=remove-bg
REMOVE_BG_API_KEY=your-rotated-key
```

Then restart the application so the server reads the environment:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000/studio/obstacles/profile-wing/new
```

For deterministic zero-external-call QA:

```bash
PROFILE_WING_CREATION_ENABLED=true \
PROFILE_WING_MASK_PROVIDER=deterministic \
PROFILE_WING_TEST_CREDENTIAL=local-qa \
pnpm dev
```

The deterministic provider exists only for repository acceptance. It converts the saved Phase 1H grayscale mask into a transparent cutout so the browser exercises the same alpha-channel contract as the real provider.

## Persistence and identity

- Source derivatives and cutouts are content-addressed blobs in IndexedDB.
- Creation candidates and decisions form an immutable SHA-256 event chain.
- Acceptance pins source, mask, polygon, processing versions, and decision identity.
- Product derivation reuses the existing inferred `profile-wing-vertical-v1` family.
- Both renderers consume the same canonical geometry SHA-256.
- Saving appends a complete immutable revision to `course-design.local-design-library.v2`.
- Course placements pin exact revision IDs.
- Course review continues to show generated, inferred, and not supplier-confirmed provenance.

## Main implementation files

- `src/app/studio/obstacles/profile-wing/new/page.tsx`
- `src/components/profile-wing/ProfileWingCreatorClient.tsx`
- `src/components/profile-wing/profile-wing-source.ts`
- `src/components/profile-wing/useLocalProfileWingCreation.ts`
- `src/app/api/profile-wings/mask/route.ts`
- `src/server/profile-wing/mask-provider.ts`
- `src/server/profile-wing/request-policy.ts`
- `src/domain/profile-wing-creation/`
- `src/domain/design/derive-profile-wing.ts`
- `src/domain/design/local-library.ts`

## Honest boundary

This workflow creates inferred browser-local prototype geometry. It does not establish material, thickness, support, fabrication, structural, wind, horse-safety, federation, supplier, price, tax, delivery, or ordering truth. Identifiable people are not accepted in this workflow. A real user-owned image still requires manual visual acceptance; deterministic metrics alone cannot approve a provider result.
