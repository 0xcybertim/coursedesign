"use client";

import { useState } from "react";

import {
  COURSE_DESIGN_CSRF_HEADER,
  COURSE_DESIGN_CSRF_VALUE,
} from "@/persistence/request-policy-values";

export type AuthenticationView =
  | { readonly state: "signed-out" }
  | { readonly state: "unavailable" }
  | {
      readonly state: "signed-in";
      readonly user: {
        readonly name: string;
        readonly email: string;
        readonly emailVerified: boolean;
      };
    };

async function mutation(path: string): Promise<{
  readonly ok?: boolean;
  readonly message?: string;
  readonly reauthenticateUrl?: string;
}> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE,
    },
  });
  const result = (await response.json()) as {
    readonly ok?: boolean;
    readonly message?: string;
    readonly reauthenticateUrl?: string;
    readonly error?: { readonly message?: string };
  };
  if (result.reauthenticateUrl) return result;
  if (!response.ok || !result.ok) {
    throw new Error(
      result.error?.message || result.message || "The request failed.",
    );
  }
  return result;
}

export function AuthenticationPanel(props: {
  readonly authentication: AuthenticationView;
}) {
  const [pending, setPending] = useState(false);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setStatus(null);
    try {
      await action();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The request could not finish.",
      );
    } finally {
      setPending(false);
    }
  }

  if (props.authentication.state === "unavailable") {
    return (
      <section aria-label="Account" className="authentication-panel">
        <p role="alert">
          Authentication is temporarily unavailable. Browser-local data was not
          read or changed.
        </p>
      </section>
    );
  }

  if (props.authentication.state === "signed-out") {
    return (
      <section
        aria-labelledby="authentication-title"
        className="authentication-panel"
      >
        <header className="authentication-panel__heading">
          <p className="eyebrow">Private team workspace</p>
          <h2 id="authentication-title">Sign in</h2>
          <p>
            WorkOS securely hosts password, email verification, one-time code,
            Google, passkey, and recovery flows.
          </p>
        </header>
        <div className="authentication-panel__body">
          <a className="authentication-primary" href="/account/sign-in">
            Continue to sign in
          </a>
          <a href="/account/sign-up">Create an account</a>
        </div>
      </section>
    );
  }

  const { user } = props.authentication;
  return (
    <section
      aria-labelledby="account-title"
      className="authentication-panel authentication-panel--account"
    >
      <header className="authentication-panel__heading">
        <p className="eyebrow">Team account</p>
        <h2 id="account-title">{user.name}</h2>
        <p>{user.email}</p>
      </header>
      <div className="authentication-panel__body">
        {!user.emailVerified ? (
          <p role="alert">
            Complete email verification in WorkOS before opening the workspace.
          </p>
        ) : null}
        <p>
          Passwords, verification, recovery, social login, and passkeys are
          managed in the hosted WorkOS flow.
        </p>
        <div className="authentication-account-actions">
          <button
            disabled={pending}
            onClick={() =>
              void run(async () => {
                await mutation("/api/authentication/sign-out");
                window.location.assign("/");
              })
            }
            type="button"
          >
            {pending ? "Working…" : "Sign out"}
          </button>
          <a download href="/api/account/export">
            Download my data
          </a>
          {!confirmingDeletion ? (
            <button
              disabled={pending}
              onClick={() => {
                setStatus(null);
                setConfirmingDeletion(true);
              }}
              type="button"
            >
              Delete account
            </button>
          ) : null}
        </div>
        {confirmingDeletion ? (
          <div className="authentication-deletion-confirmation" role="alert">
            <p>
              This permanently deletes the WorkOS account and retires every team
              workspace you own. The retained workspace history becomes
              inaccessible. Browser-local data is not deleted.
            </p>
            <div className="authentication-account-actions">
              <button
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const result = await mutation(
                      "/api/account/delete/request",
                    );
                    if (result.reauthenticateUrl) {
                      window.location.assign(result.reauthenticateUrl);
                      return;
                    }
                    setStatus(
                      result.message ||
                        "The account and its team workspace were retired.",
                    );
                    window.location.assign("/");
                  })
                }
                type="button"
              >
                {pending ? "Deleting…" : "Yes, delete my account"}
              </button>
              <button
                disabled={pending}
                onClick={() => setConfirmingDeletion(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {status ? <p role="status">{status}</p> : null}
      </div>
    </section>
  );
}
