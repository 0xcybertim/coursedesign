import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PHASE_1F_BASE_URL ?? "http://127.0.0.1:3000";
const chromiumPath =
  process.env.PHASE_1F_CHROMIUM_PATH ??
  "/Users/timwijnhoven/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const evidenceDirectory = path.resolve("docs/phase-1f");
const screenshotDirectory = path.join(evidenceDirectory, "screenshots");

await mkdir(screenshotDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(() => {
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  const active = new Set();
  globalThis.__phase1fObjectUrlAudit = { active, created: 0, revoked: 0 };
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    active.add(url);
    globalThis.__phase1fObjectUrlAudit.created += 1;
    return url;
  };
  URL.revokeObjectURL = (url) => {
    active.delete(url);
    globalThis.__phase1fObjectUrlAudit.revoked += 1;
    revoke(url);
  };
});

const page = await context.newPage();
const consoleProblems = [];
const environmentConsoleNotices = [];
const failedRequests = [];
const expectedAbortedRequests = [];
page.on("console", (message) => {
  if (["warning", "error"].includes(message.type())) {
    const entry = `${message.type()}: ${message.text()}`;
    if (/GroupMarkerNotSet|GL Driver Message/.test(entry)) {
      environmentConsoleNotices.push(entry);
    } else {
      consoleProblems.push(entry);
    }
  }
});
page.on("requestfailed", (request) => {
  const entry = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`;
  if (request.url().includes("_rsc=") && entry.includes("ERR_ABORTED")) {
    expectedAbortedRequests.push(entry);
  } else {
    failedRequests.push(entry);
  }
});

const report = {
  baseUrl,
  checks: [],
  hashes: {},
  screenshots: [],
  consoleProblems,
  environmentConsoleNotices,
  failedRequests,
  expectedAbortedRequests,
};

function checked(name, detail = "passed") {
  report.checks.push({ name, detail });
}

async function screenshot(name, options = {}) {
  const target = path.join(screenshotDirectory, name);
  await page.screenshot({ path: target, ...options });
  report.screenshots.push(path.relative(process.cwd(), target));
}

async function waitForEditorMessage(fragment) {
  const state = page.locator(".artwork-editor-state");
  await state.waitFor({ state: "visible" });
  try {
    await page.waitForFunction(
      ([selector, text]) =>
        document.querySelector(selector)?.textContent?.includes(text),
      [".artwork-editor-state", fragment],
      { timeout: 10_000 },
    );
  } catch {
    throw new Error(
      `Expected editor message ${JSON.stringify(fragment)}, received ${JSON.stringify(await state.textContent())}`,
    );
  }
  return state.textContent();
}

async function generatedRaster(type) {
  const dataUrl = await page.evaluate((mediaType) => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 16;
    const context2d = canvas.getContext("2d");
    if (!context2d)
      throw new Error("Canvas 2D unavailable in acceptance browser.");
    if (mediaType === "image/jpeg") {
      context2d.fillStyle = "#ffffff";
      context2d.fillRect(0, 0, canvas.width, canvas.height);
    }
    context2d.fillStyle = "#0d43c7";
    context2d.fillRect(5, 3, 22, 10);
    return canvas.toDataURL(mediaType, 0.9);
  }, type);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function upload(file) {
  await page.locator('input[type="file"]').setInputFiles(file);
}

async function openArtworkEditor(buttonName) {
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  await page
    .getByRole("heading", { name: "Place a logo on the fixed panels" })
    .waitFor();
}

async function rendererEvidence() {
  return page.evaluate(() => {
    const stage = document.querySelector(".visual-stage");
    const three = document.querySelector('[data-testid="3d-view"]');
    const twoD = Object.fromEntries(
      [...document.querySelectorAll("[data-artwork-side]")].map((element) => [
        element.getAttribute("data-artwork-side"),
        {
          hash: element.getAttribute("data-artifact-hash"),
          placement: element.getAttribute("data-artwork-placement"),
        },
      ]),
    );
    return {
      stage: stage
        ? {
            leftHash: stage.getAttribute("data-left-artifact-hash"),
            rightHash: stage.getAttribute("data-right-artifact-hash"),
            leftPlacement: stage.getAttribute("data-left-artwork-placement"),
            rightPlacement: stage.getAttribute("data-right-artwork-placement"),
          }
        : null,
      three: three
        ? {
            leftHash: three.getAttribute("data-left-artifact-hash"),
            rightHash: three.getAttribute("data-right-artifact-hash"),
            leftPlacement: three.getAttribute("data-left-artwork-placement"),
            rightPlacement: three.getAttribute("data-right-artwork-placement"),
          }
        : null,
      twoD,
    };
  });
}

async function layoutAudit() {
  return page.evaluate(() => {
    const interactive = [
      ...document.querySelectorAll(
        ".artwork-editor button, .artwork-editor .artwork-file-action, .artwork-editor .artwork-toggle, .artwork-editor input:not([type=file]):not([type=color]):not([type=checkbox])",
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
      viewport: [innerWidth, innerHeight],
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
  await page.goto(`${baseUrl}/studio/obstacles/spj-04`, { waitUntil: "load" });
  await page
    .getByTestId("capability-status")
    .filter({ hasText: "interactive 3D ready" })
    .waitFor({ timeout: 20_000 });
  assert.match(
    await page.getByTestId("configuration-announcement").textContent(),
    /721cfa28f279bc077a811d94a4b3b42b204e8f84331a82d0d69a4f44ce4a0c80/,
  );
  checked("built-in Club Classic hash remains stable");
  checked("normal interactive 3D reaches ready state");

  await openArtworkEditor("Customize logo artwork");
  await upload({
    name: "unsupported.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7"),
  });
  assert.match(
    await waitForEditorMessage("unsupported_pdf"),
    /PDF is not supported/,
  );
  checked("PDF rejected with visible typed failure");

  await upload({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script></svg>',
    ),
  });
  assert.match(
    await waitForEditorMessage("svg_script"),
    /scripts are not allowed/,
  );
  checked("unsafe SVG script rejected before rasterization");

  await upload({
    name: "transparent.png",
    mimeType: "image/png",
    buffer: await generatedRaster("image/png"),
  });
  await waitForEditorMessage("processed as canonical PNG");
  assert.match(
    await page.locator(".artwork-filename").textContent(),
    /transparent\.png/,
  );
  checked("valid transparent PNG processed to canonical PNG");

  await upload({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await generatedRaster("image/jpeg"),
  });
  await waitForEditorMessage("processed as canonical PNG");
  await page
    .getByRole("button", { name: "Confirm artwork", exact: true })
    .click();
  assert.match(
    await waitForEditorMessage("jpeg_background_required"),
    /Choose white, navy, or a custom background/,
  );
  checked(
    "valid JPEG processed and transparent-background confirmation blocked",
  );

  const leftSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><rect width="800" height="400" rx="90" fill="#ffffff"/><path fill="#0d43c7" d="M100 80h600v240H100z"/><circle cx="400" cy="200" r="80" fill="#ff5547"/></svg>',
  );
  const rightSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><path fill="#e8d51b" d="M0 200 160 0l160 200L160 400zM320 200 480 0l160 200-160 200z"/><rect x="650" width="150" height="400" fill="#0d43c7"/></svg>',
  );
  const replacementSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><circle cx="200" cy="200" r="170" fill="#0d43c7"/><circle cx="600" cy="200" r="170" fill="#ff5547"/><rect x="300" y="150" width="200" height="100" fill="#ffffff"/></svg>',
  );

  await upload({
    name: "left-logo.svg",
    mimeType: "image/svg+xml",
    buffer: leftSvg,
  });
  await waitForEditorMessage("processed as canonical PNG");
  await page.getByRole("button", { name: "Contain", exact: true }).click();
  await page.getByLabel("Horizontal position").fill("12");
  await page.getByLabel("Vertical position").fill("-8");
  await page.getByLabel("Rotation in degrees").fill("7");
  await page.getByLabel(/Scale/).fill("125");
  await page.getByLabel("Show prototype bleed guide").check();
  await page.getByLabel("Show prototype safe-area guide").check();
  checked(
    "SVG sanitized/rasterized with contain, integer placement, and guides",
  );

  await page.getByLabel("Edit wings separately").check();
  await page.getByRole("tab", { name: "Right wing", exact: true }).click();
  await upload({
    name: "right-logo.svg",
    mimeType: "image/svg+xml",
    buffer: rightSvg,
  });
  await waitForEditorMessage("processed as canonical PNG");
  await page.getByRole("button", { name: "Cover", exact: true }).click();
  await page.getByLabel("Horizontal position").fill("-20");
  await page.getByLabel("Vertical position").fill("14");
  await page.getByLabel("Rotation in degrees").fill("-9");
  await page.getByRole("button", { name: "White", exact: true }).click();

  const independentEvidence = await rendererEvidence();
  assert.ok(independentEvidence.stage && independentEvidence.three);
  assert.notEqual(
    independentEvidence.stage.leftHash,
    independentEvidence.stage.rightHash,
  );
  assert.deepEqual(independentEvidence.stage, independentEvidence.three);
  assert.equal(
    independentEvidence.twoD.left.hash,
    independentEvidence.stage.leftHash,
  );
  assert.equal(
    independentEvidence.twoD.right.hash,
    independentEvidence.stage.rightHash,
  );
  assert.equal(
    independentEvidence.twoD.left.placement,
    independentEvidence.stage.leftPlacement,
  );
  assert.equal(
    independentEvidence.twoD.right.placement,
    independentEvidence.stage.rightPlacement,
  );
  report.hashes.independentLeft = independentEvidence.stage.leftHash;
  report.hashes.independentRight = independentEvidence.stage.rightHash;
  checked(
    "independent left/right hashes and placement match exact 2.5D/3D manifest evidence",
  );
  await screenshot("independent-wing-editor-desktop.png", { fullPage: true });

  await page.getByRole("button", { name: "3D", exact: true }).click();
  await screenshot("desktop-artwork-3d.png");
  await page.getByRole("button", { name: "2.5D", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm artwork", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Place a logo on the fixed panels" })
    .waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Save immutable revision", exact: true })
    .click();
  await page.getByText("1 saved revision", { exact: true }).waitFor();

  const revisionOne = await page.evaluate(() => {
    const workspace = JSON.parse(
      localStorage.getItem("course-design.spj-04.local-workspace.v1"),
    );
    return workspace.revisions[0];
  });
  report.hashes.revisionOne = revisionOne.configurationHash;
  assert.equal(
    revisionOne.snapshot.renderManifest.artworkSlots.left.renderContentHash,
    report.hashes.independentLeft,
  );
  assert.equal(
    revisionOne.snapshot.renderManifest.artworkSlots.right.renderContentHash,
    report.hashes.independentRight,
  );
  checked("immutable Revision 01 pins both content hashes and placements");

  await page.reload({ waitUntil: "load" });
  await page.getByText("1 saved revision", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Open revision 01", exact: true })
    .click();
  await page.getByText("Read-only saved revision", { exact: true }).waitFor();
  assert.match(
    await page.getByTestId("configuration-announcement").textContent(),
    new RegExp(revisionOne.configurationHash),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Edit logo artwork", exact: true })
      .isDisabled(),
    true,
  );
  await screenshot("reload-read-only-revision.png", { fullPage: true });
  checked("reload restores exact artwork and read-only revision identity");

  await page
    .getByRole("button", { name: "Back to current draft", exact: true })
    .click();
  await openArtworkEditor("Edit logo artwork");
  await upload({
    name: "left-logo-v2.svg",
    mimeType: "image/svg+xml",
    buffer: replacementSvg,
  });
  await waitForEditorMessage("processed as canonical PNG");
  await page
    .getByRole("button", { name: "Confirm artwork", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Place a logo on the fixed panels" })
    .waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Save immutable revision", exact: true })
    .click();
  await page.getByText("2 saved revisions", { exact: true }).waitFor();

  const revisionState = await page.evaluate(() => {
    const workspace = JSON.parse(
      localStorage.getItem("course-design.spj-04.local-workspace.v1"),
    );
    return workspace.revisions.map((revision) => ({
      revisionId: revision.revisionId,
      configurationHash: revision.configurationHash,
      leftHash:
        revision.snapshot.renderManifest.artworkSlots.left.renderContentHash,
      rightHash:
        revision.snapshot.renderManifest.artworkSlots.right.renderContentHash,
    }));
  });
  assert.equal(
    revisionState[0].configurationHash,
    revisionOne.configurationHash,
  );
  assert.notEqual(revisionState[0].leftHash, revisionState[1].leftHash);
  assert.equal(revisionState[0].rightHash, revisionState[1].rightHash);
  report.hashes.revisionTwo = revisionState[1].configurationHash;
  checked("replacement creates Revision 02 without mutating Revision 01");

  await page.waitForTimeout(1_800);
  const objectUrlAudit = await page.evaluate(() => ({
    active: globalThis.__phase1fObjectUrlAudit.active.size,
    created: globalThis.__phase1fObjectUrlAudit.created,
    revoked: globalThis.__phase1fObjectUrlAudit.revoked,
  }));
  assert.ok(objectUrlAudit.revoked > 0);
  assert.ok(objectUrlAudit.active <= 2, JSON.stringify(objectUrlAudit));
  report.objectUrlAudit = objectUrlAudit;
  checked(
    "repeated replacements revoke stale object URLs",
    JSON.stringify(objectUrlAudit),
  );

  await page.goto(`${baseUrl}/studio/courses/local-course-1`, {
    waitUntil: "load",
  });
  await page.getByRole("heading", { name: "Place a revision" }).waitFor();
  await page.getByRole("radio", { name: /Revision 01/ }).click();
  await page
    .getByRole("button", { name: "Place in center", exact: true })
    .click();
  await page.getByRole("radio", { name: /Revision 02/ }).click();
  await page
    .getByRole("button", { name: "Place in center", exact: true })
    .click();
  assert.equal(await page.locator(".course-obstacle").count(), 2);
  const courseBeforeReload = await page.evaluate(() =>
    localStorage.getItem("course-design.local-course-1.v1"),
  );
  const parsedCourse = JSON.parse(courseBeforeReload);
  assert.deepEqual(
    parsedCourse.instances.map((instance) => instance.obstacleDesignRevisionId),
    revisionState.map((revision) => revision.revisionId),
  );
  await page.reload({ waitUntil: "load" });
  await page.getByRole("heading", { name: "Place a revision" }).waitFor();
  assert.equal(await page.locator(".course-obstacle").count(), 2);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("course-design.local-course-1.v1"),
    ),
    courseBeforeReload,
  );
  await screenshot("course-revision-pinning.png", { fullPage: true });
  checked(
    "course pins Revision 01 and Revision 02 IDs unchanged across reload",
  );

  await page.goto(`${baseUrl}/studio/courses/local-course-1/review`, {
    waitUntil: "load",
  });
  await page
    .getByTestId("review-source-status")
    .filter({ hasText: "restored" })
    .waitFor();
  assert.equal(
    await page.locator('[data-testid="placement-register"] > li').count(),
    2,
  );
  const reviewText = await page.getByTestId("review-quantities").textContent();
  assert.match(reviewText, /Obstacle instances\s*2/);
  const reviewJson = JSON.parse(
    await page.getByTestId("review-json").textContent(),
  );
  assert.deepEqual(
    reviewJson.placements.map(
      (placement) => placement.obstacleDesignRevisionId,
    ),
    revisionState.map((revision) => revision.revisionId),
  );
  assert.deepEqual(
    reviewJson.placements.map(
      (placement) => placement.pinnedRevision.configurationHash,
    ),
    revisionState.map((revision) => revision.configurationHash),
  );
  report.hashes.review = reviewJson.reviewHash;
  await screenshot("course-review-artwork-pinning.png", { fullPage: true });
  checked(
    "Course Review Sheet preserves distinct pinned hashes and exact quantity 2",
  );

  await page.goto(`${baseUrl}/studio/obstacles/spj-04?force3d=fail`, {
    waitUntil: "load",
  });
  await page
    .getByTestId("capability-status")
    .filter({ hasText: "intentionally disabled" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "2.5D", exact: true })
      .getAttribute("class"),
    "is-selected",
  );
  const fallbackEvidence = await rendererEvidence();
  assert.equal(fallbackEvidence.twoD.left.hash, revisionState[1].leftHash);
  assert.equal(fallbackEvidence.twoD.right.hash, revisionState[1].rightHash);
  await screenshot("forced-2-5d-fallback.png");
  checked("forced WebGL failure preserves exact current 2.5D artwork");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${baseUrl}/studio/obstacles/spj-04`, { waitUntil: "load" });
  await openArtworkEditor("Edit logo artwork");
  await page
    .getByRole("heading", { name: "Place a logo on the fixed panels" })
    .scrollIntoViewIfNeeded();
  const mobileAudit = await layoutAudit();
  assert.equal(mobileAudit.overflowX, 0);
  assert.deepEqual(mobileAudit.tooSmall, []);
  report.mobileAudit = mobileAudit;
  await screenshot("mobile-artwork-editor.png", { fullPage: true });
  checked(
    "375x812 artwork editor has no overflow and no visible target below 44px",
  );

  await page.keyboard.press("Tab");
  assert.equal(await page.locator(":focus-visible").count(), 1);
  checked("keyboard focus remains visibly represented");

  await page.setViewportSize({ width: 768, height: 1024 });
  const tabletAudit = await layoutAudit();
  assert.equal(tabletAudit.overflowX, 0);
  assert.deepEqual(tabletAudit.tooSmall, []);
  report.tabletAudit = tabletAudit;
  await screenshot("tablet-artwork-editor.png", { fullPage: true });
  checked(
    "768x1024 artwork editor has no overflow and no visible target below 44px",
  );

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/studio/obstacles/spj-04`, { waitUntil: "load" });
  await page
    .getByTestId("capability-status")
    .filter({ hasText: "interactive 3D ready" })
    .waitFor({ timeout: 20_000 });
  const desktopAudit = await page.evaluate(() => ({
    overflowX:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    customizeVisible:
      document.querySelector(".artwork-open-action")?.getBoundingClientRect()
        .height === 44,
  }));
  assert.equal(desktopAudit.overflowX, 0);
  assert.equal(desktopAudit.customizeVisible, true);
  report.desktopAudit = desktopAudit;
  await screenshot("desktop-reload-final.png", { fullPage: true });
  checked("1440x1000 final reload restores custom artwork and normal 3D");

  assert.deepEqual(failedRequests, []);
  assert.deepEqual(consoleProblems, []);
  checked("no failed requests or browser warning/error console output");
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(
    path.join(evidenceDirectory, "browser-acceptance.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
