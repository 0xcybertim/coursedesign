import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  LOCAL_SILHOUETTE_REVIEW_KEY,
  appendSilhouetteDecision,
  createEmptySilhouetteReview,
  serializeLocalSilhouetteReview,
} from "../src/domain/silhouette/review.ts";

const LOCAL_DESIGN_LIBRARY_STORAGE_KEY =
  "course-design.local-design-library.v2";
const LOCAL_WORKSPACE_STORAGE_KEY = "course-design.spj-04.local-workspace.v1";
const COURSE_STORAGE_KEY = "course-design.local-course-1.v1";

const baseUrl = process.env.PHASE_1H_BASE_URL ?? "http://127.0.0.1:3000";
const chromiumPath =
  process.env.PHASE_1H_CHROMIUM_PATH ??
  "/Users/timwijnhoven/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const evidenceDirectory = path.resolve("docs/phase-1h");
const screenshotDirectory = path.join(
  evidenceDirectory,
  "phase-1h-end-to-end-screenshots",
);
await mkdir(screenshotDirectory, { recursive: true });

const accepted = appendSilhouetteDecision(createEmptySilhouetteReview(), {
  decisionId: "phase-1h-browser-profile-decision",
  fixtureId: "clean-dog-side",
  action: "accepted_for_future_prototyping",
  createdAt: "2026-07-23T08:02:00.000Z",
});
assert.equal(accepted.ok, true);
const reviewSerialized = serializeLocalSilhouetteReview(accepted.value);

const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
  ],
});

const report = {
  schemaVersion: "1.0.0-phase1h-end-to-end-browser-acceptance",
  baseUrl,
  fixtureId: "clean-dog-side",
  executionBoundary: {
    externalProviderCallsMade: 0,
    retriesMade: 0,
    productApiPostCallsMade: 0,
  },
  checks: [],
  hashes: {},
  revisionIds: {},
  viewports: [],
  screenshots: [],
  consoleProblems: [],
  failedRequests: [],
  externalRequests: [],
};

function checked(name, detail = "passed") {
  report.checks.push({ name, detail });
}

