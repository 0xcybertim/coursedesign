import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PHASE_1G_BASE_URL ?? "http://127.0.0.1:3000";
const chromiumPath =
  process.env.PHASE_1G_CHROMIUM_PATH ??
  "/Users/timwijnhoven/Library/Caches/ms-playwright/chromium_headless_shell-1194/chrome-mac/headless_shell";
const evidenceDirectory = path.resolve("docs/phase-1g");
const screenshotDirectory = path.join(evidenceDirectory, "screenshots");
await mkdir(screenshotDirectory, { recursive: true });

const directCapability = await fetch(`${baseUrl}/api/generation/concepts`, {
  cache: "no-store",
});
assert.equal(directCapability.status, 200);
assert.equal(directCapability.headers.get("cache-control"), "no-store");
const crossHost = await fetch(`${baseUrl}/api/generation/concepts`, {
  headers: { "x-forwarded-host": "example.com" },
  cache: "no-store",
});
assert.equal(crossHost.status, 404);
assert.equal((await crossHost.json()).enabled, false);

const disabledPage = await fetch(`${baseUrl}/studio/concepts/new`, {
  headers: { "x-forwarded-host": "example.com" },
  cache: "no-store",
});
assert.equal(disabledPage.status, 200);
const disabledPageHtml = await disabledPage.text();
assert.ok(disabledPageHtml.includes("Concept generation is unavailable"));
assert.ok(disabledPageHtml.includes("non_local_host"));

const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(() => {
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  const active = new Set();
  globalThis.__phase1gObjectUrlAudit = { active, created: 0, revoked: 0 };
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    active.add(url);
    globalThis.__phase1gObjectUrlAudit.created += 1;
    return url;
  };
  URL.revokeObjectURL = (url) => {
    active.delete(url);
    globalThis.__phase1gObjectUrlAudit.revoked += 1;
    revoke(url);
  };
});

const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const consoleProblems = [];
const failedRequests = [];
const expectedCancelledRequests = [];
page.on("console", (message) => {
  if (["warning", "error"].includes(message.type()))
    consoleProblems.push(`${message.type()}: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  const entry = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`;
  if (
    (request.url().includes("/api/generation/concepts") ||
      request.url().includes("_rsc=")) &&
    entry.includes("ERR_ABORTED")
  )
    expectedCancelledRequests.push(entry);
  else failedRequests.push(entry);
});

const report = {
  schemaVersion: "1.1.0-phase1g-browser",
  baseUrl,
  provider: "workflow-simulator-deterministic-fixtures",
  liveOpenAICalls: 0,
  manualVisualSignOff: "deferred",
  checks: [],
  screenshots: [],
  consoleProblems,
  expectedConsoleProblems: [],
  failedRequests,
  expectedCancelledRequests,
  objectUrls: null,
};

function checked(name, detail = "passed") {
  report.checks.push({ name, detail });
}

async function screenshot(name) {
  const target = path.join(screenshotDirectory, name);
  const capture = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(target, Buffer.from(capture.data, "base64"));
  report.screenshots.push(path.relative(process.cwd(), target));
}

async function conceptCount() {
  return page.locator(".concept-card").count();
}

async function waitForConceptCount(count) {
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll(".concept-card").length === expected,
    count,
    { timeout: 20_000 },
  );
}

async function generate() {
  await page
    .getByRole("button", { name: "Create four fixture previews" })
    .click();
}

async function firstFixtureSvg() {
  return page
    .locator(".concept-batch")
    .first()
    .locator("img")
    .first()
    .evaluate(async (image) =>
      fetch(image.src).then((response) => response.text()),
    );
}

