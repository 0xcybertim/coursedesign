import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = Number(process.env.AUTHENTICATION_QA_PORT ?? "3100");
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error(
    "AUTHENTICATION_QA_PORT must be an integer from 1024 to 65535.",
  );
}

const baseUrl = `http://localhost:${port}`;
const databaseUrl =
  process.env.COURSE_DESIGN_TEST_DATABASE_URL ??
  "postgresql://localhost/coursedesign_test";
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!databaseName.endsWith("_test")) {
  throw new Error(
    "Refusing authentication QA: the database name must end in _test.",
  );
}

const environment = {
  ...process.env,
  PERSISTENCE_MODE: "server",
  DATABASE_URL: databaseUrl,
  DATABASE_POOL_MAX: "5",
  DATABASE_CONNECTION_TIMEOUT_MS: "5000",
  DATABASE_IDLE_TIMEOUT_MS: "30000",
  DATABASE_STATEMENT_TIMEOUT_MS: "10000",
  DATABASE_TRANSACTION_TIMEOUT_MS: "15000",
  GCS_PROJECT_ID: "course-design-local-authentication-qa",
  GCS_BUCKET: "course-design-local-authentication-qa-private",
  GCS_LOCATION: "europe-west3",
  GCS_CLIENT_EMAIL: "authentication-qa@example.invalid",
  GCS_PRIVATE_KEY: "local-authentication-qa-does-not-use-gcs",
  PERSISTENCE_LOCAL_FAKE_STORAGE: "true",
  ALLOWED_ORIGINS: baseUrl,
  AUTH_BASE_URL: baseUrl,
  WORKOS_CLIENT_ID: "client_course_design_local_authentication_qa",
  WORKOS_API_KEY: "sk_test_course_design_local_authentication_qa",
  WORKOS_WEBHOOK_SECRET: "whsec_course_design_local_authentication_qa",
  WORKOS_COOKIE_PASSWORD: randomBytes(48).toString("base64url"),
  WORKOS_COOKIE_NAME: "course-design-auth",
  WORKOS_COOKIE_MAX_AGE: "604800",
  WORKOS_COOKIE_SAMESITE: "lax",
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: `${baseUrl}/auth/callback`,
  AUTH_ACCEPTANCE_TEST_MODE: "true",
  AUTH_ACCEPTANCE_TEST_SECRET: randomBytes(48).toString("base64url"),
  AUTHENTICATION_ACCEPTANCE_BASE_URL: baseUrl,
};
delete environment.NODE_ENV;
delete environment.WORKOS_COOKIE_DOMAIN;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
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
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `The local authentication QA server exited with code ${server.exitCode}.`,
      );
    }
    try {
      const response = await fetch(
        `${baseUrl}/api/authentication/capabilities`,
        { redirect: "manual" },
      );
      if (response.status === 200) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The local authentication QA server did not become ready.");
}

await run("pnpm", ["exec", "tsx", "scripts/db/prepare-authentication-qa.ts"]);

const server = spawn(
  "pnpm",
  ["exec", "next", "dev", "-H", "localhost", "-p", String(port)],
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

try {
  await waitForServer(server);
  await run("node", ["scripts/verify-authentication-browser.mjs"]);
  process.stdout.write(
    "Authentication local QA passed. Evidence: docs/authentication/local-browser-acceptance.json\n",
  );
} finally {
  stopServer();
}
