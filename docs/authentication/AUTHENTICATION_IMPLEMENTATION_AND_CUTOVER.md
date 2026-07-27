# Course Design WorkOS authentication and cutover

Status: implemented locally; production is unchanged; WorkOS staging and exact
Render verification are pending.

## Decision

Course Design uses WorkOS AuthKit Hosted UI for external identity and
authentication. The application does not collect passwords or implement email
verification, Magic Auth, social OAuth, passkey, or recovery token handlers.
The checked-in SDKs are pinned to:

- `@workos-inc/authkit-nextjs@4.3.0`
- `@workos-inc/node@10.8.0`

WorkOS documents that staging is free and does not require a card, but staging
must not serve customer traffic. AuthKit production is free below one million
monthly active users, although WorkOS requires billing information before a
production environment can be enabled. Current sources:

- <https://workos.com/docs/authkit/environments>
- <https://workos.com/pricing>
- <https://workos.com/docs/authkit/hosted-ui>
- <https://workos.com/docs/authkit/magic-auth>
- <https://workos.com/docs/authkit/passkeys>

WorkOS-hosted default email works without a sender domain. A custom domain is
deferred. Passkeys are domain-bound; passkeys enrolled against the initial
hosted/onrender setup must be treated as test enrollments and may need
reenrollment after a later custom-domain move.

## Trust boundaries

1. WorkOS is authoritative only for external user identity, verification,
   authentication method, session issuance, refresh, and provider-side
   revocation.
2. The official Next.js AuthKit proxy validates WorkOS JWTs against WorkOS JWKS,
   refreshes access tokens, and supplies the server-only verified session.
3. PostgreSQL is authoritative for the application user, team workspace
   membership, workspace retirement, and every resource authorization decision.
4. WorkOS organization, role, permission, and entitlement claims are ignored.
   WorkOS organizations are not created in this phase.
5. Email is a mutable profile snapshot. It is not unique in the application
   schema and is never used to find, claim, merge, or authorize a workspace.
6. Browser requests never supply a trusted user, workspace, membership, provider
   subject, or WorkOS organization identifier.
7. Existing provisional selector workspaces are permanently retired. Knowledge
   of the old email selector proves nothing and creates no migration path.

The provider mapping key is
`(provider='workos', provider_tenant_id, provider_subject)`. Including the WorkOS
client/environment identifier prevents staging identities from being linked to
production identities. A new verified WorkOS identity receives a new
application user, one owner membership, one team workspace, and starter records.
Concurrent first loads are serialized on the application-user row.

## Session and request security

- WorkOS stores access and refresh tokens in its encrypted, authenticated,
  HttpOnly session cookie. No token, refresh token, OAuth token, password,
  passkey, or verification/recovery secret is stored in the Course Design
  database.
- HTTPS uses the host-only cookie name `__Host-course-design-auth`, `Path=/`,
  `Secure`, `HttpOnly`, and `SameSite=Lax`. Local HTTP uses
  `course-design-auth`. `WORKOS_COOKIE_DOMAIN` is forbidden.
- `WORKOS_COOKIE_MAX_AGE` is exactly `604800` seconds. WorkOS access tokens stay
  short-lived and are refreshed by the official proxy.
- The app stores only an HMAC-SHA-256 digest of the WorkOS session ID for
  observation, audit correlation, and immediate local revocation.
- Impersonated sessions and unverified identities are rejected.
- Mutating application endpoints require an exact allowlisted `Origin`,
  same-origin Fetch Metadata, and `x-course-design-csrf: same-origin`.
- The WorkOS webhook is the only cross-origin mutation exception. It requires
  the raw-body `WorkOS-Signature`, a five-minute signature tolerance, bounded
  body size, and HMAC-digested idempotency.
- `session.revoked` webhooks write an immutable provider-session revocation
  tombstone and revoke any observation. `user.deleted` webhooks retire owned
  workspaces, revoke observations, and anonymize the identity.
- Hosted authentication abuse controls and Radar remain at WorkOS. Application
  resource limits and CSRF rules remain local. No process-local authentication
  rate limiter is treated as a production control.

The database contains:

- `auth_identities`
- `users.auth_identity_id`
- `auth_session_observations`
- `auth_revoked_provider_sessions`
- `auth_webhook_events`
- append-only `auth_audit_events`
- `workspaces.retired_at` and `workspaces.retirement_reason`

The runtime role cannot create schema objects, mutate/delete audit or webhook
history, delete identity/session records, reopen selectors, or mutate immutable
design revisions.

## Hosted flows

`/account/sign-in` and `/account/sign-up` create AuthKit PKCE flows.
`/auth/callback` accepts the WorkOS callback, rejects impersonation/unverified
sessions, and returns to `/`. WorkOS Hosted UI owns:

- password registration and login;
- email verification;
- six-digit Magic Auth codes (WorkOS Magic Links are deprecated);
- Google OAuth when enabled in the WorkOS dashboard;
- passkey enrollment and login;
- password reset and account recovery.

`POST /api/authentication/sign-out` first writes a local revocation tombstone,
then calls WorkOS session revocation, then clears WorkOS and legacy provisional
cookies. A provider failure leaves the local session blocked and returns a
retryable failure rather than silently restoring access.

## Workspace retirement and persistence invariants

Migration `0004_authentication_foundation.sql` is additive. Migration
`0005_retire_unverified_workspaces.sql`:

- disables every provisional email selector;
- revokes every provisional session;
- retires every workspace reached through a provisional selector;
- revokes runtime writes to selector/session tables.

It does not delete users, workspaces, designs, revisions, artwork, or courses.
Immutable revision triggers, same-workspace course references, CAS save
conflicts, private GCS objects, canonical derivative rules, and fail-closed
server persistence remain unchanged. Browser-local histories, raw sources,
masks, and other local state are never enumerated, imported, or deleted by auth
or account routes.