async function layoutAudit() {
  return page.evaluate(() => {
    const interactive = [
      ...document.querySelectorAll(
        'button, a, input:not([type="checkbox"]), select, textarea, label.concept-photo-action, .concept-consent-list label',
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
          hiddenFile: element.matches('input[type="file"]'),
        };
      })
      .filter((item) => item.visible && !item.hiddenFile);
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
  checked("API enabled only with local deterministic provider gates");
  checked("API and disabled-host responses use Cache-Control no-store");
  checked("non-local host disables the route");

  await page.goto(`${baseUrl}/studio/concepts/new`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "Create a jump concept." }).waitFor();
  assert.match(await page.locator("body").innerText(), /Developer-only/);
  const initialBody = await page.locator("body").innerText();
  assert.match(initialBody, /Workflow simulator/);
  assert.match(initialBody, /does not make live provider calls/);
  assert.match(initialBody, /does not.*demonstrate AI image quality/i);
  assert.match(initialBody, /Generation brief/);
  checked(
    "enabled route identifies the Workflow simulator and its exact limits",
  );

  const spjBefore = await page.evaluate(() =>
    localStorage.getItem("course-design.local-workspace.v1"),
  );

  await page
    .getByLabel("Creative direction — optional")
    .fill(
      "Friendly Labrador in side profile, with raised ears and the tail forming the outside edge.",
    );
  const conflictAlert = page.getByRole("alert").filter({
    hasText: "Resolve the subject conflict",
  });
  await conflictAlert.waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Create four fixture previews" })
      .isDisabled(),
    true,
  );
  const resolution = page.getByRole("button", {
    name: "Use dog as silhouette subject",
  });
  await resolution.focus();
  await resolution.press("Enter");
  await conflictAlert.waitFor({ state: "hidden" });
  assert.equal(await page.getByLabel("Silhouette subject").inputValue(), "dog");
  assert.equal(await conceptCount(), 0);
  checked(
    "obvious dog-versus-butterfly conflict is visible, blocks submission, and resolves from the keyboard",
  );

  await page.getByLabel("Colors").fill("rust, cream and navy");
  await page.getByLabel("Lower element preference").selectOption("gate");
  await page.getByLabel("Sponsor area").selectOption("prominent");
  await page.getByLabel("Style").selectOption("playful");
  const briefText = await page.locator(".concept-brief-summary").innerText();
  assert.match(briefText, /Silhouette subject\s+dog/);
  assert.match(briefText, /Colors\s+rust, cream and navy/);
  await generate();
  await waitForConceptCount(4);
  assert.match(await page.locator(".concept-status").innerText(), /Ready/);
  const dogSvg = await firstFixtureSvg();
  assert.match(dogSvg, /data-fixture-subject="dog"/);
  assert.match(dogSvg, /data-requested-colors="navy, rust, cream"/);
  assert.match(dogSvg, /data-lower-element="gate"/);
  assert.match(dogSvg, /data-sponsor-area="prominent"/);
  assert.match(dogSvg, /STYLE: PLAYFUL · LOWER: GATE · SPONSOR: PROMINENT/);
  const dogSvgs = await page
    .locator(".concept-batch")
    .first()
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(
        images.map((image) =>
          fetch(image.src).then((response) => response.text()),
        ),
      ),
    );
  assert.equal(dogSvgs.length, 4);
  assert.equal(new Set(dogSvgs).size, 4);
  checked(
    "dog flow uses the structured brief, known colors, style, lower element, sponsor area, and four distinct labelled fixtures",
  );

  await page.getByLabel("Silhouette subject").fill("butterfly");
  await page
    .getByLabel("Creative direction — optional")
    .fill("Symmetrical wings with bold gold edge markings.");
  await page.getByLabel("Colors").fill("navy and gold");
  await page.getByLabel("Lower element preference").selectOption("none");
  await page.getByLabel("Sponsor area").selectOption("subtle");
  await page.getByLabel("Style").selectOption("graphic");
  await page.getByRole("button", { name: "Regenerate fixture batch" }).click();
  await waitForConceptCount(8);
  assert.match(await firstFixtureSvg(), /data-fixture-subject="butterfly"/);
  checked(
    "butterfly Regenerate creates an immutable sibling batch and preserves the dog batch",
  );

  await page.getByLabel("Silhouette subject").fill("castle");
  await page
    .getByLabel("Creative direction — optional")
    .fill("Square castle towers with a centered arched opening.");
  await page.getByLabel("Colors").fill("stone, cobalt and white");
  await page
    .getByLabel("Lower element preference")
    .selectOption("decorative-panel");
  await page.getByLabel("Sponsor area").selectOption("none");
  await page.getByLabel("Style").selectOption("heritage");
  await page.getByRole("button", { name: "Regenerate fixture batch" }).click();
  await waitForConceptCount(12);
  assert.match(await firstFixtureSvg(), /data-fixture-subject="castle"/);
  assert.equal(await page.getByText(/Sibling batch/).count(), 2);
  checked(
    "castle flow is visibly distinct and appends a second immutable sibling batch",
  );

  const photoBuffer = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2600;
      canvas.height = 1300;
      const context2d = canvas.getContext("2d");
      context2d.fillStyle = "#f7f6f1";
      context2d.fillRect(0, 0, canvas.width, canvas.height);
      context2d.fillStyle = "#0d43c7";
      context2d.beginPath();
      context2d.ellipse(900, 650, 500, 430, -0.2, 0, Math.PI * 2);
      context2d.ellipse(1700, 650, 500, 430, 0.2, 0, Math.PI * 2);
      context2d.fill();
      return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
    }),
    "base64",
  );
  await page.getByLabel("Allowed subject").selectOption("building");
  await page.locator('input[type="file"]').setInputFiles({
    name: "owned-castle.jpg",
    mimeType: "image/jpeg",
    buffer: photoBuffer,
  });
  await page.getByText(/owned-castle\.jpg/).waitFor();
  const derivativeText = await page
    .locator(".concept-photo-status")
    .innerText();
  assert.match(derivativeText, /2048 × 1024/);
  assert.match(
    await page.locator(".concept-photo-fieldset").innerText(),
    /workflow only.*no OpenAI call.*does not demonstrate genuine photo matching/is,
  );
  const confirmations = page.locator(
    ".concept-consent-list input[type=checkbox]",
  );
  assert.equal(await confirmations.count(), 5);
  for (let index = 0; index < 5; index += 1)
    await confirmations.nth(index).check();
  await page.getByText("Photo consent complete").waitFor();
  await page.getByRole("button", { name: "Regenerate fixture batch" }).click();
  await waitForConceptCount(16);
  checked(
    "optional photo simulator mode preprocesses, resizes, re-encodes, hashes, consents, and stores without claiming genuine matching",
  );
  checked(
    "processed derivative only is submitted to the local simulator boundary with zero live OpenAI calls",
  );

  await page
    .locator(".concept-batch")
    .first()
    .getByRole("button", { name: "Refine", exact: true })
    .first()
    .click();
  const refinementPrompt = page.getByLabel("What should change?");
  await page.waitForFunction(() => {
    const input = document.querySelector("#refinement-prompt");
    if (!(input instanceof HTMLTextAreaElement)) return false;
    const bounds = input.getBoundingClientRect();
    return (
      document.activeElement === input &&
      bounds.top >= 0 &&
      bounds.bottom <= window.innerHeight
    );
  });
  await refinementPrompt.fill("Make the cobalt edge details larger.");
  await page
    .getByRole("button", { name: "Create four refined fixtures" })
    .click();
  await waitForConceptCount(20);
  assert.equal(await page.getByText(/Refinement child/).count(), 1);
  assert.match(await firstFixtureSvg(), /REFINEMENT FIXTURE/);
  assert.match(await firstFixtureSvg(), /Make the cobalt edge details larger/);
  checked(
    "Refine reveals and focuses its controls, then appends an immutable child request while preserving earlier batches",
  );

  await page
    .locator(".concept-batch")
    .first()
    .getByRole("radio")
    .first()
    .click();
  await page.getByRole("button", { name: "Build this concept" }).click();
  await page
    .getByText(
      /this concept was not uploaded, masked, vectorized, or connected/i,
    )
    .waitFor();
  checked("selection and Build this concept record only the Phase 1H boundary");

  const beforeCancel = await conceptCount();
  await page.getByRole("button", { name: "Regenerate fixture batch" }).click();
  await page.locator('.concept-status[data-status="generating"]').waitFor();
  await page.getByRole("button", { name: "Cancel generation" }).click();
  await page.getByText(/No live provider call or cost was involved/).waitFor();
  await page.waitForTimeout(2400);
  assert.equal(await conceptCount(), beforeCancel);
  checked(
    "simulator cancellation aborts locally, states that no live cost exists, and discards late output",
  );

  await page.reload({ waitUntil: "networkidle" });
  await waitForConceptCount(20);
  assert.match(
    await page.locator(".concept-persistence-status").innerText(),
    /restored/,
  );
  assert.equal(
    await page.getByRole("button", { name: "Build this concept" }).isEnabled(),
    true,
  );
  checked(
    "reload restores five batches, exact selection, acceptance, and hash-only metadata",
  );

  const spjAfter = await page.evaluate(() =>
    localStorage.getItem("course-design.local-workspace.v1"),
  );
  assert.equal(spjAfter, spjBefore);
  checked(
    "concept generation does not create or mutate SPJ-04 draft/revision state",
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.overflowAnchor = "none";
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
  await screenshot("desktop-workflow-simulator.png");
  await page.locator(".concept-batch").first().scrollIntoViewIfNeeded();
  await screenshot("desktop-concept-history.png");
  await page.locator(".concept-batch").last().scrollIntoViewIfNeeded();
  await screenshot("desktop-dog-fixtures.png");
  for (const viewport of [
    { width: 375, height: 812, name: "mobile-concept-studio.png" },
    { width: 768, height: 1024, name: "tablet-concept-studio.png" },
    { width: 1440, height: 1000, name: null },
  ]) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      scrollTo(0, 0);
    });
    const audit = await layoutAudit();
    assert.equal(audit.overflowX, 0, JSON.stringify(audit));
    assert.deepEqual(audit.tooSmall, [], JSON.stringify(audit));
    if (viewport.name) {
      await page.evaluate(() => {
        document.documentElement.style.overflowAnchor = "none";
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        scrollTo(0, 0);
      });
      await page.waitForTimeout(250);
      await screenshot(viewport.name);
    }
    checked(
      `${viewport.width} × ${viewport.height} has no overflow and 44px targets`,
    );
  }

  await page.getByLabel("Creative direction — optional").focus();
  const focusEvidence = await page
    .getByLabel("Creative direction — optional")
    .evaluate((element) => ({
      outlineWidth: getComputedStyle(element).outlineWidth,
      outlineStyle: getComputedStyle(element).outlineStyle,
    }));
  assert.notEqual(focusEvidence.outlineStyle, "none");
  assert.ok(Number.parseFloat(focusEvidence.outlineWidth) >= 2);
  assert.equal(
    (await page.locator('[role="status"][aria-live="polite"]').count()) > 0,
    true,
  );
  checked(
    "keyboard focus is visible and status announcements use a polite live region",
  );

  const missingHash = await page.evaluate(() => {
    const workspace = JSON.parse(
      localStorage.getItem("course-design.local-concepts.v1"),
    );
    return workspace.concepts.find(
      (concept) => concept.conceptId !== workspace.selectedConceptId,
    ).contentHash;
  });
  await page.evaluate(async (contentHash) => {
    await new Promise((resolve, reject) => {
      const opened = indexedDB.open("course-design.artwork.v1", 1);
      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const database = opened.result;
        const transaction = database.transaction("blobs", "readwrite");
        transaction.objectStore("blobs").delete(contentHash);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, missingHash);
  await page.reload({ waitUntil: "networkidle" });
  await waitForConceptCount(20);
  const missingAlerts = page.getByRole("alert").filter({
    hasText: "missing_blob",
  });
  await missingAlerts.first().waitFor();
  const missingReferenceCount = await missingAlerts.count();
  assert.ok(missingReferenceCount >= 1);
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll(".concept-card img").length === expected,
    20 - missingReferenceCount,
  );
  const missingCard = missingAlerts.first().locator("xpath=ancestor::article");
  assert.equal(await missingCard.getByRole("radio").isDisabled(), true);
  assert.equal(
    await missingCard.getByRole("button", { name: "Refine" }).isDisabled(),
    true,
  );
  checked(
    "missing generated bytes fail visibly and disable the affected concept without altering history",
  );

  const objectUrlsBeforeNavigation = await page.evaluate(() => ({
    created: globalThis.__phase1gObjectUrlAudit.created,
    revoked: globalThis.__phase1gObjectUrlAudit.revoked,
    active: globalThis.__phase1gObjectUrlAudit.active.size,
  }));
  assert.equal(objectUrlsBeforeNavigation.active, 20 - missingReferenceCount);
  await page
    .getByRole("link", { name: "Open exact SPJ-04 artwork workflow" })
    .click();
  await page.getByText("SPJ-04 · Club Classic", { exact: true }).waitFor();
  const objectUrlsAfterNavigation = await page.evaluate(() => ({
    created: globalThis.__phase1gObjectUrlAudit.created,
    revoked: globalThis.__phase1gObjectUrlAudit.revoked,
    active: globalThis.__phase1gObjectUrlAudit.active.size,
  }));
  assert.equal(objectUrlsAfterNavigation.active, 0);
  assert.ok(objectUrlsAfterNavigation.revoked >= 20 - missingReferenceCount);
  report.objectUrls = { objectUrlsBeforeNavigation, objectUrlsAfterNavigation };
  checked("temporary concept object URLs are revoked on workflow navigation");
  checked("Phase 1F SPJ-04 route remains operational");

  report.expectedConsoleProblems = [];
  assert.deepEqual(consoleProblems, []);
  assert.deepEqual(failedRequests, []);
  checked("zero console warnings or errors");
  checked("zero unexpected failed requests");
} finally {
  await browser.close();
}

await writeFile(
  path.join(evidenceDirectory, "browser-acceptance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
