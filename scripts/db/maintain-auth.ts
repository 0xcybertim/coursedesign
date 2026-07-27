import { createHmac } from "node:crypto";

import { WorkOS } from "@workos-inc/node";
import { Client } from "pg";

import { parseMigrationConfig } from "../../src/server/config/persistence-config-values.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function retentionDays(): number {
  const raw = process.env.AUTH_AUDIT_RETENTION_DAYS?.trim() || "180";
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 30 || value > 3_650) {
    throw new Error(
      "AUTH_AUDIT_RETENTION_DAYS must be an integer between 30 and 3650.",
    );
  }
  return value;
}

function digest(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret)
    .update(`${purpose}\0${value}`, "utf8")
    .digest("hex");
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 404
  );
}

async function main() {
  const configuration = parseMigrationConfig(process.env);
  const auditRetentionDays = retentionDays();
  const clientId = required("WORKOS_CLIENT_ID");
  const cookiePassword = required("WORKOS_COOKIE_PASSWORD");
  if (new TextEncoder().encode(cookiePassword).byteLength < 32) {
    throw new Error("WORKOS_COOKIE_PASSWORD must contain at least 32 bytes.");
  }
  const workos = new WorkOS(required("WORKOS_API_KEY"));
  const client = new Client({
    connectionString: configuration.migrationDatabaseUrl,
    application_name: "course-design-auth-maintenance-owner",
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  let finalizedPendingDeletions = 0;
  let pendingDeletionFailures = 0;
  try {
    const pending = await client.query<{
      id: string;
      provider_subject: string;
    }>(
      `SELECT id, provider_subject
       FROM auth_identities
       WHERE provider = 'workos'
         AND provider_tenant_id = $1
         AND state = 'deletion_pending'
       ORDER BY created_at
       LIMIT 100`,
      [clientId],
    );
    for (const identity of pending.rows) {
      try {
        await workos.userManagement.deleteUser(identity.provider_subject);
      } catch (error) {
        if (!isNotFound(error)) {
          pendingDeletionFailures += 1;
          continue;
        }
      }
      const now = new Date();
      const deletedSubject = `deleted:${digest(
        cookiePassword,
        "deleted-workos-user",
        identity.provider_subject,
      )}`;
      await client.query("BEGIN");
      try {
        const finalized = await client.query(
          `UPDATE auth_identities
           SET provider_subject = $2,
               email = NULL,
               display_name = NULL,
               email_verified = false,
               state = 'deleted',
               deleted_at = $3,
               updated_at = $3
           WHERE id = $1
             AND state = 'deletion_pending'`,
          [identity.id, deletedSubject, now],
        );
        if (finalized.rowCount === 1) {
          await client.query(
            `UPDATE auth_session_observations
             SET revoked_at = COALESCE(revoked_at, $2),
                 updated_at = $2
             WHERE auth_identity_id = $1`,
            [identity.id, now],
          );
          await client.query(
            `INSERT INTO auth_audit_events (
               actor_auth_identity_id, event_type, outcome, metadata
             )
             VALUES ($1, 'account_deletion_reconciled', 'success', '{}'::jsonb)`,
            [identity.id],
          );
          finalizedPendingDeletions += 1;
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    await client.query("BEGIN");
    await client.query("SELECT set_config('statement_timeout', $1, true)", [
      `${configuration.statementTimeoutMs}ms`,
    ]);
    await client.query("SELECT pg_advisory_xact_lock($1)", [
      (configuration.advisoryLockId + 1n).toString(),
    ]);
    const expiredSessionObservations = await client.query(
      `DELETE FROM auth_session_observations
       WHERE expires_at < now() - interval '7 days'`,
    );
    const expiredRevokedSessions = await client.query(
      `DELETE FROM auth_revoked_provider_sessions
       WHERE expires_at < now() - interval '7 days'`,
    );
    const expiredWebhookEvents = await client.query(
      `DELETE FROM auth_webhook_events
       WHERE processed_at < now() - ($1::int * interval '1 day')`,
      [auditRetentionDays],
    );
    const expiredAuditEvents = await client.query(
      `DELETE FROM auth_audit_events
       WHERE created_at < now() - ($1::int * interval '1 day')`,
      [auditRetentionDays],
    );
    await client.query("COMMIT");
    process.stdout.write(
      JSON.stringify({
        finalizedPendingDeletions,
        pendingDeletionFailures,
        expiredSessionObservations: expiredSessionObservations.rowCount,
        expiredRevokedSessions: expiredRevokedSessions.rowCount,
        expiredWebhookEvents: expiredWebhookEvents.rowCount,
        expiredAuditEvents: expiredAuditEvents.rowCount,
      }) + "\n",
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown maintenance failure.";
  process.stderr.write(`Course Design auth maintenance failed: ${message}\n`);
  process.exitCode = 1;
});
