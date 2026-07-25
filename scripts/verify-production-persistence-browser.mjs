import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl =
  process.env.COURSE_DESIGN_PRODUCTION_URL ??
  "https://coursedesign.onrender.com";
const emailA =
  process.env.COURSE_DESIGN_PRODUCTION_EMAIL_A ??
  "prod-a-1784981175271@example.test";
const emailB =
  process.env.COURSE_DESIGN_PRODUCTION_EMAIL_B ??
  "prod-b-1784981175271@example.test";
const headless =
  process.env.COURSE_DESIGN_PRODUCTION_HEADLESS?.toLowerCase() === "true";
const chromiumPath =
  process.env.COURSE_DESIGN_PRODUCTION_CHROMIUM_PATH ??
  "/Users/timwijnhoven/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const evidenceDirectory = path.resolve("docs/persistence/production-evidence");
const screenshotDirectory = path.join(evidenceDirectory, "screenshots");
const reportPath = path.join(evidenceDirectory, "browser-acceptance.json");
const warning =
  "Unverified email workspace. Anyone who enters this email can access and change this work.";
const sentinel = "production-browser-local-sentinel-20260725";
const localLibraryKey = "course-design.local-design-library.v2";
const localSentinelKey = "course-design.qa-local-sentinel";
const localSilhouetteKey = "course-design.local-silhouette-review.v1";
const desktopViewport = { width: 1440, height: 1000 };

await mkdir(screenshotDirectory, { recursive: true });

const report = {
  schemaVersion: "1.0.0-production-persistence-browser-acceptance",
  generatedAt: new Date().toISOString(),
  baseUrl,
  deploymentMode: null,
  emails: { emailA, emailB },
  identities: {},
  checks: [],
  screenshots: [],
  layouts: [],
  diagnostics: {
    consoleProblems: [],
    failedRequests: [],
    httpErrors: [],
    expectedConflictResponses: [],
    ignoredAbortedRequests: [],
  },
  failure: null,
};

function checked(name, detail = "passed") {
  report.checks.push({ name, detail });
  process.stdout.write(`PASS ${name}\n`);
}

function installDiagnostics(page, label) {
  let workspaceActive = false;
  page.on("console", (message) => {
    const expectedConflictConsole =
      label === "email-a-stale-context" && /status of 409/.test(message.text());
    if (
      workspaceActive &&
      ["warning", "error"].includes(message.type()) &&
      !expectedConflictConsole &&
      !/GroupMarkerNotSet|GL Driver Message|WebGL/.test(message.text())
    ) {
      report.diagnostics.consoleProblems.push(
        `${label} ${message.type()}: ${message.text()}`,
      );
    }
  });
  page.on("requestfailed", (request) => {
    if (!workspaceActive) return;
    const requestUrl = new URL(request.url());
    const entry = `${label} ${request.method()} ${requestUrl.origin}${requestUrl.pathname} ${
      request.failure()?.errorText ?? "failed"
    }`;
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(entry)) {
      report.diagnostics.ignoredAbortedRequests.push(entry);
    } else {
      report.diagnostics.failedRequests.push(entry);
    }
  });
  page.on("response", (response) => {
    if (!workspaceActive || response.status() < 400) return;
    const responseUrl = new URL(response.url());
    if (
      label === "email-a-stale-context" &&
      response.status() === 409 &&
      response.request().method() === "PATCH" &&
      responseUrl.pathname === "/api/designs/local-spj-04"
    ) {
      report.diagnostics.expectedConflictResponses.push(
        `${label} 409 PATCH ${responseUrl.pathname}`,
      );
      return;
    }
    report.diagnostics.httpErrors.push(
      `${label} ${response.status()} ${response.request().method()} ${response.url()}`,
    );
  });
  return {
    activate() {
      workspaceActive = true;
    },
  };
}

