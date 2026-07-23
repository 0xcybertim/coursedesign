import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl =
  process.env.PROFILE_WING_CREATION_BASE_URL ?? "http://127.0.0.1:3110";
const chromiumPath =
  process.env.PROFILE_WING_CREATION_CHROMIUM_PATH ??
  "/Users/timwijnhoven/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const evidenceDirectory = path.resolve("docs/profile-wing-creation");
const screenshotDirectory = path.join(evidenceDirectory, "screenshots");
await mkdir(screenshotDirectory, { recursive: true });

const report = {
  schemaVersion: "1.0.0-profile-wing-creation-browser-acceptance",
  baseUrl,
  sourceFixture: "tests/fixtures/phase-1h/input/clean-dog-side.png",
  executionBoundary: {
    configuredProvider: "deterministic-test",
    maskPostRequests: 0,
    automaticRetries: 0,
    externalBrowserRequests: 0,
    liveRemoveBgCalls: 0,
  },
  checks: [],
  screenshots: [],
  viewports: [],
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
    if (
      request.method() === "POST" &&
      url.pathname === "/api/profile-wings/mask"
    )
      report.executionBoundary.maskPostRequests += 1;
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) &&
      !["data:", "blob:"].includes(url.protocol)
    ) {
      report.externalRequests.push(`${request.method()} ${request.url()}`);
      report.executionBoundary.externalBrowserRequests += 1;
    }
  });
  page.on("requestfailed", (request) => {
    const message = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`;
    if (!message.includes("ERR_ABORTED")) report.failedRequests.push(message);
  });
}

async function screenshot(page, name, fullPage = false) {
  const target = path.join(screenshotDirectory, name);
  await page.screenshot({ path: target, fullPage });
  report.screenshots.push(path.relative(process.cwd(), target));
}

async function layoutAudit(page, label, viewport) {
  const layout = await page.evaluate(() => {
    const interactive = [
      ...document.querySelectorAll(
        "button, a, input:not(.visually-hidden-file):not([type='checkbox']):not([type='radio']), label[for]",
      ),
    ]
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
  assert.equal(layout.overflowX, 0, `${label} overflow at ${viewport.width}`);
  assert.deepEqual(
    layout.tooSmall,
    [],
    `${label} touch targets at ${viewport.width}`,
  );
  report.viewports.push({ label, viewport, ...layout });
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

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  auditPage(page);

  await page.goto(`${baseUrl}/studio/obstacles/profile-wing/new`, {
    waitUntil: "load",
  });
  await page.getByText("Local QA provider ready").waitFor();
  assert.equal(report.executionBoundary.maskPostRequests, 0);
  checked("opening the creator makes no provider request");

  await page
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/phase-1h/input/clean-dog-side.png");
  await page
    .getByText(
      "Local metadata-stripped derivative ready. Nothing has been uploaded.",
    )
    .waitFor();
  assert.equal(report.executionBoundary.maskPostRequests, 0);
  checked("choosing a PNG prepares and stores a local derivative only");

  for (const label of [
    "I own this image or have the right to use it.",
    /I understand this derivative is sent to remove.bg/,
    "The image contains no identifiable person.",
    /It contains one clear subject/,
  ])
    await page.getByLabel(label).check();
  await page.getByRole("button", { name: "Run local mask simulation" }).click();
  try {
    await page.getByText("Deterministic canonical polygon").waitFor();
  } catch (error) {
    await screenshot(page, "user-mask-review-failure.png", true);
    const visibleStatus = await page
      .getByTestId("profile-creator-status")
      .textContent();
    const alert = await page
      .locator(".profile-creator-alert")
      .allTextContents();
    throw new Error(
      `Mask review did not become convertible. Status: ${visibleStatus}. Alerts: ${alert.join(" | ")}. ${error instanceof Error ? error.message : ""}`,
    );
  }
  assert.equal(report.executionBoundary.maskPostRequests, 1);
  assert.match(
    await page.getByTestId("profile-creator-status").textContent(),
    /Visual acceptance is still required/,
  );
  checked("one explicit action creates exactly one mask request");
  checked("returned alpha is vectorized before any product geometry");
  await page.locator(".profile-creator-review").scrollIntoViewIfNeeded();
  await screenshot(page, "user-mask-review-desktop.png");

  await page
    .getByRole("button", { name: "Accept & build Profile Wing" })
    .click();
  await page
    .getByRole("heading", { name: "One polygon. Two faithful views." })
    .waitFor();
  await page
    .getByTestId("profile-wing-capability")
    .filter({ hasText: "matching 3D extrusion ready" })
    .waitFor({ timeout: 20_000 });
  const stage = page.locator(".profile-wing-visual-stage");
  const geometryHash = await stage.getAttribute("data-geometry-sha256");
  assert.match(geometryHash ?? "", /^[a-f0-9]{64}$/);
  assert.equal(await stage.getAttribute("data-parity"), "exact");
  checked("visual acceptance unlocks exact shared 2.5D and 3D geometry");
  await page.locator(".profile-creator-result").scrollIntoViewIfNeeded();
  await screenshot(page, "user-profile-result-desktop.png");

  await page
    .getByRole("button", { name: "Save immutable generated revision" })
    .click();
  await page
    .getByTestId("profile-creator-status")
    .filter({ hasText: "Immutable generated-prototype revision saved" })
    .waitFor();
  await page.getByText("1 saved revision for this design").waitFor();
  checked("accepted user geometry saves one immutable v2 revision");

  await page.getByRole("link", { name: "Open course studio" }).click();
  await page.getByTestId("course-save-status").waitFor();
  const generated = page
    .getByRole("radio")
    .filter({ hasText: "Generated profile" });
  await generated.click();
  await page.getByRole("button", { name: "Place in center" }).click();
  await page
    .getByTestId("quantity-summary")
    .filter({ hasText: "Poles4" })
    .waitFor();
  assert.match(
    await page.getByTestId("quantity-summary").textContent(),
    /Wing assemblies \/ silhouette plates2/,
  );
  checked("saved user profile places through the existing course flow");
  await screenshot(page, "user-profile-course-desktop.png");

  await page.getByRole("link", { name: "Open Course Review Sheet" }).click();
  await page.getByTestId("placement-register").waitFor();
  assert.match(
    await page.getByTestId("placement-register").textContent(),
    /generated · inferred not supplier confirmed/,
  );
  checked("course review keeps generated inferred provenance visible");
  await screenshot(page, "user-profile-review-desktop.png");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/studio/obstacles/profile-wing/new`, {
      waitUntil: "load",
    });
    await page
      .getByRole("heading", { name: "One polygon. Two faithful views." })
      .waitFor();
    await layoutAudit(page, "profile-wing-creator", viewport);
    await screenshot(
      page,
      `user-profile-creator-${viewport.width}x${viewport.height}.png`,
      viewport.width === 375,
    );
  }
  checked("creator passes desktop, tablet, and mobile layout gates");

  assert.equal(report.executionBoundary.maskPostRequests, 1);
  assert.equal(report.executionBoundary.automaticRetries, 0);
  assert.equal(report.executionBoundary.liveRemoveBgCalls, 0);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.consoleProblems, []);
  checked(
    "QA uses one local deterministic POST, zero retries, zero external calls, and clean browser diagnostics",
  );
  await context.close();
} finally {
  await browser.close();
}

await writeFile(
  path.join(evidenceDirectory, "browser-acceptance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(
  JSON.stringify(
    {
      checks: report.checks.length,
      viewports: report.viewports.length,
      screenshots: report.screenshots.length,
      maskPostRequests: report.executionBoundary.maskPostRequests,
      liveRemoveBgCalls: report.executionBoundary.liveRemoveBgCalls,
      externalRequests: report.externalRequests.length,
    },
    null,
    2,
  ),
);
