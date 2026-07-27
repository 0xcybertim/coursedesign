# Authentication visual QA

Everything outside this checklist is automated by
`pnpm qa:authentication:automated`. Use fresh private browser contexts and the
WorkOS staging environment. Do not use a real customer email or production
workspace.

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

## Visual pass

Record only pass/fail and a short note. Do not capture email addresses,
one-time codes, cookies, query strings, or dashboard secrets in screenshots.

1. **Signed out**
   Open `/` at 390 px, 768 px, and desktop width. Confirm there is no horizontal
   overflow and only the hosted sign-in/sign-up entry is offered.
2. **Password registration and verification**
   Register a new staging account, verify the email, and confirm the new private
   team workspace opens with starter content.
3. **Magic Auth**
   Sign out, use the six-digit email code, and confirm the same workspace opens.
4. **Google**
   Sign out, use Google, and confirm the expected account/workspace opens. A
   different provider subject must never expose another test account's data.
5. **Passkey**
   Enroll a test passkey, sign out, and sign back in with it. Cancel the passkey
   prompt once and confirm the hosted flow recovers cleanly.
6. **Recovery and restoration**
   Reset the password, confirm the previous session no longer works, then reload
   and open a second tab to confirm the new session restores.
7. **Logout and failure states**
   Confirm logout returns to the signed-out screen. Try an expired/used code and
   an unverified account; errors must be understandable and no workspace should
   appear.
8. **Local-data preservation**
   Before logout and account deletion, create browser-local experimental data.
   Confirm it still exists afterward and was neither imported into the team
   workspace nor deleted.

## Browser/device sampling

- Desktop: Chrome, Edge, Firefox, Safari.
- Real mobile: iOS Safari and Android Chrome.
- Use a fresh private context for each identity-isolation test.

Visual QA is complete only when all eight flows pass and no browser console
error, broken navigation, clipped control, or secret-bearing URL is observed.
