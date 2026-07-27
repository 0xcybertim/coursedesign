# Authentication visual QA handoff

Automated and agent-operated production acceptance is recorded in
`docs/authentication/production-evidence/browser-acceptance.json`. It covers the
live Render health/cutover boundary, responsive signed-out layouts, real WorkOS
password sessions, restoration, cookie security, export, cross-site request
protection, two-subject workspace isolation, compare-and-swap recovery, account
deletion, and browser-local data preservation.

The agent also proved registration, email verification, Magic Auth, recovery,
logout, old-password rejection, invalid-code handling, and webhook delivery.
Do not repeat those journeys unless investigating a regression.

The only remaining manual sign-off is Google, passkey, and subjective
cross-device visual quality. Use fresh private browser contexts in the WorkOS
staging environment. Do not use a real customer email or production workspace.

## One-time WorkOS staging setup

- Application name: `Course Design staging`
- Redirect URI: `https://coursedesign.onrender.com/auth/callback`
- Sign-in route: `https://coursedesign.onrender.com/account/sign-in`
- Sign-up route: `https://coursedesign.onrender.com/account/sign-up`
- Logout return URL: `https://coursedesign.onrender.com/`
- Webhook URL:
  `https://coursedesign.onrender.com/api/authentication/workos-webhook`
- Webhook events: `session.revoked`, `user.deleted`
- Enable: email/password, Magic Auth, Google, and passkeys
- Keep the WorkOS-hosted email sender and WorkOS domain for now.

The `onrender.com` URL is valid. A custom domain is not required. Passkeys made
now are test passkeys and may need reenrollment if a custom domain is added
later.

## Remaining visual pass

Record only pass/fail and a short note. Do not capture email addresses,
one-time codes, cookies, query strings, or dashboard secrets in screenshots.

1. **Google**
   Open `https://coursedesign.onrender.com/account/sign-in` in a fresh private
   context, use Google, and confirm the expected private workspace opens. Sign
   out and confirm the signed-out home returns.
2. **Passkey**
   Enroll a test passkey, sign out, and sign back in with it. Cancel the passkey
   prompt once and confirm the hosted flow recovers cleanly.
3. **Visual/device sweep**
   In desktop Safari, Firefox, and Edge plus real iOS Safari and Android Chrome,
   inspect the signed-out page, hosted sign-in page, and signed-in account
   panel. Confirm there is no clipping, horizontal overflow, unreadable text,
   broken navigation, or unexpected console error.

## Browser/device sampling

- Automated Chromium: complete.
- Desktop visual sign-off: Edge, Firefox, Safari.
- Real mobile: iOS Safari and Android Chrome.
- Use a fresh private context for each browser/device.

Visual QA is complete when all three remaining items pass and no browser console
error, broken navigation, clipped control, or secret-bearing URL is observed.
