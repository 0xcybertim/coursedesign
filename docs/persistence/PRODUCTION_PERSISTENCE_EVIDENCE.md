# Course Design production persistence evidence

Verified on 25 July 2026 against the exact public application:
<https://coursedesign.onrender.com/>.

## Outcome

Course Design is running deployment-wide in `PERSISTENCE_MODE=server`. Core
designs, immutable revisions, canonical render derivatives, and courses persist
through the server. Experimental histories, raw sources, masks, and the existing
browser-local design library remain on the originating device. Server mode does
not fall back to browser persistence.

The email field is deliberately an unverified public workspace selector. The
live product displays this exact warning:

> Unverified email workspace. Anyone who enters this email can access and
> change this work.

## Production resources

| Resource                  | Production value                                              |
| ------------------------- | ------------------------------------------------------------- |
| Render web service        | `coursedesign` (`srv-d9hpci57vvec73et222g`)                   |
| Web plan                  | Paid Starter, Frankfurt, USD 7/month                          |
| Render PostgreSQL         | `coursedesign-db` (`dpg-d9ia06rrjlhs73ejtgbg-a`)              |
| Database plan             | Paid Basic-256mb, PostgreSQL 18, Frankfurt                    |
| Database storage          | 15 GB; USD 10.50/month total database cost shown by Render    |
| Application URL           | <https://coursedesign.onrender.com/>                          |
| Private bucket            | `gs://course-design-prod-artwork-20260725`                    |
| Bucket location/class     | `europe-west3` (Frankfurt), Standard                          |
| Google Cloud project      | `qianlu-website`, reused only as the project/billing boundary |
| Dedicated service account | `coursedesign-gcs@qianlu-website.iam.gserviceaccount.com`     |

The dedicated bucket has uniform bucket-level access and public-access
prevention enforced. Its service account has only object creator and object
viewer access on this bucket. The pre-existing
`qianlu-website.appspot.com` and `staging.qianlu-website.appspot.com` buckets
were not modified or reused. No Qianlu database or application resource was
used.

At verification time, the Course Design bucket contained three objects, all
under `workspaces/<workspace-id>/sha256/<sha256>`. Each is a Standard
`image/png` canonical render derivative with its digest, byte length,
dimensions, and `canonical-purpose=render-derivative` metadata. No raw-source,
mask, or processing-history path exists.

