import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl =
  process.env.AUTHENTICATION_ACCEPTANCE_BASE_URL ?? "http://localhost:3100";
function resolveChromiumPath() {
  const configured = process.env.AUTHENTICATION_ACCEPTANCE_CHROMIUM_PATH;
  if (configured) return configured;

  const bundled = chromium.executablePath();
  if (existsSync(bundled)) return bundled;

  const cacheRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    path.join(homedir(), "Library", "Caches", "ms-playwright");
  if (existsSync(cacheRoot)) {
    const installations = readdirSync(cacheRoot, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const installation of installations) {
      for (const relative of [
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-linux/chrome",
        "chrome-win/chrome.exe",
      ]) {
        const candidate = path.join(cacheRoot, installation, relative);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  throw new Error(
    "No Playwright Chromium executable is available. Set AUTHENTICATION_ACCEPTANCE_CHROMIUM_PATH to an existing test browser.",
  );
}

const chromiumPath = resolveChromiumPath();
const parsedBaseUrl = new URL(baseUrl);
assert.ok(
  ["localhost", "127.0.0.1"].includes(parsedBaseUrl.hostname),
  "Local authentication acceptance is restricted to loopback.",
);
assert.equal(parsedBaseUrl.protocol, "http:");

const evidenceDirectory = path.resolve("docs/authentication");
const screenshotDirectory = path.join(evidenceDirectory, "screenshots");
const reportPath = path.join(
  evidenceDirectory,
  "local-browser-acceptance.json",
);
await mkdir(screenshotDirectory, { recursive: true });

const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const report = {
  schemaVersion: "course-design-workos-local-browser-acceptance-v2",
  status: "running",
  target: baseUrl,
  productionMutated: false,
  checks: [],
  screenshots: [],
  diagnostics: {
    consoleProblems: [],
    failedRequests: [],
    serverErrors: [],
    externalRequests: [],
    tokenBearingRequestUrls: [],
    authenticationResponseSecretFields: [],
  },
  workosStagingPending: [
    "Hosted password registration and login",
    "Hosted email verification and Magic Auth code",
    "Hosted Google OAuth",
    "Hosted passkey registration and login",
    "Hosted password recovery",
    "WorkOS callback, session refresh, logout, and signed webhook delivery on the Render URL",
    "Desktop Chrome, Edge, Firefox, Safari, iOS Safari, and Android Chrome fresh-context matrix",
  ],
  failure: null,
};

function checked(name, detail) {
  report.checks.push({ name, result: "pass", detail });
}

function containsSecretField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSecretField);
  for (const [key, nested] of Object.entries(value)) {
    if (
      ["token", "accessToken", "refreshToken", "idToken", "sessionId"].includes(
        key,
      )
    ) {
      return true;
    }
    if (containsSecretField(nested)) return true;
  }
  return false;
}

function auditPage(page) {
  page.on("console", (message) => {
    if (
      ["warning", "error"].includes(message.type()) &&
      !/GroupMarkerNotSet|GL Driver Message|Failed to load resource: the server responded with a status of (400|401|403|404|409|410)/.test(
        message.text(),
      )
    ) {
      report.diagnostics.consoleProblems.push(
        `${message.type()}: ${message.text()}`,
      );
    }
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) &&
      !["data:", "blob:"].includes(url.protocol)
    ) {
      report.diagnostics.externalRequests.push(
        `${request.method()} ${url.origin}${url.pathname}`,
      );
    }
    if ([...url.searchParams.keys()].some((key) => /token/i.test(key))) {
      report.diagnostics.tokenBearingRequestUrls.push(
        `${request.method()} ${url.pathname}`,
      );
    }
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText === "net::ERR_ABORTED") return;
    report.diagnostics.failedRequests.push(
      `${request.method()} ${new URL(request.url()).pathname} ${
        request.failure()?.errorText ?? "failed"
      }`,
    );
  });
  page.on("response", async (response) => {
    try {
      const url = new URL(response.url());
      if (response.status() >= 500) {
        report.diagnostics.serverErrors.push(
          `${response.request().method()} ${response.status()} ${url.pathname}`,
        );
      }
      if (
        !url.pathname.startsWith("/api/authentication/") ||
        !response.headers()["content-type"]?.includes("application/json")
      ) {
        return;
      }
      if (containsSecretField(JSON.parse(await response.text()))) {
        report.diagnostics.authenticationResponseSecretFields.push(
          `${response.status()} ${url.pathname}`,
        );
      }
    } catch {
      // A disposed or non-JSON response has no browser-readable secret fields.
    }
  });
}