function auditPage(page) {
  page.on("console", (message) => {
    if (
      ["warning", "error"].includes(message.type()) &&
      !/GroupMarkerNotSet|GL Driver Message/.test(message.text())
    )
      report.consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST")
      report.executionBoundary.productApiPostCallsMade += 1;
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) &&
      !["data:", "blob:"].includes(url.protocol)
    )
      report.externalRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on("requestfailed", (request) => {
    const entry = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`;
    if (!entry.includes("ERR_ABORTED")) report.failedRequests.push(entry);
  });
}

async function seed(context, entries) {
  await context.addInitScript((items) => {
    for (const [key, value] of items) localStorage.setItem(key, value);
  }, entries);
}

async function layoutAudit(page, route, viewport) {
  const layout = await page.evaluate(() => {
    const interactive = [...document.querySelectorAll("button, a")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim() ??
            element.tagName,
          width: rect.width,
          height: rect.height,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden",
        };
      })
      .filter((item) => item.visible);
    return {
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      tooSmall: interactive.filter(
        (item) => item.width < 44 || item.height < 44,
      ),
    };
  });
  assert.equal(layout.overflowX, 0, `${route} overflow at ${viewport.width}`);
  assert.deepEqual(
    layout.tooSmall,
    [],
    `${route} touch targets at ${viewport.width}`,
  );
  report.viewports.push({ route, viewport, ...layout });
}

let finalLibrarySerialized;
let finalCourseSerialized;
let legacySerialized;
let legacyHash;

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await seed(context, [[LOCAL_SILHOUETTE_REVIEW_KEY, reviewSerialized]]);
  const page = await context.newPage();
  auditPage(page);

  await page.goto(`${baseUrl}/studio/obstacles/spj-04?force3d=fail`, {
    waitUntil: "load",
  });
  await page.getByTestId("local-save-status").waitFor();
  await page.getByRole("button", { name: "Save immutable revision" }).click();
  await page.getByText("Club Classic · Revision 1").waitFor();
  const seedLibrarySerialized = await page.evaluate(
    (key) => localStorage.getItem(key),
    LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  );
  assert.ok(seedLibrarySerialized);
  const seedLibrary = JSON.parse(seedLibrarySerialized);
  assert.equal(seedLibrary.spj04Workspace.revisions.length, 1);
  const legacySpjRevisionId =
    seedLibrary.spj04Workspace.revisions[0].revisionId;
  legacyHash = seedLibrary.spj04Workspace.revisions[0].configurationHash;
  report.revisionIds.legacySpj04 = legacySpjRevisionId;
  report.hashes.legacySpj04Configuration = legacyHash;
  legacySerialized = JSON.stringify(seedLibrary.spj04Workspace);
  await page.evaluate(
    ([libraryKey, legacyKey, legacyValue]) => {
      localStorage.removeItem(libraryKey);
      localStorage.setItem(legacyKey, legacyValue);
    },
    [
      LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
      LOCAL_WORKSPACE_STORAGE_KEY,
      legacySerialized,
    ],
  );

  await page.goto(
    `${baseUrl}/studio/obstacles/profile-wing?fixture=clean-dog-side`,
    { waitUntil: "load" },
  );
  await page
    .getByTestId("profile-wing-capability")
    .filter({ hasText: "matching 3D extrusion ready" })
    .waitFor({ timeout: 20_000 });
  checked("accepted silhouette renders matching 2.5D and 3D");

  await page
    .getByRole("button", { name: "Save immutable generated revision" })
    .click();
  await page
    .getByTestId("profile-wing-library-status")
    .filter({ hasText: "Immutable generated-prototype revision saved" })
    .waitFor();
  const firstLibrarySerialized = await page.evaluate(
    (key) => localStorage.getItem(key),
    LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  );
  assert.ok(firstLibrarySerialized);
  const firstLibrary = JSON.parse(firstLibrarySerialized);
  assert.equal(
    firstLibrary.spj04Workspace.revisions[0].revisionId,
    legacySpjRevisionId,
  );
  assert.equal(
    firstLibrary.spj04Workspace.revisions[0].configurationHash,
    legacyHash,
  );
  assert.equal(firstLibrary.profileWingRevisions.length, 1);
  const firstProfileRevision = firstLibrary.profileWingRevisions[0].revisionId;
  report.revisionIds.firstGeneratedProfile = firstProfileRevision;
  assert.equal(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      LOCAL_WORKSPACE_STORAGE_KEY,
    ),
    legacySerialized,
  );
  checked("v1 imported once with legacy ID and hash preserved");
  checked("legacy key remains byte-for-byte untouched");
  checked("generated prototype revision saved immutably in v2");

  await page.getByRole("link", { name: "Open course studio" }).click();
  await page.getByTestId("course-save-status").waitFor();
  const profileRadio = page
    .getByRole("radio")
    .filter({ hasText: "Generated profile" });
  await profileRadio.click();
  await page.getByRole("button", { name: "Place in center" }).click();
  const spjRadio = page.getByRole("radio").filter({ hasText: "white frame" });
  await spjRadio.click();
  await page.getByRole("button", { name: "Place in center" }).click();
  await page
    .getByTestId("quantity-summary")
    .filter({ hasText: "Poles8" })
    .waitFor();
  assert.match(
    await page.getByTestId("quantity-summary").textContent(),
    /Wing assemblies \/ silhouette plates4/,
  );
  checked("mixed-family course placement aggregates exact pinned quantities");

  finalCourseSerialized = await page.evaluate(
    (key) => localStorage.getItem(key),
    COURSE_STORAGE_KEY,
  );
  assert.ok(finalCourseSerialized);
  const course = JSON.parse(finalCourseSerialized);
  assert.deepEqual(
    course.instances.map((item) => item.obstacleDesignRevisionId),
    [firstProfileRevision, legacySpjRevisionId],
  );

  await page.getByRole("link", { name: "Open Course Review Sheet" }).click();
  await page.getByTestId("placement-register").waitFor();
  assert.match(
    await page.getByTestId("placement-register").textContent(),
    /generated · inferred not supplier confirmed/,
  );
  checked("course review exposes generated inferred non-supplier provenance");

  await page.goto(
    `${baseUrl}/studio/obstacles/profile-wing?fixture=clean-dog-side&force3d=fail`,
    { waitUntil: "load" },
  );
  await page
    .getByTestId("profile-wing-capability")
    .filter({ hasText: "intentionally disabled" })
    .waitFor();
  await page
    .getByRole("button", { name: "Save immutable generated revision" })
    .click();
  await page.getByText("Revision 02").waitFor();
  finalLibrarySerialized = await page.evaluate(
    (key) => localStorage.getItem(key),
    LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  );
  const finalLibrary = JSON.parse(finalLibrarySerialized);
  assert.equal(finalLibrary.profileWingRevisions.length, 2);
  report.revisionIds.secondGeneratedProfile =
    finalLibrary.profileWingRevisions[1].revisionId;

  const unchangedCourse = JSON.parse(
    await page.evaluate((key) => localStorage.getItem(key), COURSE_STORAGE_KEY),
  );
  assert.equal(
    unchangedCourse.instances[0].obstacleDesignRevisionId,
    firstProfileRevision,
  );
  checked("newer generated revision does not repin an existing placement");
  checked("forced 3D failure preserves saveable exact 2.5D geometry");
  await context.close();

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    const responsiveContext = await browser.newContext({ viewport });
    await seed(responsiveContext, [
      [LOCAL_DESIGN_LIBRARY_STORAGE_KEY, finalLibrarySerialized],
      [LOCAL_SILHOUETTE_REVIEW_KEY, reviewSerialized],
      [COURSE_STORAGE_KEY, finalCourseSerialized],
      [LOCAL_WORKSPACE_STORAGE_KEY, legacySerialized],
    ]);
    const responsivePage = await responsiveContext.newPage();
    auditPage(responsivePage);
    for (const [route, readyTestId] of [
      ["/studio/courses/local-course-1", "quantity-summary"],
      ["/studio/courses/local-course-1/review", "placement-register"],
    ]) {
      await responsivePage.goto(`${baseUrl}${route}`, { waitUntil: "load" });
      await responsivePage.getByTestId(readyTestId).waitFor();
      await layoutAudit(responsivePage, route, viewport);
      const routeName = route.endsWith("review") ? "review" : "course";
      const screenshotName = `${routeName}-${viewport.width}x${viewport.height}.png`;
      const screenshotPath = path.join(screenshotDirectory, screenshotName);
      await responsivePage.screenshot({
        path: screenshotPath,
        fullPage: true,
      });
      report.screenshots.push(path.relative(process.cwd(), screenshotPath));
    }
    await responsiveContext.close();
  }
  checked("course and review pass desktop, tablet, and mobile layout gates");

  assert.equal(report.executionBoundary.productApiPostCallsMade, 0);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.consoleProblems, []);
  checked(
    "zero POST, provider, external, failed-request, and console-error activity",
  );
} finally {
  await browser.close();
}

await writeFile(
  path.join(evidenceDirectory, "phase-1h-end-to-end-browser-acceptance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      checks: report.checks.length,
      viewports: report.viewports.length,
      screenshots: report.screenshots.length,
      legacyHash: report.hashes.legacySpj04Configuration,
      firstProfileRevision: report.revisionIds.firstGeneratedProfile,
      externalCalls: report.executionBoundary.externalProviderCallsMade,
    },
    null,
    2,
  ),
);
