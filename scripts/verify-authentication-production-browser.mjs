import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl =
  process.env.AUTHENTICATION_PRODUCTION_ACCEPTANCE_BASE_URL ??
  "https://coursedesign.onrender.com";
const confirmation =
  process.env.AUTHENTICATION_PRODUCTION_ACCEPTANCE_CONFIRM ?? "";
const workosApiKey = process.env.WORKOS_API_KEY ?? "";

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
    "No existing Playwright Chromium executable is available. Set AUTHENTICATION_ACCEPTANCE_CHROMIUM_PATH to an installed test browser.",
  );
}

assert.equal(
  baseUrl,
  "https://coursedesign.onrender.com",
  "Production authentication acceptance is restricted to the exact Render URL.",
);
assert.equal(
  confirmation,
  "coursedesign-onrender-workos-staging",
  "Set AUTHENTICATION_PRODUCTION_ACCEPTANCE_CONFIRM=coursedesign-onrender-workos-staging to create and delete synthetic WorkOS staging users.",
);
assert.match(
  workosApiKey,
  /^sk_[A-Za-z0-9_-]{20,}$/,
  "Set WORKOS_API_KEY to the Render service's WorkOS staging key.",
);

const evidenceDirectory = path.resolve(
  "docs/authentication/production-evidence",
);
const screenshotDirectory = path.join(evidenceDirectory, "screenshots");
const reportPath = path.join(evidenceDirectory, "browser-acceptance.json");
await mkdir(screenshotDirectory, { recursive: true });

const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const report = {
  schemaVersion: "course-design-workos-production-browser-acceptance-v1",
  status: "running",
  target: baseUrl,
  providerEnvironment: "workos-staging",
  syntheticUsersDeleted: false,
  checks: [],
  screenshots: [],
  diagnostics: {
    consoleProblems: [],
    failedRequests: [],
    serverErrors: [],
    tokenBearingRequestPaths: [],
    authenticationResponseSecretFields: [],
  },
  manualOnlyRemaining: [
    "Google OAuth consent in a user-controlled account",
    "Passkey registration and sign-in on a user-controlled device",
    "Subjective visual review in desktop Safari, desktop Firefox, desktop Edge, iOS Safari, and Android Chrome",
  ],
  failure: null,
};
const pageStages = new WeakMap();

function checked(name, detail) {
  report.checks.push({ name, result: "pass", detail });
}

function containsSecretField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSecretField);
  for (const [key, nested] of Object.entries(value)) {
    if (
      [
        "token",
        "accessToken",
        "refreshToken",
        "idToken",
        "sessionId",
        "providerSessionDigest",
      ].includes(key)
    ) {
      return true;
    }
    if (containsSecretField(nested)) return true;
  }
  return false;
}

function safeRequest(request) {
  const url = new URL(request.url());
  return `${request.method()} ${url.origin}${url.pathname}`;
}

function setStage(page, stage) {
  pageStages.set(page, stage);
}

async function boundedPageTitle(page) {
  return Promise.race([
    page.title().catch(() => "unavailable"),
    new Promise((resolve) =>
      setTimeout(() => resolve("unavailable during navigation"), 2_000),
    ),
  ]);
}