Current list pricing was checked against the official
[Render pricing](https://render.com/pricing),
[Render compute-plan documentation](https://render.com/docs/compute-plans),
[Cloud Storage pricing](https://cloud.google.com/storage/pricing), and
[Cloud Storage locations](https://docs.cloud.google.com/storage/docs/bucket-locations).
The fixed Render total is USD 17.50/month, plus metered private Google Cloud
Storage usage.

## Deployment sequence

The migration and first production deploy were deliberately additive while
`PERSISTENCE_MODE=browser` remained active:

1. `dep-d9ia6gl0kf9s73bdi520` — browser-mode pre-deploy.
2. Forward-only migrations `0001_core_persistence.sql`,
   `0002_revision_render_artwork.sql`, and
   `0003_runtime_migration_health.sql` were applied.
3. Runtime access switched to the restricted `coursedesign_app` login.
4. `dep-d9iaaejh2c0s738flbog` — controlled deployment-wide server cutover.
5. `dep-d9ib83eq1p3s73anhvr0` — live acceptance and mobile-selector correction
   from commit `b0157d9cad33247a4faaa6c95915968b3850d35c`.

The live health response after cutover is:

```json
{
  "ok": true,
  "mode": "server",
  "database": "reachable",
  "migrations": 3,
  "runtimeRole": "coursedesign_app",
  "objectStorage": "configured_private_gcs"
}
```

## Database invariants

- Drizzle ORM uses `node-postgres`; all three SQL migrations are checked in and
  forward-only.
- The migration owner and runtime login are separate. The application uses
  `coursedesign_app`, which inherits the restricted `NOLOGIN`
  `coursedesign_runtime` role.
- The runtime role cannot create schema objects or update/delete immutable
  revisions.
- A database trigger rejects revision mutation independently of application
  code.
- Mutable design and course saves use compare-and-swap lock versions.
- Course placements accept only exact immutable revision identifiers belonging
  to the same validated workspace.
- Workspace ownership is derived server-side from the validated provisional
  session. Only SHA-256 digests of opaque provisional-session tokens are stored.
- JSONB values are validated by the existing authoritative domain validators on
  every read.

## Approved local gates

All commands completed with exit code 0:

| Gate                                           | Result                            |
| ---------------------------------------------- | --------------------------------- |
| `pnpm lint`                                    | pass                              |
| `pnpm typecheck`                               | pass                              |
| Task-scoped `prettier --check`                 | pass                              |
| `pnpm build`                                   | pass                              |
| `pnpm vitest run --maxWorkers=4`               | 47 files, 312 tests passed        |
| `pnpm test:db`                                 | 6 files, 35 database tests passed |
| `git diff --check`                             | pass                              |
| Secret-pattern scan of task files and evidence | no credential or signed-URL leak  |

The application and database suites were run sequentially. A discarded
concurrent attempt was not product evidence: the migration test intentionally
drops and recreates the shared `coursedesign_test` schema while the application
suite was using it. Bounded application workers also avoid starving the fixed
Phase 1H benchmark timeout. The sequential full suites above are the
authoritative results.

## Exact production browser journey

The checked-in verifier uses real browser contexts against the production URL
and writes the machine-readable
[acceptance report](./production-evidence/browser-acceptance.json). It records
the expected `409 PATCH` as the single conflict response and rejects all other
console problems, failed requests, or HTTP errors.

The final visible run began at `2026-07-25T13:26:37.340Z` and exited 0 with 13
passed checks and 7 refreshed screenshots.

The two public selectors used for the isolated proof were:

- Email A: `prod-a-1784981175271@example.test`
- Email B: `prod-b-1784981175271@example.test`

Verified immutable identities:

| Evidence                           | Identifier                                                         |
| ---------------------------------- | ------------------------------------------------------------------ |
| SPJ-04 revision                    | `c69327a4-40cb-4ea6-8335-74a1786a8f91`                             |
| SPJ-04 configuration SHA-256       | `c53f04ef3a83f41d4db348a8b91a9d3e6a1738f872f94fb2ea8f8d64d8577d48` |
| SPJ-04 canonical artwork SHA-256   | `87704d04d4e6f15b7321351c6285455864926c60834513794770c4a85fa27713` |
| Profile Wing revision              | `167b86b2-34d4-40d5-9368-d44a552a3e92`                             |
| Profile Wing configuration SHA-256 | `686324482e62db978e450f438c2b3d50977050959ddaa309321ad1c71e1d46d7` |
| Profile Wing source fixture        | `clean-dog-side`                                                   |

The visible journey started from a one-time clean email-A workspace, created the
server records, and then reran against those records to prove restoration. It
proves:

1. Email A initially opens a clean server workspace with the exact
   unverified-workspace warning, draft version 1, zero immutable revisions, and
   zero pinned placements.
2. An SPJ-04 edit, immutable red revision, and canonical artwork save
   server-side.
3. The course pins that exact revision identifier.
4. A fresh email-A browser context restores the identical design, artwork,
   revision, and course.
5. Email B starts with draft version 1, zero revisions, and zero placements.
6. A stale email-A context receives an explicit recovery alert and cannot
   overwrite the newer yellow/red edit with its attempted blue edit.
7. The pre-existing local-library value and sentinel
   `production-browser-local-sentinel-20260725` remain byte-for-byte intact,
   are not imported, and are not rendered as server data.
8. The final Profile Wing revision appears in a fresh device context while its
   silhouette-processing history remains absent there and local on the source
   device.
9. The restored workspace remains usable at a 390 × 844 mobile viewport, and
   an exploratory pass covers Home, Designs, Course edit, and Course review.

## Visible evidence

- [Email A initial clean selector and exact warning](./production-evidence/screenshots/01-email-a-clean-workspace.png)
- [Email A initial empty server workspace](./production-evidence/screenshots/02-email-a-empty-server-workspace.png)
- [Email A restored home](./production-evidence/screenshots/03-email-a-restored-home.png)
- [Course pinned to the exact SPJ-04 revision](./production-evidence/screenshots/04-email-a-exact-revision-pinned-course.png)
- [Email B isolated and empty](./production-evidence/screenshots/05-email-b-isolated-empty-workspace.png)
- [Stale-context conflict recovery](./production-evidence/screenshots/06-stale-context-explicit-conflict.png)
- [Profile Wing server revision](./production-evidence/screenshots/07-email-a-profile-wing-server-revision.png)
- [Profile Wing restored on a fresh device](./production-evidence/screenshots/08-email-a-profile-wing-restored-fresh-device.png)
- [Mobile restored workspace](./production-evidence/screenshots/09-email-a-mobile-restored-home.png)

Browser diagnostics were clean apart from the one deliberately induced and
handled `409` conflict. Render logs showed no application error or `5xx`
response during the final window.

## Isolation and finish audit

- Existing browser-local data was not imported, deleted, or shown as server
  data.
- Only the new dedicated Course Design PostgreSQL database was migrated.
- ColorTune remains absent from the Render inventory.
- Selfso and every Qianlu Render database/service remain present and untouched.
- No private key, database URL, deploy hook, signed-object query, or other
  credential is present in the checked-in evidence.
- Unrelated dirty work in the working tree was preserved and excluded from the
  persistence commits.
