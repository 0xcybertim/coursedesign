import "server-only";

import { parseAuthenticationConfig } from "./auth-config";

export type AuthenticationProviderWebhookEvent =
  | {
      readonly id: string;
      readonly type: "session.revoked";
      readonly sessionId: string;
      readonly subject: string;
      readonly expiresAt: Date;
    }
  | {
      readonly id: string;
      readonly type: "user.deleted";
      readonly subject: string;
    }
  | {
      readonly id: string;
      readonly type: "ignored";
      readonly providerType: string;
    };

type WebhookVerifier = (
  payload: string,
  signature: string,
) => Promise<AuthenticationProviderWebhookEvent>;

let testVerifier: WebhookVerifier | undefined;

async function verifyWorkosWebhook(
  payload: string,
  signature: string,
): Promise<AuthenticationProviderWebhookEvent> {
  const config = parseAuthenticationConfig();
  const { getWorkOS } = await import("@workos-inc/authkit-nextjs");
  const event = await getWorkOS().webhooks.constructEvent({
    payload,
    sigHeader: signature,
    secret: config.webhookSecret,
    tolerance: 300,
  });
  if (event.event === "session.revoked") {
    return {
      id: event.id,
      type: "session.revoked",
      sessionId: event.data.id,
      subject: event.data.userId,
      expiresAt: new Date(event.data.expiresAt),
    };
  }
  if (event.event === "user.deleted") {
    return {
      id: event.id,
      type: "user.deleted",
      subject: event.data.id,
    };
  }
  return { id: event.id, type: "ignored", providerType: event.event };
}

export async function verifyAuthenticationProviderWebhook(
  payload: string,
  signature: string,
): Promise<AuthenticationProviderWebhookEvent> {
  return (testVerifier ?? verifyWorkosWebhook)(payload, signature);
}

export function setAuthenticationProviderWebhookVerifierForTests(
  verifier: WebhookVerifier | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "The authentication webhook test verifier is forbidden in production.",
    );
  }
  testVerifier = verifier;
}
