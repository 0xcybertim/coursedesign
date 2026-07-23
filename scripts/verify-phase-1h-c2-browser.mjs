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

const baseUrl = process.env.PHASE_1H_C2_BASE_URL ?? "http://127.0.0.1:3000";
const chromiumPath =
  process.env.PHASE_1H_C2_CHROMIUM_PATH ??
  "/Users/timwijnhoven/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const evidenceDirectory = path.resolve("docs/phase-1h");
const screenshotDirectory = path.join(
  evidenceDirectory,
  "phase-1h-c2-screenshots",
);
await mkdir(screenshotDirectory, { recursive: true });

const accepted = appendSilhouetteDecision(createEmptySilhouetteReview(), {
  decisionId: "phase-1h-c2-browser-clean-dog-side",
  fixtureId: "clean-dog-side",
  action: "accepted_for_future_prototyping",
  createdAt: "2026-07-23T08:00:00.000Z",
});
assert.equal(accepted.ok, true);
const serializedReview = serializeLocalSilhouetteReview(accepted.value);

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
  schemaVersion: "1.0.0-phase1h-c2-browser-acceptance",
  baseUrl,
  fixtureId: "clean-dog-side",
  executionBoundary: {
    externalProviderCallsMade: 0,
    retriesMade: 0,
    productApiPostCallsMade: 0,
  },
  checks: [],
  viewports: [],
  hashes: {},
  screenshots: [],
  consoleProblems: [],
  failedRequests: [],
  externalRequests: [],
};

function checked(name, detail = "passed") {
  report.checks.push({ name, detail });
}

async function makeContext(viewport, withReview = true) {
  const context = await browser.newContext({ viewport });
  if (withReview) {
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [LOCAL_SILHOUETTE_REVIEW_KEY, serializedReview],
    );
  }
  return context;
}

function auditPage(page) {
  page.on("console", (message) => {
    if (
      ["warning", "error"].includes(message.type()) &&
      !/GroupMarkerNotSet|GL Driver Message/.test(message.text())
    ) {
      report.consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST") {
      report.executionBoundary.productApiPostCallsMade += 1;
    }
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.protocol !== "data:" &&
      url.protocol !== "blob:"
    ) {
      report.externalRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    const message = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`;
    if (!message.includes("ERR_ABORTED")) report.failedRequests.push(message);
  });
}

async function layoutAudit(page) {
  return page.evaluate(() => {
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
            style.visibility !== "hidden" &&
            style.display !== "none",
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
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    const context = await makeContext(viewport);
    const page = await context.newPage();
    auditPage(page);
    await page.goto(
      `${baseUrl}/studio/obstacles/profile-wing?fixture=clean-dog-side`,
      { waitUntil: "load" },
    );
    const twoD = page.getByTestId("profile-wing-2d");
    await twoD.waitFor();
    await page
      .getByTestId("profile-wing-capability")
      .filter({ hasText: "matching 3D extrusion ready" })
      .waitFor({ timeout: 20_000 });

    const hashes = await page.evaluate(() => {
      const stage = document.querySelector(".profile-wing-visual-stage");
      const twoDNode = document.querySelector(
        '[data-testid="profile-wing-2d"]',
      );
      const three = document.querySelector('[data-testid="profile-wing-3d"]');
      const canvas = three?.querySelector("canvas");
      return {
        stage: stage?.getAttribute("data-geometry-sha256"),
        twoD: twoDNode?.getAttribute("data-geometry-sha256"),
        three: three?.getAttribute("data-geometry-sha256"),
        canvas: canvas?.getAttribute("data-geometry-sha256"),
        parity: stage?.getAttribute("data-parity"),
        wingSources: [
          ...document.querySelectorAll("[data-source-geometry-sha256]"),
        ].map((node) => node.getAttribute("data-source-geometry-sha256")),
      };
    });
    assert.match(hashes.stage ?? "", /^[a-f0-9]{64}$/);
    assert.equal(hashes.stage, hashes.twoD);
    assert.equal(hashes.stage, hashes.three);
    assert.equal(hashes.stage, hashes.canvas);
    assert.equal(hashes.parity, "exact");
    assert.deepEqual(hashes.wingSources, [hashes.stage, hashes.stage]);
    report.hashes = hashes;

    await page.getByRole("button", { name: "3D" }).click();
    assert.equal(
      await page.getByRole("button", { name: "3D" }).getAttribute("class"),
      "is-selected",
    );
    const layout = await layoutAudit(page);
    assert.equal(layout.overflowX, 0);
    assert.deepEqual(layout.tooSmall, []);
    report.viewports.push(layout);
    const screenshotName = `profile-wing-${viewport.width}x${viewport.height}.png`;
    const screenshotPath = path.join(screenshotDirectory, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.screenshots.push(path.relative(process.cwd(), screenshotPath));
    await context.close();
  }
  checked("2.5D and Three.js consume the exact same geometry hash");
  checked("3D reaches ready state and can be selected");
  checked("responsive layouts have no horizontal overflow");
  checked("visible links and buttons meet the 44 px target");

  const fallbackContext = await makeContext({ width: 1440, height: 1000 });
  const fallbackPage = await fallbackContext.newPage();
  auditPage(fallbackPage);
  await fallbackPage.goto(
    `${baseUrl}/studio/obstacles/profile-wing?fixture=clean-dog-side&force3d=fail`,
    { waitUntil: "load" },
  );
  await fallbackPage
    .getByTestId("profile-wing-capability")
    .filter({ hasText: "intentionally disabled" })
    .waitFor();
  const fallbackHash = await fallbackPage
    .getByTestId("profile-wing-2d")
    .getAttribute("data-geometry-sha256");
  assert.equal(fallbackHash, report.hashes.twoD);
  assert.equal(
    await fallbackPage.getByRole("button", { name: "3D" }).isDisabled(),
    true,
  );
  assert.equal(
    await fallbackPage.getByTestId("profile-wing-2d").isVisible(),
    true,
  );
  const fallbackScreenshot = path.join(
    screenshotDirectory,
    "profile-wing-forced-fallback.png",
  );
  await fallbackPage.screenshot({ path: fallbackScreenshot, fullPage: true });
  report.screenshots.push(path.relative(process.cwd(), fallbackScreenshot));
  await fallbackContext.close();
  checked("forced 3D failure preserves the exact 2.5D silhouette");

  const blockedContext = await makeContext({ width: 375, height: 812 }, false);
  const blockedPage = await blockedContext.newPage();
  auditPage(blockedPage);
  await blockedPage.goto(`${baseUrl}/studio/obstacles/profile-wing`, {
    waitUntil: "load",
  });
  await blockedPage
    .getByRole("heading", {
      name: "No currently accepted silhouette is available.",
    })
    .waitFor();
  assert.equal(await blockedPage.getByTestId("profile-wing-2d").count(), 0);
  await blockedContext.close();
  checked(
    "missing current acceptance blocks derivation without placeholder geometry",
  );

  assert.equal(report.executionBoundary.productApiPostCallsMade, 0);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.consoleProblems, []);
  checked("zero POST, external, failed-request, and console-error activity");
} finally {
  await browser.close();
}

await writeFile(
  path.join(evidenceDirectory, "phase-1h-c2-browser-acceptance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      checks: report.checks.length,
      geometrySha256: report.hashes.twoD,
      viewports: report.viewports.length,
      screenshots: report.screenshots.length,
      externalCalls: report.executionBoundary.externalProviderCallsMade,
    },
    null,
    2,
  ),
);