async function newContext(viewport = { width: 1440, height: 1000 }) {
  return browser.newContext({ viewport });
}

async function newPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(60_000);
  auditPage(page);
  return page;
}

async function goto(page, route = "/") {
  await page.goto(new URL(route, baseUrl).href, {
    waitUntil: "domcontentloaded",
  });
}

async function createAcceptanceSession(context, input) {
  const response = await context.request.post(
    new URL("/api/authentication/test-session", baseUrl).href,
    {
      data: input,
      headers: {
        origin: baseUrl,
        "sec-fetch-site": "same-origin",
        "x-course-design-csrf": "same-origin",
      },
    },
  );
  assert.equal(
    response.status(),
    200,
    "The local server must explicitly enable AUTH_ACCEPTANCE_TEST_MODE.",
  );
  assert.deepEqual(await response.json(), { ok: true });
}

function identity(label, emailLabel = label, verified = true) {
  return {
    subject: `acceptance_user_${label}_${runId.replaceAll("-", "_")}`,
    email: `${emailLabel}-${runId}@example.test`,
    displayName: `Acceptance ${label}`,
    emailVerified: verified,
  };
}

async function assertViewportFit(page, label) {
  const fit = await page.evaluate(() => {
    const element = document.querySelector(".authentication-panel");
    const bounds = element?.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      accountBounds: bounds ? { left: bounds.left, right: bounds.right } : null,
    };
  });
  assert.ok(fit.scrollWidth <= fit.clientWidth, `${label} overflows.`);
  if (fit.accountBounds) {
    assert.ok(fit.accountBounds.left >= 0, `${label} is clipped left.`);
    assert.ok(
      fit.accountBounds.right <= fit.innerWidth,
      `${label} is clipped right.`,
    );
  }
}

async function screenshot(page, filename) {
  const target = path.join(screenshotDirectory, filename);
  await page.screenshot({ path: target, fullPage: false });
  report.screenshots.push(path.relative(process.cwd(), target));
}