## Export, deletion, audit, and retention

Account export contains the active identity profile and authorized application
workspace data only. Provider subjects, WorkOS organization claims, session
digests, tokens, secrets, bucket object keys, and credentials are excluded.

Account deletion requires authentication within the previous five minutes:

1. mark the identity `deletion_pending`;
2. retire every owned workspace;
3. revoke local session observations;
4. append a privacy-safe audit event;
5. delete the WorkOS user;
6. replace the provider subject with a one-way tombstone, remove email/name,
   and mark the identity `deleted`.

Provider failure leaves `deletion_pending`, which blocks all access. The
migration-owner maintenance command retries pending WorkOS deletions without
logging subjects/emails, treats an already-missing WorkOS user as deleted,
finalizes the tombstone, and reports counts only. Immutable revisions and
workspace resources remain as retired historical truth. Audit retention
defaults to 180 days and is owner-maintained.

## Required configuration

No secret may be committed, logged, screenshotted, or written to browser
evidence.

```text
PERSISTENCE_MODE=server
AUTH_BASE_URL=https://coursedesign.onrender.com
ALLOWED_ORIGINS=https://coursedesign.onrender.com
WORKOS_CLIENT_ID=client_...
WORKOS_API_KEY=sk_test_... or sk_live_...
WORKOS_WEBHOOK_SECRET=whsec_...
WORKOS_COOKIE_PASSWORD=<at least 32 random bytes>
WORKOS_COOKIE_NAME=__Host-course-design-auth
WORKOS_COOKIE_MAX_AGE=604800
WORKOS_COOKIE_SAMESITE=lax
NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://coursedesign.onrender.com/auth/callback
```

`WORKOS_COOKIE_DOMAIN` must remain unset. WorkOS dashboard redirects:

- callback:
  `https://coursedesign.onrender.com/auth/callback`
- sign-in endpoint:
  `https://coursedesign.onrender.com/account/sign-in`
- logout return/default:
  `https://coursedesign.onrender.com/`
- webhook:
  `https://coursedesign.onrender.com/api/authentication/workos-webhook`
  with `session.revoked` and `user.deleted`

The onrender.com URL is sufficient; a custom domain is not required.

## No-feature-flag cutover and rollback

The user explicitly chose no deployment-wide authentication feature flag.
Safety comes from forward-only sequencing and a deployment boundary:

1. Prove local format, lint, typecheck, build, database, security, and browser
   gates.
2. Create a free WorkOS staging environment and configure only the Render URL.
3. Prove every hosted flow on a non-customer staging deployment/fresh database.
4. Back up production PostgreSQL and rehearse restore.
5. With separate production-mutation approval, apply only migration `0004`.
6. Confirm old production behavior, migration checksum, runtime grants,
   database health, private GCS health, and zero selector/data changes.
7. Configure WorkOS/Render secrets and dashboard redirects/webhook without
   logging values.
8. Deploy the WorkOS code and prove signed-out health plus one controlled
   authenticated account.
9. Apply migration `0005` only after the new auth path is healthy.
10. Run the exact live matrix below.

Migration `0005` preserves retired workspaces and immutable revisions, but
replaces every legacy selector email with a one-way, row-specific digest address
and revokes all runtime access to both provisional identity tables. Only the
migration owner can inspect the retired rows for controlled retention or
incident response; the application cannot query old selectors or session
metadata.

Before step 9, rollback is the prior code version and removal of the new WorkOS
environment variables; additive `0004` tables may remain unused. After step 9,
legacy selectors remain retired permanently. Rollback means fixing or reverting
the WorkOS application code while preserving retired workspaces and immutable
truth; it never re-enables public email selection.

## Gates

Local:

```text
pnpm qa:authentication:automated
```

That single command runs the individual gates below and starts/stops its own
loopback-only authentication acceptance server against a database whose name
must end in `_test`:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
pnpm acceptance:authentication:local
```

The only manual work is the hosted WorkOS visual/device pass in
`docs/authentication/VISUAL_QA_CHECKLIST.md`.

The combined dependency gate fails on high or critical production advisories.
It still prints the known moderate transitive `uuid` advisory under the existing
Google Cloud Storage dependency; forcing an unsupported transitive major version
is outside the authentication change.

The local browser test uses a signed, HttpOnly, loopback-only acceptance cookie.
Its route is available only when `NODE_ENV !== production` and both
`AUTH_ACCEPTANCE_TEST_MODE=true` and a 32-byte
`AUTH_ACCEPTANCE_TEST_SECRET` are present. The WorkOS proxy bypasses this seam
only under that exact non-production condition. Production returns 404 and can
never install a test resolver.

Exact WorkOS staging and production fresh-context proof must cover:

- password registration/login;
- email verification;
- Magic Auth code;
- Google OAuth;
- passkey enrollment/login;
- logout and provider/local revocation;
- session restoration/refresh;
- recovery and old-session rejection;
- two-user and same-email/different-subject isolation;
- selector retirement/no claiming;
- CAS conflict recovery;
- browser-local preservation;
- export and fresh-auth deletion;
- signed webhook replay, invalid-signature, provider-failure, expired,
  unverified, cross-origin, and provider-unavailable paths;
- Chrome, Edge, Firefox, Safari, iOS Safari, and Android Chrome.

Production must remain unchanged until the user separately approves these
mutation and deployment steps.

Current local evidence:

- `docs/authentication/local-browser-acceptance.json`
- `docs/authentication/production-build-smoke.json`
- `docs/authentication/local-browser-engine-smoke.json` (explicitly marks the
  earlier Better Auth engine evidence as superseded)
