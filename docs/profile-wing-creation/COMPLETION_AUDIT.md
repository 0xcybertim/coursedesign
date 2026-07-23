# User-created Profile Wing completion audit

Date: 2026-07-23  
Result: implementation and deterministic browser acceptance passed

## Requested capability

| Requirement                                          | Result |
| ---------------------------------------------------- | ------ |
| `Create Profile Wing` entry point                    | Passed |
| Upload PNG/JPEG                                      | Passed |
| Select an accepted generated concept                 | Passed |
| Send only after explicit remove.bg action            | Passed |
| Vectorize and validate returned mask                 | Passed |
| Show source, cutout/mask, and polygon                | Passed |
| Accept, explicit retry, or retain without conversion | Passed |
| Generate matching 2.5D and 3D Profile Wing           | Passed |
| Save immutable design-library revision               | Passed |
| Place exact revision in a course                     | Passed |

## Automated gates

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`: 29 test files, 227 tests passed
- `pnpm build`

New test coverage includes:

- immutable creation candidate/decision hash chains and tamper rejection;
- accepted-only product derivation and revision save;
- upload/concept source normalization, media validation, resize, hashing, storage, and alpha extraction;
- no provider POST before all confirmations;
- full accept/build/render/save component flow;
- local/config/key availability;
- same-origin, consent, media, hash, and request limits;
- official remove.bg multipart fields;
- server-only credential behavior; and
- zero automatic retry behavior.

## Production-browser acceptance

`pnpm acceptance:profile-wing-creation` passed against an optimized production build configured with the deterministic local provider.

The run proved:

- opening the creator makes no provider request;
- choosing a PNG creates and stores only a local derivative;
- one explicit click creates exactly one local mask POST;
- returned alpha is deterministically vectorized before product geometry exists;
- visual acceptance unlocks exact shared 2.5D/3D geometry;
- one immutable v2 revision is saved;
- the exact revision places in the existing course;
- generated/inferred provenance remains visible in Course Review;
- 1,440 px, 768 px, and 375 px layouts have no horizontal overflow or undersized standalone controls; and
- browser console, failed-request, and external-request logs are empty.

Execution boundary:

| Measure                        | Result |
| ------------------------------ | -----: |
| Deterministic local mask POSTs |      1 |
| Automatic retries              |      0 |
| Live remove.bg calls           |      0 |
| External browser requests      |      0 |
| Console warnings/errors        |      0 |
| Unexpected failed requests     |      0 |

Machine-readable evidence: `docs/profile-wing-creation/browser-acceptance.json`.

## Visual inspection

Codex inspected:

- `screenshots/user-mask-review-desktop.png`
- `screenshots/user-profile-result-desktop.png`
- `screenshots/user-profile-course-desktop.png`
- `screenshots/user-profile-review-desktop.png`
- `screenshots/user-profile-creator-1440x1000.png`
- `screenshots/user-profile-creator-768x1024.png`
- `screenshots/user-profile-creator-375x812.png`

The source/cutout/polygon relationship is legible, the accepted profile remains inside the inferred family envelope, the exact revision is visible in the course, and the mobile flow remains usable without horizontal clipping.

## Remaining real-world sign-off

No new live remove.bg request was made while implementing this milestone. Final provider/image sign-off therefore remains:

1. re-issue the key that was pasted into chat;
2. store the replacement only in ignored `.env.local`;
3. restart the local server;
4. upload one representative user-owned, single-subject image;
5. inspect the returned cutout and polygon manually; and
6. accept only if the visible silhouette is trustworthy.

This is not a code-completion gap. It is the deliberate human/provider seam for a real image and potentially billable external request.

## Boundary retained

The result remains a same-browser, non-sellable generated prototype. It adds no account, cloud, sharing, supplier, production, structural, safety, price, checkout, payment, or ordering authority.
