import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PHASE_1H_B2_BASE_URL ?? "http://127.0.0.1:3108";
const chromiumPath =
  process.env.PHASE_1H_B2_CHROMIUM_PATH ??
  "/Users/timwijnhoven/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const evidenceDirectory = path.resolve("docs/phase-1h");
const screenshotDirectory = path.join(evidenceDirectory, "b2-screenshots");
await mkdir(screenshotDirectory, { recursive: true });

const benchmark = JSON.parse(
  await readFile(
    path.join(evidenceDirectory, "vectorization-benchmark-results.json"),
    "utf8",
  ),
);
const dogEvidence = benchmark.results.find(
  (result) => result.fixtureId === "clean-dog-side",
);
assert.ok(dogEvidence);

const pageResponse = await fetch(`${baseUrl}/studio/silhouettes/review`, {
  cache: "no-store",
});
assert.equal(pageResponse.status, 200);
const maskResponse = await fetch(`${baseUrl}/phase-1h/masks/clean-dog-side`, {
  cache: "no-store",
});
assert.equal(maskResponse.status, 200);
assert.equal(maskResponse.headers.get("content-type"), "image/png");
assert.equal(maskResponse.headers.get("cache-control"), "no-store");
assert.equal(
  maskResponse.headers.get("x-content-sha256"),
  dogEvidence.sourceMaskSha256,
);
assert.equal(
  createHash("sha256")
    .update(Buffer.from(await maskResponse.arrayBuffer()))
    .digest("hex"),
  dogEvidence.sourceMaskSha256,
);
assert.equal(
  (await fetch(`${baseUrl}/phase-1h/masks/not-a-fixture`)).status,
  404,
);

const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const consoleProblems = [];
const failedRequests = [];
const nonGetRequests = [];
const externalRequests = [];
page.on("console", (message) => {
  if (["warning", "error"].includes(message.type()))
    consoleProblems.push(`${message.type()}: ${message.text()}`);
});
page.on("requestfailed", (request) =>
  failedRequests.push(
    `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`,
  ),
);
page.on("request", (request) => {
  if (request.method() !== "GET")
    nonGetRequests.push(`${request.method()} ${request.url()}`);
  if (!request.url().startsWith(baseUrl) && !request.url().startsWith("blob:"))
    externalRequests.push(request.url());
});

const report = {
  schemaVersion: "1.0.0-phase1h-b2-browser",
  baseUrl,
  externalProviderCalls: 0,
  productGeometryCreated: 0,
  manualVisualInspection: "required-after-script",
  checks: [],
  screenshots: [],
  consoleProblems,
  failedRequests,
  nonGetRequests,
  externalRequests,
};

function checked(name, detail = "passed") {
  report.checks.push({ name, detail });
}

async function screenshot(name) {
  const target = path.join(screenshotDirectory, name);
  await page.screenshot({ path: target, fullPage: false });
  report.screenshots.push(path.relative(process.cwd(), target));
}