async function goto(page, route) {
  await page.goto(`${baseUrl}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
}

async function openWorkspace(page, email, options = {}) {
  await goto(page, "/");
  if (options.seedSentinel) {
    await page.evaluate(
      ({ libraryKey, sentinelKey, value }) => {
        localStorage.setItem(libraryKey, value);
        localStorage.setItem(sentinelKey, value);
      },
      {
        libraryKey: localLibraryKey,
        sentinelKey: localSentinelKey,
        value: sentinel,
      },
    );
  }
  await page.getByText(warning, { exact: true }).waitFor({ timeout: 20_000 });
  if (options.sessionCookies) {
    await page
      .getByText(/Draft version \d+ · \d+ immutable server revision/)
      .waitFor({ timeout: 30_000 });
    return;
  }
  const input = page.getByLabel("Public workspace email");
  if (await input.isVisible()) {
    await input.fill(email);
    let selected = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const selectionResponse = page.waitForResponse(
        (response) =>
          response.url() === `${baseUrl}/api/workspace/select` &&
          response.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page
        .locator(".server-workspace-selector form")
        .evaluate((form) => form.requestSubmit());
      const response = await selectionResponse;
      if (response.status() === 200) {
        selected = true;
        break;
      }
      assert.equal(response.status(), 429);
      await page.waitForTimeout(12_000);
    }
    assert.equal(selected, true, "Workspace selector rate limit did not clear");
  }
  await page
    .getByText(/Draft version \d+ · \d+ immutable server revision/)
    .waitFor({ timeout: 30_000 });
}

async function api(page, route) {
  return page.evaluate(async (pathname) => {
    const response = await fetch(pathname, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = await response.json();
    return { status: response.status, payload };
  }, route);
}

async function workspaceState(page) {
  const [design, revisions, course] = await Promise.all([
    api(page, "/api/designs/local-spj-04"),
    api(page, "/api/designs/local-spj-04/revisions?limit=100"),
    api(page, "/api/courses/local-course-1"),
  ]);
  assert.equal(design.status, 200);
  assert.equal(revisions.status, 200);
  assert.equal(course.status, 200);
  assert.equal(design.payload.ok, true);
  assert.equal(revisions.payload.ok, true);
  assert.equal(course.payload.ok, true);
  return {
    design: design.payload.value,
    revisions: revisions.payload.value.revisions,
    course: course.payload.value,
  };
}

async function screenshot(page, name) {
  const target = path.join(screenshotDirectory, name);
  await page.screenshot({
    path: target,
    fullPage: false,
    animations: "disabled",
    timeout: 30_000,
  });
  report.screenshots.push(path.relative(process.cwd(), target));
}

async function auditLayout(page, label) {
  const result = await page.evaluate(() => {
    const overflowX =
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth;
    const visibleControls = [
      ...document.querySelectorAll("button, a, input, select, textarea"),
    ]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) ??
            element.tagName,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden",
        };
      })
      .filter((item) => item.visible);
    return {
      route: location.pathname + location.search,
      overflowX,
      tooSmall: visibleControls.filter(
        (item) => item.width < 44 || item.height < 44,
      ),
    };
  });
  report.layouts.push({ label, viewport: page.viewportSize(), ...result });
  assert.ok(result.overflowX <= 1, `${label} has horizontal overflow`);
}

async function newWorkspacePage(browser, label, email, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? desktopViewport,
    locale: "en-GB",
    reducedMotion: "reduce",
    ...(options.sessionCookies
      ? {
          storageState: {
            cookies: options.sessionCookies,
            origins: [],
          },
        }
      : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  const diagnostics = installDiagnostics(page, label);
  await openWorkspace(page, email, options);
  diagnostics.activate();
  return { context, page };
}

const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
  ],
});

const contexts = [];
let thrown = null;
try {
  const healthResponse = await fetch(`${baseUrl}/api/persistence/health`, {
    cache: "no-store",
  });
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.deepEqual(
    {
      ok: health.ok,
      mode: health.mode,
      database: health.database,
      migrations: health.migrations,
      runtimeRole: health.runtimeRole,
      objectStorage: health.objectStorage,
    },
    {
      ok: true,
      mode: "server",
      database: "reachable",
      migrations: 3,
      runtimeRole: "coursedesign_app",
      objectStorage: "configured_private_gcs",
    },
  );
  report.deploymentMode = health.mode;
  checked("exact production health reports server mode and restricted runtime");

  const primary = await newWorkspacePage(browser, "email-a-primary", emailA, {
    seedSentinel: true,
  });
  contexts.push(primary.context);
  const pageA = primary.page;
  const emailASessionCookies = await primary.context.cookies(baseUrl);
  await pageA.getByText(warning, { exact: true }).waitFor();
  await pageA
    .getByText(
      "Lab histories, raw uploads, masks, and processing evidence remain on this device.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await pageA
      .evaluate(
        ({ libraryKey, sentinelKey }) => ({
          library: localStorage.getItem(libraryKey),
          sentinel: localStorage.getItem(sentinelKey),
        }),
        { libraryKey: localLibraryKey, sentinelKey: localSentinelKey },
      )
      .then((value) => value.library),
    sentinel,
  );
  await screenshot(pageA, "03-email-a-restored-home.png");
  await auditLayout(pageA, "email-a-restored-home");
  checked("email A visibly opens with the exact unverified-workspace warning");

  const initialA = await workspaceState(pageA);
  const spjRevision = initialA.revisions.find(
    (revision) =>
      revision.designId === "local-spj-04" && revision.ordinal === 1,
  );
  assert.ok(spjRevision, "Email A must contain SPJ-04 Revision 01");
  assert.equal(spjRevision.snapshot.configuration.frameColor, "red");
  assert.equal(initialA.design.draft.intent.artwork, "custom_artwork");
  assert.match(spjRevision.configurationHash, /^c53f04ef3a83[0-9a-f]{52}$/);
  report.identities.spjRevisionId = spjRevision.revisionId;
  report.identities.spjConfigurationHash = spjRevision.configurationHash;
  report.identities.restoredDraftFrameColor =
    initialA.design.draft.intent.frameColor;
  report.identities.spjArtworkHashes = [
    ...new Set(
      [
        spjRevision.snapshot.configuration.artworkConfiguration?.left
          ?.renderContentHash,
        spjRevision.snapshot.configuration.artworkConfiguration?.right
          ?.renderContentHash,
      ].filter(Boolean),
    ),
  ];

  await goto(pageA, "/designs/local-spj-04/edit");
  await pageA.getByTestId("local-save-status").waitFor();
  const restoredFrameLabel =
    initialA.design.draft.intent.frameColor[0].toUpperCase() +
    initialA.design.draft.intent.frameColor.slice(1);
  await pageA
    .getByRole("radio", { name: `${restoredFrameLabel} frame, selected` })
    .waitFor();
  await pageA.getByText("Custom artwork · linked wings").waitFor();
  await pageA
    .getByText(/Club Classic · Revision 1/)
    .waitFor({ timeout: 20_000 });
  checked(
    "email A restores the identical SPJ-04 draft, linked artwork, and immutable red revision",
    `revision=${spjRevision.revisionId} config=${spjRevision.configurationHash}`,
  );

  await goto(
    pageA,
    `/courses/local-course-1?revision=${encodeURIComponent(
      spjRevision.revisionId,
    )}`,
  );
  await pageA.getByTestId("course-save-status").waitFor();
  let courseState = (await workspaceState(pageA)).course;
  if (courseState.draft.instances.length === 0) {
    await pageA
      .getByText(
        "Requested revision selected and ready to place. Nothing was placed automatically.",
        { exact: true },
      )
      .waitFor();
    await pageA.getByRole("button", { name: "Place in center" }).click();
    await pageA
      .getByTestId("course-save-status")
      .filter({ hasText: "Course saved to server workspace" })
      .waitFor({ timeout: 20_000 });
    courseState = (await workspaceState(pageA)).course;
  }
  assert.equal(courseState.draft.instances.length, 1);
  assert.equal(
    courseState.draft.instances[0].obstacleDesignRevisionId,
    spjRevision.revisionId,
  );
  report.identities.courseLockVersion = courseState.lockVersion;
  await pageA
    .locator(`[data-revision-id="${spjRevision.revisionId}"]`)
    .waitFor();
  await screenshot(pageA, "04-email-a-exact-revision-pinned-course.png");
  await auditLayout(pageA, "email-a-pinned-course");
  checked("course pins the exact immutable SPJ-04 revision");

  const restored = await newWorkspacePage(
    browser,
    "email-a-fresh-context",
    emailA,
  );
  contexts.push(restored.context);
  const restoredA = restored.page;
  await restoredA
    .getByText("pinned placements", { exact: true })
    .locator("..")
    .filter({ hasText: /^1pinned placements$/ })
    .waitFor();
  const restoredState = await workspaceState(restoredA);
  assert.deepEqual(restoredState.design.draft, initialA.design.draft);
  assert.equal(
    restoredState.revisions.find(
      (revision) => revision.revisionId === spjRevision.revisionId,
    )?.configurationHash,
    spjRevision.configurationHash,
  );
  assert.equal(restoredState.course.draft.instances.length, 1);
  assert.equal(
    restoredState.course.draft.instances[0].obstacleDesignRevisionId,
    spjRevision.revisionId,
  );
  await goto(restoredA, "/courses/local-course-1");
  await restoredA
    .locator(`[data-revision-id="${spjRevision.revisionId}"]`)
    .waitFor();
  await restoredA.getByRole("button", { name: /Obstacle 1,/ }).waitFor();
  checked(
    "fresh email-A context restores identical design, artwork, revision, and course",
  );

  const isolated = await newWorkspacePage(browser, "email-b-isolated", emailB);
  contexts.push(isolated.context);
  const pageB = isolated.page;
  const stateB = await workspaceState(pageB);
  assert.equal(stateB.design.draft.draftVersion, 1);
  assert.equal(stateB.revisions.length, 0);
  assert.equal(stateB.course.draft.instances.length, 0);
  await goto(pageB, "/designs/local-spj-04/edit");
  await pageB.getByRole("radio", { name: "White frame, selected" }).waitFor();
  await goto(pageB, "/");
  await pageB
    .getByText(/Draft version 1 · 0 immutable server revisions/)
    .waitFor();
  await pageB
    .getByText("pinned placements", { exact: true })
    .locator("..")
    .filter({ hasText: /^0pinned placements$/ })
    .waitFor();
  await screenshot(pageB, "05-email-b-isolated-empty-workspace.png");
  checked("email B is completely isolated and starts clean");

  const newer = await newWorkspacePage(
    browser,
    "email-a-newer-context",
    emailA,
    { sessionCookies: emailASessionCookies },
  );
  const stale = await newWorkspacePage(
    browser,
    "email-a-stale-context",
    emailA,
    { sessionCookies: emailASessionCookies },
  );
  contexts.push(newer.context, stale.context);
  await Promise.all([
    goto(newer.page, "/designs/local-spj-04/edit"),
    goto(stale.page, "/designs/local-spj-04/edit"),
  ]);
  await Promise.all([
    newer.page.getByTestId("local-save-status").waitFor(),
    stale.page.getByTestId("local-save-status").waitFor(),
  ]);
  const newerColor =
    initialA.design.draft.intent.frameColor === "yellow" ? "red" : "yellow";
  const newerColorLabel = newerColor[0].toUpperCase() + newerColor.slice(1);
  await newer.page
    .getByRole("radio", { name: new RegExp(`^${newerColorLabel} frame`) })
    .click();
  await newer.page
    .getByTestId("local-save-status")
    .filter({ hasText: "Draft saved to server workspace" })
    .waitFor();
  await stale.page.getByRole("radio", { name: /^Blue frame/ }).click();
  await stale.page
    .getByRole("alert")
    .filter({ hasText: "Your attempted edit was not overwritten." })
    .waitFor();
  await stale.page
    .getByTestId("local-save-status")
    .filter({
      hasText:
        "Conflict: this design changed elsewhere. Your attempted edit is preserved.",
    })
    .waitFor();
  await stale.page
    .getByRole("alert")
    .filter({ hasText: "Your attempted edit was not overwritten." })
    .evaluate((alert) => alert.scrollIntoView({ block: "center" }));
  await screenshot(stale.page, "06-stale-context-explicit-conflict.png");
  await stale.page
    .getByRole("button", { name: "Load latest server version" })
    .click();
  await stale.page
    .getByRole("radio", { name: `${newerColorLabel} frame, selected` })
    .waitFor();
  const afterConflict = await workspaceState(stale.page);
  assert.equal(afterConflict.design.draft.intent.frameColor, newerColor);
  assert.notEqual(afterConflict.design.draft.intent.frameColor, "blue");
  checked(
    "stale email-A context receives explicit conflict recovery without overwriting newer work",
  );

  const sentinelState = await pageA.evaluate(
    ({ libraryKey, sentinelKey, reviewKey }) => ({
      library: localStorage.getItem(libraryKey),
      sentinel: localStorage.getItem(sentinelKey),
      review: localStorage.getItem(reviewKey),
      visible: document.body.innerText.includes(
        "production-browser-local-sentinel-20260725",
      ),
    }),
    {
      libraryKey: localLibraryKey,
      sentinelKey: localSentinelKey,
      reviewKey: localSilhouetteKey,
    },
  );
  assert.equal(sentinelState.library, sentinel);
  assert.equal(sentinelState.sentinel, sentinel);
  assert.equal(sentinelState.review, null);
  assert.equal(sentinelState.visible, false);
  checked(
    "existing browser-local data remains intact and is neither imported nor displayed as server data",
  );

  await goto(pageA, "/lab/silhouettes");
  await pageA
    .getByRole("heading", {
      name: "Review the silhouette, not an obstacle.",
    })
    .waitFor();
  const acceptButton = pageA.getByRole("button", {
    name: "Accept for future prototyping",
  });
  await acceptButton.waitFor();
  assert.equal(await acceptButton.isEnabled(), true);
  const fixtureId = await pageA
    .locator(".silhouette-fixture-row[aria-pressed='true']")
    .locator("strong")
    .innerText();
  let localHistory = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await acceptButton.click({ force: true });
    await pageA.waitForTimeout(500);
    localHistory = await pageA.evaluate(
      (key) => localStorage.getItem(key),
      localSilhouetteKey,
    );
    if (
      localHistory?.includes(fixtureId) &&
      localHistory.includes("accepted_for_future_prototyping")
    ) {
      break;
    }
  }
  assert.ok(localHistory?.includes(fixtureId));
  assert.ok(localHistory?.includes("accepted_for_future_prototyping"));
  assert.equal(
    await pageA.evaluate((key) => localStorage.getItem(key), localLibraryKey),
    sentinel,
  );
  const beforeProfile = await workspaceState(pageA);
  let profileRevision = beforeProfile.revisions.find(
    (revision) =>
      revision.familyId === "profile-wing-vertical-v1" &&
      revision.snapshot?.provenance?.sourceFixtureId === fixtureId,
  );
  if (!profileRevision) {
    await goto(pageA, "/studio/obstacles/profile-wing");
    await pageA
      .getByRole("heading", { name: "One polygon. Two faithful views." })
      .waitFor({ timeout: 30_000 });
    await pageA
      .getByRole("button", { name: "Save immutable generated revision" })
      .click({ force: true });
    await pageA
      .getByTestId("profile-wing-library-status")
      .filter({
        hasText:
          "Immutable generated-prototype revision saved. Existing course placements were not changed.",
      })
      .waitFor({ timeout: 30_000 });
    profileRevision = (await workspaceState(pageA)).revisions.find(
      (revision) =>
        revision.familyId === "profile-wing-vertical-v1" &&
        revision.snapshot?.provenance?.sourceFixtureId === fixtureId,
    );
  }
  assert.ok(profileRevision, "Profile Wing revision must be server-backed");
  const afterProfile = await workspaceState(pageA);
  report.identities.profileFixtureId = fixtureId;
  report.identities.profileRevisionId = profileRevision.revisionId;
  report.identities.profileConfigurationHash =
    profileRevision.configurationHash;
  assert.equal(afterProfile.course.draft.instances.length, 1);
  assert.equal(
    afterProfile.course.draft.instances[0].obstacleDesignRevisionId,
    spjRevision.revisionId,
  );
  await goto(pageA, "/designs");
  await pageA.getByRole("heading", { name: "Profile Wing Vertical" }).waitFor();
  await screenshot(pageA, "07-email-a-profile-wing-server-revision.png");
  checked(
    "final Profile Wing canonical derivative and immutable revision save to email A",
    `revision=${profileRevision.revisionId} fixture=${fixtureId}`,
  );

  const otherDevice = await newWorkspacePage(
    browser,
    "email-a-fresh-device",
    emailA,
  );
  contexts.push(otherDevice.context);
  const devicePage = otherDevice.page;
  assert.equal(
    await devicePage.evaluate(
      (key) => localStorage.getItem(key),
      localSilhouetteKey,
    ),
    null,
  );
  await goto(devicePage, "/designs");
  await devicePage
    .getByRole("heading", { name: "Profile Wing Vertical" })
    .waitFor();
  const deviceState = await workspaceState(devicePage);
  assert.equal(
    deviceState.revisions.find(
      (revision) => revision.revisionId === profileRevision.revisionId,
    )?.configurationHash,
    profileRevision.configurationHash,
  );
  assert.equal(
    await devicePage.evaluate(
      (key) => localStorage.getItem(key),
      localSilhouetteKey,
    ),
    null,
  );
  await screenshot(
    devicePage,
    "08-email-a-profile-wing-restored-fresh-device.png",
  );
  checked(
    "final Profile Wing revision crosses devices while processing history remains local",
  );

  const mobile = await newWorkspacePage(
    browser,
    "email-a-mobile-context",
    emailA,
    {
      viewport: { width: 390, height: 844 },
      sessionCookies: emailASessionCookies,
    },
  );
  contexts.push(mobile.context);
  await auditLayout(mobile.page, "email-a-mobile-home");
  await screenshot(mobile.page, "09-email-a-mobile-restored-home.png");
  await goto(mobile.page, "/designs");
  await mobile.page
    .getByRole("heading", { name: "Profile Wing Vertical" })
    .waitFor();
  await auditLayout(mobile.page, "email-a-mobile-design-library");
  checked(
    "production restoration remains usable at a realistic mobile viewport",
  );

  await goto(restoredA, "/designs");
  await restoredA.getByRole("heading", { name: "Designs" }).waitFor();
  await goto(restoredA, "/courses/local-course-1/review");
  await restoredA.getByTestId("placement-register").waitFor();
  assert.match(
    await restoredA.getByTestId("placement-register").innerText(),
    new RegExp(spjRevision.revisionId),
  );
  await goto(restoredA, "/");
  await restoredA
    .getByText("pinned placements", { exact: true })
    .locator("..")
    .filter({ hasText: /^1pinned placements$/ })
    .waitFor();
  checked(
    "exploratory production pass covers Home, Designs, Course edit, and Course review",
  );

  assert.deepEqual(report.diagnostics.consoleProblems, []);
  assert.deepEqual(report.diagnostics.failedRequests, []);
  assert.deepEqual(report.diagnostics.httpErrors, []);
  assert.equal(report.diagnostics.expectedConflictResponses.length, 1);
  checked("production browser diagnostics are clean");
} catch (error) {
  thrown = error;
  report.failure =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "UnknownError", message: String(error) };
  process.stderr.write(`${report.failure.name}: ${report.failure.message}\n`);
} finally {
  for (const context of contexts.reverse()) {
    await context.close().catch(() => undefined);
  }
  await browser.close();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (thrown) throw thrown;

process.stdout.write(
  `Production persistence browser acceptance passed: ${report.checks.length} checks, ${report.screenshots.length} screenshots.\n`,
);
