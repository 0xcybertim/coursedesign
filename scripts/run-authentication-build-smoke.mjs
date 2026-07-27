import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.AUTHENTICATION_BUILD_SMOKE_PORT ?? "3102");
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error(
    "AUTHENTICATION_BUILD_SMOKE_PORT must be an integer from 1024 to 65535.",
  );
}

const baseUrl = `http://localhost:${port}`;
const environment = {
  ...process.env,
  PERSISTENCE_MODE: "server",
  DATABASE_URL: "postgresql://localhost/coursedesign_build_smoke_test",
  GCS_PROJECT_ID: "course-design-authentication-build-smoke",
  GCS_BUCKET: "course-design-authentication-build-smoke-private",
  GCS_LOCATION: "europe-west3",
  GCS_CLIENT_EMAIL: "authentication-build-smoke@example.invalid",
  GCS_PRIVATE_KEY: "authentication-build-smoke-does-not-use-gcs",
  PERSISTENCE_LOCAL_FAKE_STORAGE: "true",
  ALLOWED_ORIGINS: baseUrl,
  AUTH_BASE_URL: baseUrl,
  WORKOS_CLIENT_ID: "client_course_design_authentication_build_smoke",
  WORKOS_API_KEY: "sk_test_course_design_authentication_build_smoke",
  WORKOS_WEBHOOK_SECRET: "whsec_course_design_authentication_build_smoke",
  WORKOS_COOKIE_PASSWORD: randomBytes(48).toString("base64url"),
  WORKOS_COOKIE_NAME: "course-design-auth",
  WORKOS_COOKIE_MAX_AGE: "604800",
  WORKOS_COOKIE_SAMESITE: "lax",
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: `${baseUrl}/auth/callback`,
  AUTH_ACCEPTANCE_TEST_MODE: "true",
  AUTH_ACCEPTANCE_TEST_SECRET: randomBytes(48).toString("base64url"),
};
delete environment.NODE_ENV;
delete environment.WORKOS_COOKIE_DOMAIN;

function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: environment,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    if (capture) {
      for (const stream of [child.stdout, child.stderr]) {
        stream.on("data", (chunk) => {
          const text = chunk.toString();
          output += text;
          process.stdout.write(text);
        });
      }
    }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }.`,
        ),
      );
    });
  });
}

async function waitForServer(server) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `The production smoke server exited with code ${server.exitCode}.`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
      if (response.status === 200) return response;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The production smoke server did not become ready.");
}

const buildOutput = await run("pnpm", ["exec", "next", "build"], true);
assert.match(
  buildOutput.replaceAll(/\u001b\[[0-9;]*m/g, ""),
  /Proxy \(Middleware\)/,
);

const server = spawn(
  "pnpm",
  ["exec", "next", "start", "-H", "localhost", "-p", String(port)],
  {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  },
);

let stopping = false;
function stopServer() {
  if (stopping || server.exitCode !== null) return;
  stopping = true;
  server.kill("SIGTERM");
}
process.once("SIGINT", stopServer);
process.once("SIGTERM", stopServer);

const report = {
  schemaVersion: "course-design-workos-production-build-smoke-v2",
  status: "running",
  target: baseUrl,
  productionMutated: false,
  checks: [],
  notes: [
    "This uses non-secret placeholders and does not contact WorkOS, Render, PostgreSQL, or Google Cloud Storage.",
    "It does not replace exact WorkOS staging or Render production acceptance.",
  ],
};

try {
  const home = await waitForServer(server);
  const body = await home.text();
  assert.match(body, />Sign in</);
  assert.match(body, />Create an account</);
  report.checks.push({
    name: "signed-out production boundary",
    result: "pass",
    detail:
      "The production server rendered only the WorkOS sign-in and account-creation entry.",
  });

  const testSession = await fetch(
    `${baseUrl}/api/authentication/test-session`,
    {
      method: "POST",
      headers: {
        origin: baseUrl,
        "sec-fetch-site": "same-origin",
        "x-course-design-csrf": "same-origin",
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  assert.equal(testSession.status, 404);
  report.checks.push({
    name: "production test seam disabled",
    result: "pass",
    detail:
      "Production returned 404 even while acceptance-test environment variables were deliberately present.",
  });

  const capabilities = await fetch(
    `${baseUrl}/api/authentication/capabilities`,
  );
  assert.equal(capabilities.status, 200);
  const capabilityText = await capabilities.text();
  assert.doesNotMatch(
    capabilityText,
    /accessToken|refreshToken|sessionId|cookiePassword/,
  );
  assert.match(capabilities.headers.get("cache-control") ?? "", /no-store/);
  report.checks.push({
    name: "private no-store capability response",
    result: "pass",
    detail:
      "The public capability response was no-store and contained no session or provider secrets.",
  });

  report.checks.push({
    name: "Next.js proxy recognized",
    result: "pass",
    detail:
      "The production build listed the authentication proxy as Proxy (Middleware).",
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure =
    error instanceof Error
      ? error.message
      : "Unknown production smoke failure.";
  throw error;
} finally {
  stopServer();
  await writeFile(
    path.resolve("docs/authentication/production-build-smoke.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}

process.stdout.write(
  "Authentication production build smoke passed. Evidence: docs/authentication/production-build-smoke.json\n",
);