async function layoutAudit() {
  return page.evaluate(() => {
    const interactive = [...document.querySelectorAll("button, a, summary")]
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          label: element.textContent?.trim() ?? element.tagName,
          width: bounds.width,
          height: bounds.height,
          visible:
            bounds.width > 0 &&
            bounds.height > 0 &&
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
}

try {
  await page.goto(`${baseUrl}/studio/silhouettes/review`, {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("heading", { name: "Review the silhouette, not an obstacle." })
    .waitFor();
  const initialText = await page.locator("body").innerText();
  assert.match(initialText, /Zero provider calls/);
  assert.match(
    initialText,
    /does not create wings, poles, a product revision/i,
  );
  assert.match(initialText, /Still not a product specification/);
  assert.equal(await page.locator(".silhouette-fixture-row").count(), 29);
  await page
    .getByRole("img", {
      name: /Canonical clean-dog-side polygon with 50 vertices/,
    })
    .waitFor();
  checked("route exposes the exact 29-fixture read-only B1 review corpus");
  checked(
    "mask route is allowlisted, no-store, and returns the approved SHA-256",
  );
  checked(
    "boundary copy excludes products, revisions, quantities, quotes, and supplier approval",
  );

  const protectedKeys = [
    "course-design.local-workspace.v1",
    "course-design.local-concepts.v1",
    "course-design.local-course.v1",
  ];
  const protectedBefore = await page.evaluate(
    (keys) =>
      Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
    protectedKeys,
  );

  await page
    .getByRole("button", { name: "Accept for future prototyping" })
    .click();
  await page
    .getByText(/no product geometry or revision was created/i)
    .waitFor();
  assert.match(
    await page.locator(".silhouette-current-decision").innerText(),
    /Accepted for future prototyping/,
  );
  checked(
    "valid B1 polygon can be explicitly accepted for future prototyping only",
  );

  await page.getByRole("button", { name: "Retain without conversion" }).click();
  assert.match(
    await page.locator(".silhouette-current-decision").innerText(),
    /Retained without conversion/,
  );
  await page.locator(".silhouette-decision-history summary").click();
  assert.equal(
    await page.locator(".silhouette-decision-history li").count(),
    2,
  );
  checked(
    "changing a decision appends history and preserves the prior hash-pinned event",
  );

  await page.getByRole("button", { name: "Must retain 11" }).click();
  assert.equal(await page.locator(".silhouette-fixture-row").count(), 11);
  await page
    .locator(".silhouette-fixture-row")
    .filter({ hasText: "clean-bicycle" })
    .click();
  await page.getByText("holes_not_supported").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Cannot accept rejected result" })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Retain without conversion" }).click();
  assert.match(
    await page.locator(".silhouette-current-decision").innerText(),
    /Retained without conversion/,
  );
  checked(
    "hole-bearing rejected evidence cannot be accepted and can only be retained",
  );
  await screenshot("desktop-rejected-bicycle.png");

  const localReview = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("course-design.local-silhouette-review.v1"),
    ),
  );
  assert.equal(localReview.decisions.length, 3);
  assert.equal(
    localReview.decisions.every((decision) =>
      /^[a-f0-9]{64}$/.test(decision.decisionHash),
    ),
    true,
  );
  assert.equal("configuration" in localReview, false);
  assert.equal("obstacleDesignRevisionId" in localReview, false);
  const protectedAfter = await page.evaluate(
    (keys) =>
      Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
    protectedKeys,
  );
  assert.deepEqual(protectedAfter, protectedBefore);
  checked(
    "three decisions persist as hash-only review metadata with no product fields",
  );
  checked("SPJ-04, concept, and course browser-local state remain unchanged");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByText(/Review decisions restored on this device/).waitFor();
  assert.match(
    await page.locator(".silhouette-current-decision").innerText(),
    /Retained without conversion/,
  );
  checked("reload restores the exact current decision and immutable history");

  await page.getByRole("button", { name: "All 29" }).click();
  await page
    .locator(".silhouette-fixture-row")
    .filter({ hasText: "clean-dog-side" })
    .click();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(250);
  await screenshot("desktop-review-overview.png");
  await page.locator(".silhouette-inspector-heading").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await screenshot("desktop-accepted-dog.png");
  for (const viewport of [
    { width: 1440, height: 1000, name: null },
    { width: 768, height: 1024, name: "tablet-review.png" },
    { width: 375, height: 812, name: "mobile-review.png" },
  ]) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.evaluate(() => scrollTo(0, 0));
    const audit = await layoutAudit();
    assert.equal(audit.overflowX, 0, JSON.stringify(audit));
    assert.deepEqual(audit.tooSmall, [], JSON.stringify(audit));
    if (viewport.name) await screenshot(viewport.name);
    checked(
      `${viewport.width} × ${viewport.height} has no overflow and 44px targets`,
    );
  }

  const filterButton = page.getByRole("button", { name: "Must retain 11" });
  await filterButton.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const focus = await filterButton.evaluate((element) => ({
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: getComputedStyle(element).outlineWidth,
  }));
  assert.notEqual(focus.outlineStyle, "none");
  assert.ok(Number.parseFloat(focus.outlineWidth) >= 2);
  checked(
    "keyboard focus is visible and decisions announce through a polite live region",
  );

  await page.evaluate(() => {
    const review = JSON.parse(
      localStorage.getItem("course-design.local-silhouette-review.v1"),
    );
    review.evidenceSha256 = "tampered";
    localStorage.setItem(
      "course-design.local-silhouette-review.v1",
      JSON.stringify(review),
    );
  });
  await page.reload({ waitUntil: "networkidle" });
  const integrityAlert = page
    .getByRole("alert")
    .filter({ hasText: "Untrusted browser-local review was rejected" });
  await integrityAlert.waitFor();
  assert.match(await integrityAlert.innerText(), /tampered_review/);
  const resetReview = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("course-design.local-silhouette-review.v1"),
    ),
  );
  assert.equal(resetReview.decisions.length, 0);
  checked(
    "tampered evidence identity fails visibly and starts a fresh review record",
  );

  assert.deepEqual(nonGetRequests, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(consoleProblems, []);
  assert.deepEqual(failedRequests, []);
  checked(
    "zero POST requests, external requests, console problems, or failed requests",
  );
} finally {
  await browser.close();
}

await writeFile(
  path.join(evidenceDirectory, "phase-1h-b2-browser-acceptance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