function auditPage(page) {
  page.on("console", (message) => {
    if (
      ["warning", "error"].includes(message.type()) &&
      !/Failed to load resource: the server responded with a status of (400|401|403|404|409|410|429)|The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy|GL Driver Message|Canvas2D: Multiple readback operations|No available adapters/.test(
        message.text(),
      )
    ) {
      report.diagnostics.consoleProblems.push(
        `${message.type()}: ${message.text()}`,
      );
    }
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText === "net::ERR_ABORTED") return;
    report.diagnostics.failedRequests.push(
      `${safeRequest(request)} ${request.failure()?.errorText ?? "failed"}`,
    );
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ([...url.searchParams.keys()].some((key) => /token/i.test(key))) {
      report.diagnostics.tokenBearingRequestPaths.push(safeRequest(request));
    }
  });
  page.on("response", async (response) => {
    try {
      const url = new URL(response.url());
      if (response.status() >= 500) {
        const diagnostic = {
          stage: pageStages.get(page) ?? "unlabeled",
          status: response.status(),
          origin: url.origin,
          path: url.pathname,
        };
        if (
          url.origin === baseUrl &&
          response.headers()["content-type"]?.includes("application/json")
        ) {
          const body = JSON.parse(await response.text());
          if (
            body &&
            typeof body === "object" &&
            typeof body.error === "object" &&
            body.error !== null
          ) {
            diagnostic.error = {
              kind:
                typeof body.error.kind === "string"
                  ? body.error.kind
                  : "unknown",
              message:
                typeof body.error.message === "string"
                  ? body.error.message
                  : "No safe error message was returned.",
            };
          }
        }
        report.diagnostics.serverErrors.push(diagnostic);
      }
      if (
        url.origin !== baseUrl ||
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

async function newContext(browser, viewport = { width: 1440, height: 1000 }) {
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

async function screenshot(page, filename) {
  const target = path.join(screenshotDirectory, filename);
  await page.screenshot({
    path: target,
    fullPage: false,
    scale: "css",
  });
  report.screenshots.push(path.relative(process.cwd(), target));
}

async function assertViewportFit(page, label) {
  const fit = await page.evaluate(() => {
    const panel = document.querySelector(".authentication-panel");
    const bounds = panel?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bounds: bounds
        ? {
            left: bounds.left,
            right: bounds.right,
            width: bounds.width,
          }
        : null,
    };
  });
  assert.ok(fit.scrollWidth <= fit.clientWidth, `${label} overflows.`);
  if (fit.bounds) {
    assert.ok(fit.bounds.left >= 0, `${label} is clipped left.`);
    assert.ok(
      fit.bounds.right <= fit.clientWidth,
      `${label} is clipped right.`,
    );
  }
}

async function seedLocalSentinel(page, suffix) {
  await page.evaluate(async (key) => {
    localStorage.setItem(key, "must-remain-local");
    await new Promise((resolve, reject) => {
      const open = indexedDB.open(key, 1);
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
  }, suffix);
}

async function assertLocalSentinel(page, suffix) {
  const state = await page.evaluate(async (key) => {
    const indexed = await new Promise((resolve, reject) => {
      const open = indexedDB.open(key, 1);
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
    return { local: localStorage.getItem(key), indexed };
  }, suffix);
  assert.deepEqual(state, {
    local: "must-remain-local",
    indexed: "must-remain-local",
  });
}

async function signInWithPassword(page, identity) {
  setStage(page, "hosted-password-sign-in");
  await goto(page);
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await page.getByPlaceholder("Your email address").fill(identity.email);
  await page.getByRole("button", { name: /Continue with email/ }).click();
  assert.match(
    new URL(page.url()).hostname,
    /-staging\.authkit\.app$/,
    "Synthetic users must only be created through WorkOS staging.",
  );
  try {
    await page
      .getByPlaceholder("Your password")
      .fill(identity.password, { timeout: 30_000 });
  } catch {
    const current = new URL(page.url());
    const title = await boundedPageTitle(page);
    throw new Error(
      `Hosted password entry was not exposed. Current page: ${current.origin}${current.pathname}; title: ${title}`,
    );
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  try {
    await page.waitForURL(
      (url) => url.origin === baseUrl && url.pathname === "/",
      { timeout: 60_000, waitUntil: "domcontentloaded" },
    );
  } catch {
    const current = new URL(page.url());
    const title = await boundedPageTitle(page);
    throw new Error(
      `Hosted password sign-in did not return to Render. Current page: ${current.origin}${current.pathname}; title: ${title}`,
    );
  }
  await page.getByText(identity.email, { exact: true }).waitFor();
  await page
    .getByText("Private team workspace · server-backed", { exact: true })
    .waitFor();
  setStage(page, "authenticated-workspace");
}

async function deleteCurrentAccount(page) {
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByText("This permanently deletes the WorkOS account").waitFor();
  await page.getByRole("button", { name: "Yes, delete my account" }).click();
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
}

function identity(label) {
  return {
    email: `codex-${label.toLowerCase()}-${runId}@example.net`,
    name: `Production ${label}`,
    firstName: "Production",
    lastName: label,
    password: `Cd!${randomBytes(18).toString("base64url")}8z`,
  };
}

async function createProviderUser(value) {
  const response = await fetch("https://api.workos.com/user_management/users", {
    method: "POST",
    headers: {
      authorization: `Bearer ${workosApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: value.email,
      password: value.password,
      first_name: value.firstName,
      last_name: value.lastName,
      email_verified: true,
    }),
  });
  assert.equal(response.status, 201, "Synthetic WorkOS user creation failed.");
  const created = await response.json();
  assert.equal(created.email, value.email);
  assert.equal(created.email_verified, true);
}

async function deleteProviderUserIfPresent(value) {
  const listed = await fetch(
    `https://api.workos.com/user_management/users?email=${encodeURIComponent(value.email)}`,
    {
      headers: { authorization: `Bearer ${workosApiKey}` },
    },
  );
  assert.equal(listed.status, 200);
  const users = await listed.json();
  const user = users.data?.find((candidate) => candidate.email === value.email);
  if (!user) return;
  const deleted = await fetch(
    `https://api.workos.com/user_management/users/${user.id}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${workosApiKey}` },
    },
  );
  assert.equal(deleted.status, 200);
}

const browser = await chromium.launch({
  executablePath: resolveChromiumPath(),
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
  ],
});
let thrown = null;
const openContexts = new Set();
const syntheticIdentities = [];

try {
  const health = await fetch(new URL("/api/persistence/health", baseUrl));
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true,
    mode: "server",
    database: "reachable",
    migrations: 5,
    runtimeRole: "coursedesign_app",
    objectStorage: "configured_private_gcs",
  });
  const capabilities = await fetch(
    new URL("/api/authentication/capabilities", baseUrl),
  );
  assert.equal(capabilities.status, 200);
  assert.deepEqual(await capabilities.json(), {
    provider: "workos",
    hosted: true,
    methodsManagedByProvider: true,
  });
  const selector = await fetch(new URL("/api/workspace/select", baseUrl), {
    method: "POST",
  });
  assert.equal(selector.status, 410);
  const testSession = await fetch(
    new URL("/api/authentication/test-session", baseUrl),
    { method: "POST" },
  );
  assert.equal(testSession.status, 404);
  checked(
    "cutover health and retired public boundary",
    "The exact Render app reports migration 5, least-privilege runtime access, private GCS, hosted WorkOS, a 410 legacy selector, and no production test-session route.",
  );

  for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["tablet", { width: 768, height: 1024 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await newContext(browser, viewport);
    openContexts.add(context);
    const page = await newPage(context);
    setStage(page, `signed-out-${label}`);
    await goto(page);
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    await assertViewportFit(page, `Signed-out ${label}`);
    await screenshot(page, `signed-out-${label}.png`);
    await context.close();
    openContexts.delete(context);
  }
  checked(
    "signed-out responsive boundary",
    "Fresh desktop, tablet, and mobile contexts expose only hosted sign-in/sign-up and have no horizontal clipping.",
  );

  const first = identity("Isolation-A");
  const second = identity("Isolation-B");
  syntheticIdentities.push(first, second);
  await createProviderUser(first);
  await createProviderUser(second);
  const firstSentinel = `course-design-production-${runId}-a`;
  const secondSentinel = `course-design-production-${runId}-b`;

  const firstContext = await newContext(browser);
  openContexts.add(firstContext);
  const firstPage = await newPage(firstContext);
  setStage(firstPage, "first-authentication-bootstrap");
  await goto(firstPage);
  await seedLocalSentinel(firstPage, firstSentinel);
  await signInWithPassword(firstPage, first);
  await assertLocalSentinel(firstPage, firstSentinel);

  const restoredPage = await newPage(firstContext);
  setStage(restoredPage, "first-session-restoration");
  await goto(restoredPage);
  await restoredPage.getByText(first.email, { exact: true }).waitFor();
  await assertLocalSentinel(restoredPage, firstSentinel);
  const firstCookies = await firstContext.cookies(baseUrl);
  const sessionCookie = firstCookies.find(
    (cookie) =>
      cookie.name === "__Host-course-design-auth" &&
      cookie.domain.includes("coursedesign.onrender.com") &&
      cookie.httpOnly &&
      cookie.secure,
  );
  assert.ok(sessionCookie);
  assert.equal(sessionCookie.sameSite, "Lax");
  assert.equal(sessionCookie.path, "/");

  const exportResponse = await firstContext.request.get(
    new URL("/api/account/export", baseUrl).href,
  );
  assert.equal(exportResponse.status(), 200);
  const exportBody = await exportResponse.json();
  assert.equal(exportBody.account.email, first.email);
  assert.equal(containsSecretField(exportBody), false);
  assert.equal(
    /provider_subject|access_token|refresh_token|cookie_password|session_digest|token_digest/i.test(
      JSON.stringify(exportBody),
    ),
    false,
  );
  const crossSiteDelete = await firstContext.request.post(
    new URL("/api/account/delete/request", baseUrl).href,
    {
      headers: {
        origin: "https://attacker.invalid",
        "sec-fetch-site": "cross-site",
        "x-course-design-csrf": "same-origin",
      },
    },
  );
  assert.equal(crossSiteDelete.status(), 404);
  checked(
    "session restoration, cookie security, export, and CSRF",
    "A fresh real WorkOS session restored across pages, kept its secure HttpOnly SameSite=Lax cookie, preserved browser-local state, exported no provider/session secrets, and rejected a cross-site deletion request.",
  );

  const secondContext = await newContext(browser);
  openContexts.add(secondContext);
  const secondPage = await newPage(secondContext);
  setStage(secondPage, "second-authentication-bootstrap");
  await goto(secondPage);
  await seedLocalSentinel(secondPage, secondSentinel);
  await signInWithPassword(secondPage, second);

  setStage(firstPage, "workspace-isolation-first");
  setStage(secondPage, "workspace-isolation-second");
  await goto(firstPage, "/designs/local-spj-04/edit");
  await goto(secondPage, "/designs/local-spj-04/edit");
  await firstPage.getByText("Draft restored from server workspace").waitFor();
  await secondPage.getByText("Draft restored from server workspace").waitFor();
  await firstPage.getByRole("radio", { name: "Red frame" }).click();
  await firstPage.getByText("Draft saved to server workspace").waitFor();
  await secondPage
    .getByRole("radio", { name: "White frame, selected" })
    .waitFor();
  checked(
    "provider-subject workspace isolation",
    "Two real WorkOS staging subjects received distinct private workspaces at the same route key; the second never observed the first subject’s saved draft.",
  );

  const competingPage = await newPage(firstContext);
  setStage(firstPage, "compare-and-swap-primary");
  setStage(competingPage, "compare-and-swap-competing");
  await goto(competingPage, "/designs/local-spj-04/edit");
  await competingPage
    .getByText("Draft restored from server workspace")
    .waitFor();
  await firstPage.getByRole("radio", { name: "Blue frame" }).click();
  await firstPage.getByText("Draft saved to server workspace").waitFor();
  await competingPage.getByRole("radio", { name: "Yellow frame" }).click();
  await competingPage
    .getByRole("button", { name: "Load latest server version" })
    .waitFor();
  await competingPage
    .getByRole("button", { name: "Load latest server version" })
    .scrollIntoViewIfNeeded();
  await screenshot(competingPage, "stale-save-conflict.png");
  await competingPage
    .getByRole("button", { name: "Load latest server version" })
    .click();
  await competingPage
    .getByRole("radio", { name: "Blue frame, selected" })
    .waitFor();
  checked(
    "compare-and-swap conflict recovery",
    "Two tabs in one real account surfaced a stale-save conflict and recovered the winning immutable server truth.",
  );

  setStage(firstPage, "first-account-deletion");
  await goto(firstPage);
  await firstPage.getByRole("button", { name: "Delete account" }).click();
  await firstPage
    .getByText("This permanently deletes the WorkOS account")
    .waitFor();
  await assertViewportFit(firstPage, "Deletion confirmation");
  await screenshot(firstPage, "deletion-confirmation.png");
  await firstPage
    .getByRole("button", { name: "Yes, delete my account" })
    .click();
  await firstPage.getByRole("heading", { name: "Sign in" }).waitFor();
  await assertLocalSentinel(firstPage, firstSentinel);
  assert.equal(
    (await firstContext.cookies(baseUrl)).some(
      (cookie) => cookie.name === "__Host-course-design-auth",
    ),
    false,
  );
  assert.equal(
    (
      await firstContext.request.get(
        new URL("/api/workspace/session", baseUrl).href,
      )
    ).status(),
    401,
  );
  await screenshot(firstPage, "post-deletion-signed-out.png");

  setStage(secondPage, "second-account-deletion");
  await goto(secondPage);
  await deleteCurrentAccount(secondPage);
  await assertLocalSentinel(secondPage, secondSentinel);
  await deleteProviderUserIfPresent(first);
  await deleteProviderUserIfPresent(second);
  report.syntheticUsersDeleted = true;
  checked(
    "account deletion and browser-local preservation",
    "Both synthetic WorkOS users were deleted through the live UI; server access closed while localStorage and IndexedDB sentinels remained intact.",
  );

  await firstContext.close();
  openContexts.delete(firstContext);
  await secondContext.close();
  openContexts.delete(secondContext);

  assert.deepEqual(report.diagnostics.consoleProblems, []);
  assert.deepEqual(report.diagnostics.failedRequests, []);
  assert.deepEqual(report.diagnostics.serverErrors, []);
  assert.deepEqual(report.diagnostics.tokenBearingRequestPaths, []);
  assert.deepEqual(report.diagnostics.authenticationResponseSecretFields, []);
  report.status = "passed";
} catch (error) {
  thrown = error;
  report.status = "failed";
  report.failure =
    error instanceof Error
      ? error.message
      : "Unknown browser acceptance error.";
} finally {
  for (const context of openContexts) {
    await context.close().catch(() => {});
  }
  await browser.close().catch(() => {});
  let cleanupSucceeded = true;
  for (const value of syntheticIdentities) {
    await deleteProviderUserIfPresent(value).catch(() => {
      cleanupSucceeded = false;
    });
  }
  report.syntheticUsersDeleted = cleanupSucceeded;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (thrown) throw thrown;
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
