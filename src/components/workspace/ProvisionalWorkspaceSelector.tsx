"use client";

import { useEffect, useState, type FormEvent } from "react";

import { UNVERIFIED_WORKSPACE_WARNING } from "@/domain/identity";
import type { ProvisionalWorkspaceSummary } from "@/persistence";
import {
  COURSE_DESIGN_CSRF_HEADER,
  COURSE_DESIGN_CSRF_VALUE,
} from "@/persistence/request-policy-values";

interface WorkspaceSelectionResponse {
  readonly ok: true;
  readonly workspace: ProvisionalWorkspaceSummary;
}

export function ProvisionalWorkspaceSelector(props: {
  readonly initialWorkspace?: ProvisionalWorkspaceSummary | null;
  readonly checkExistingSession?: boolean;
  readonly onWorkspaceChange?: () => void;
}) {
  const [workspace, setWorkspace] =
    useState<ProvisionalWorkspaceSummary | null>(
      props.initialWorkspace ?? null,
    );
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!props.checkExistingSession) return;
    let cancelled = false;
    void fetch("/api/workspace/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          readonly ok?: boolean;
          readonly value?: ProvisionalWorkspaceSummary;
        };
        if (!cancelled && payload.ok && payload.value) {
          setWorkspace(payload.value);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [props.checkExistingSession]);

  async function selectWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/workspace/select", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE,
        },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as
        | WorkspaceSelectionResponse
        | {
            readonly ok: false;
            readonly error?: { readonly message?: string };
          };
      if (!response.ok || !payload.ok) {
        setStatus(
          !payload.ok && payload.error?.message
            ? payload.error.message
            : "The public workspace could not be opened. Try again.",
        );
        return;
      }
      setWorkspace(payload.workspace);
      setEmail("");
      setStatus("Server workspace opened.");
      props.onWorkspaceChange?.();
    } catch {
      setStatus("The public workspace could not be opened. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function clearWorkspace() {
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/workspace/session", {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          [COURSE_DESIGN_CSRF_HEADER]: COURSE_DESIGN_CSRF_VALUE,
        },
      });
      if (!response.ok) {
        setStatus("The public workspace session could not be cleared.");
        return;
      }
      setWorkspace(null);
      setStatus("Public workspace closed. Server data was not deleted.");
      props.onWorkspaceChange?.();
    } catch {
      setStatus("The public workspace session could not be cleared.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="public-workspace-title">
      <p className="eyebrow">Server workspace selector</p>
      <h1 id="public-workspace-title">
        {workspace ? workspace.displayName : "Open a public workspace"}
      </h1>
      <p role="note">{UNVERIFIED_WORKSPACE_WARNING}</p>
      {workspace ? (
        <button disabled={pending} onClick={clearWorkspace} type="button">
          {pending ? "Closing…" : "Clear or switch workspace"}
        </button>
      ) : (
        <form onSubmit={selectWorkspace}>
          <label htmlFor="public-workspace-email">Public workspace email</label>
          <input
            autoComplete="email"
            id="public-workspace-email"
            maxLength={320}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <button disabled={pending} type="submit">
            {pending ? "Opening…" : "Open server workspace"}
          </button>
        </form>
      )}
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}