async function seedLocalSentinel(page) {
  await page.evaluate(async () => {
    localStorage.setItem(
      "course-design.auth-acceptance-sentinel",
      "must-remain-local",
    );
    await new Promise((resolve, reject) => {
      const open = indexedDB.open("course-design-auth-acceptance", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("sentinels");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction("sentinels", "readwrite");
        transaction.objectStore("sentinels").put("must-remain-local", "value");
        transaction.oncomplete = () => {
          open.result.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
}

async function assertLocalSentinel(page) {
  const state = await page.evaluate(async () => {
    const indexed = await new Promise((resolve, reject) => {
      const open = indexedDB.open("course-design-auth-acceptance", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const get = open.result
          .transaction("sentinels", "readonly")
          .objectStore("sentinels")
          .get("value");
        get.onerror = () => reject(get.error);
        get.onsuccess = () => {
          open.result.close();
          resolve(get.result);
        };
      };
    });
    return {
      local: localStorage.getItem("course-design.auth-acceptance-sentinel"),
      indexed,
    };
  });
  assert.deepEqual(state, {
    local: "must-remain-local",
    indexed: "must-remain-local",
  });
}

const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
  ],
});
let thrown = null;

try {
  for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["tablet", { width: 768, height: 1024 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await newContext(viewport);
    const page = await newPage(context);
    await goto(page);
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    await assertViewportFit(page, `Signed-out ${label}`);
    await screenshot(page, `workos-signed-out-${label}.png`);
    await context.close();
  }
  checked(
    "hosted entry boundary and responsive layout",
    "Signed-out server mode exposes only WorkOS sign-in/sign-up routes and fits desktop, tablet, and mobile viewports.",
  );

  const lifecycleContext = await newContext();
  await createAcceptanceSession(
    lifecycleContext,
    identity("Lifecycle", "lifecycle"),
  );
  const lifecyclePage = await newPage(lifecycleContext);
  await goto(lifecyclePage);
  await lifecyclePage
    .getByRole("heading", { name: "Acceptance Lifecycle" })
    .waitFor();
  await lifecyclePage
    .getByRole("heading", { name: "SPJ-04 · Club Classic" })
    .waitFor();
  await seedLocalSentinel(lifecyclePage);
  await lifecyclePage.reload({ waitUntil: "domcontentloaded" });
  await lifecyclePage
    .getByRole("heading", { name: "Acceptance Lifecycle" })
    .waitFor();
  const restoredPage = await newPage(lifecycleContext);
  await goto(restoredPage);
  await restoredPage
    .getByRole("heading", { name: "Acceptance Lifecycle" })
    .waitFor();
  await assertLocalSentinel(restoredPage);
  const testCookie = (await lifecycleContext.cookies()).find(
    (cookie) => cookie.name === "course-design-auth-acceptance",
  );
  assert.ok(testCookie);
  assert.equal(testCookie.httpOnly, true);
  assert.equal(testCookie.sameSite, "Lax");
  assert.equal(testCookie.path, "/");
  checked(
    "local identity mapping, starter team, and restoration",
    "A signed non-production test identity opened one private starter team and restored across reload/new page without exposing its HttpOnly cookie.",
  );

  const exported = await lifecycleContext.request.get(
    new URL("/api/account/export", baseUrl).href,
  );
  assert.equal(exported.status(), 200);
  const exportBody = await exported.json();
  assert.equal(exportBody.account.email.includes("lifecycle-"), true);
  assert.equal(containsSecretField(exportBody), false);
  assert.equal(
    /provider_subject|access_token|refresh_token|cookie_password|session_digest/i.test(
      JSON.stringify(exportBody),
    ),
    false,
  );
  const selector = await lifecycleContext.request.post(
    new URL("/api/workspace/select", baseUrl).href,
    {
      data: { email: exportBody.account.email },
      headers: {
        origin: baseUrl,
        "sec-fetch-site": "same-origin",
        "x-course-design-csrf": "same-origin",
      },
    },
  );
  assert.equal(selector.status(), 410);
  const crossSite = await lifecycleContext.request.post(
    new URL("/api/account/delete/request", baseUrl).href,
    {
      headers: {
        origin: "https://attacker.invalid",
        "sec-fetch-site": "cross-site",
        "x-course-design-csrf": "same-origin",
      },
    },
  );
  assert.equal(crossSite.status(), 404);
  checked(
    "privacy export, selector retirement, and CSRF",
    "Export omitted provider/session secrets, the unverified email selector remained 410, and a cross-site destructive request failed before authorization.",
  );

  const sharedEmail = `shared-${runId}@example.test`;
  const isolatedAContext = await newContext();
  const isolatedBContext = await newContext();
  await createAcceptanceSession(isolatedAContext, {
    ...identity("IsolationA", "ignored-a"),
    email: sharedEmail,
  });
  await createAcceptanceSession(isolatedBContext, {
    ...identity("IsolationB", "ignored-b"),
    email: sharedEmail,
  });
  const isolatedAPage = await newPage(isolatedAContext);
  const isolatedBPage = await newPage(isolatedBContext);
  await goto(isolatedAPage, "/designs/local-spj-04/edit");
  await goto(isolatedBPage, "/designs/local-spj-04/edit");
  await isolatedAPage
    .getByTestId("local-save-status")
    .getByText("Draft restored from server workspace")
    .waitFor();
  await isolatedBPage
    .getByTestId("local-save-status")
    .getByText("Draft restored from server workspace")
    .waitFor();
  await isolatedAPage.getByRole("radio", { name: "Red frame" }).click();
  await isolatedAPage
    .getByTestId("local-save-status")
    .getByText("Draft saved to server workspace")
    .waitFor();
  await isolatedBPage
    .getByTestId("draft-record")
    .getByText("White", { exact: true })
    .waitFor();
  checked(
    "provider-subject workspace isolation",
    "Two fresh browser contexts with distinct provider subjects stayed isolated at the same public route key.",
  );

  const competingPage = await newPage(isolatedAContext);
  await goto(competingPage, "/designs/local-spj-04/edit");
  await competingPage
    .getByTestId("local-save-status")
    .getByText("Draft restored from server workspace")
    .waitFor();
  await isolatedAPage.getByRole("radio", { name: "Blue frame" }).click();
  await isolatedAPage
    .getByTestId("local-save-status")
    .getByText("Draft saved to server workspace")
    .waitFor();
  await competingPage.getByRole("radio", { name: "Yellow frame" }).click();
  await competingPage.getByText("Server save conflict").waitFor();
  await competingPage
    .getByRole("button", { name: "Load latest server version" })
    .click();
  await competingPage
    .getByRole("radio", { name: "Blue frame, selected" })
    .waitFor();
  checked(
    "compare-and-swap conflict recovery",
    "Two same-account tabs surfaced a stale-version conflict and recovered the winning immutable server truth.",
  );

  await lifecyclePage.getByRole("button", { name: "Sign out" }).click();
  await lifecyclePage.getByRole("heading", { name: "Sign in" }).waitFor();
  await assertLocalSentinel(lifecyclePage);
  const signedOutSession = await lifecycleContext.request.get(
    new URL("/api/workspace/session", baseUrl).href,
  );
  assert.equal(signedOutSession.status(), 401);
  checked(
    "logout, revocation, and local-data preservation",
    "Logout revoked the database observation, cleared the test cookie, closed workspace access, and left localStorage/IndexedDB untouched.",
  );

  const deletionContext = await newContext();
  await createAcceptanceSession(
    deletionContext,
    identity("Deletion", "deletion"),
  );
  const deletionPage = await newPage(deletionContext);
  await goto(deletionPage);
  await seedLocalSentinel(deletionPage);
  await deletionPage.getByRole("button", { name: "Delete account" }).click();
  await deletionPage
    .getByText("This permanently deletes the WorkOS account")
    .waitFor();
  await deletionPage
    .getByRole("button", { name: "Yes, delete my account" })
    .click();
  await deletionPage.getByRole("heading", { name: "Sign in" }).waitFor();
  await assertLocalSentinel(deletionPage);
  assert.equal(
    (await deletionContext.cookies()).some(
      (cookie) => cookie.name === "course-design-auth-acceptance",
    ),
    false,
  );
  checked(
    "fresh-auth deletion and immutable-data preservation",
    "Fresh-auth deletion retired server workspaces, cleared identity/session access, and preserved browser-local histories and inputs.",
  );

  const unverifiedContext = await newContext();
  await createAcceptanceSession(
    unverifiedContext,
    identity("Unverified", "unverified", false),
  );
  const unverifiedPage = await newPage(unverifiedContext);
  await goto(unverifiedPage);
  await unverifiedPage.getByText("Verify your email to continue.").waitFor();
  assert.equal(
    await unverifiedPage
      .getByRole("heading", { name: "SPJ-04 · Club Classic" })
      .count(),
    0,
  );
  checked(
    "unverified-session failure path",
    "An unverified provider identity rendered the verification gate and never resolved workspace ownership.",
  );

  await Promise.all([
    lifecycleContext.close(),
    isolatedAContext.close(),
    isolatedBContext.close(),
    deletionContext.close(),
    unverifiedContext.close(),
  ]);

  assert.deepEqual(report.diagnostics.consoleProblems, []);
  assert.deepEqual(report.diagnostics.failedRequests, []);
  assert.deepEqual(report.diagnostics.serverErrors, []);
  assert.deepEqual(report.diagnostics.externalRequests, []);
  assert.deepEqual(report.diagnostics.tokenBearingRequestUrls, []);
  assert.deepEqual(report.diagnostics.authenticationResponseSecretFields, []);
  report.status = "local-chromium-passed-workos-staging-pending";
} catch (error) {
  thrown = error;
  report.status = "failed";
  report.failure =
    error instanceof Error
      ? error.message
      : "Unknown browser acceptance error.";
} finally {
  await browser.close();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (thrown) throw thrown;
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
