import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthenticationPanel } from "@/components/auth/AuthenticationPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authentication panel", () => {
  it("sends signed-out users only to the hosted WorkOS flows", () => {
    render(<AuthenticationPanel authentication={{ state: "signed-out" }} />);

    expect(
      screen.getByRole("link", { name: "Continue to sign in" }),
    ).toHaveAttribute("href", "/account/sign-in");
    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/account/sign-up");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("shows the authenticated profile without exposing provider tokens", () => {
    render(
      <AuthenticationPanel
        authentication={{
          state: "signed-in",
          user: {
            name: "Test Rider",
            email: "rider@example.test",
            emailVerified: true,
          },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Test Rider" })).toBeVisible();
    expect(screen.getByText("rider@example.test")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete account" }),
    ).toBeVisible();
    expect(document.body.textContent).not.toMatch(/access[_ -]?token/i);
  });

  it("uses a protected same-origin mutation for sign-out", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    render(
      <AuthenticationPanel
        authentication={{
          state: "signed-in",
          user: {
            name: "Test Rider",
            email: "rider@example.test",
            emailVerified: true,
          },
        }}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Sign out" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/authentication/sign-out",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "x-course-design-csrf": "same-origin" },
      }),
    );
  });

  it("requires explicit confirmation before requesting account deletion", async () => {
    const fetch = vi.fn(
      () =>
        new Promise<Response>(() => {
          // Keep the confirmed destructive request pending.
        }),
    );
    vi.stubGlobal("fetch", fetch);
    render(
      <AuthenticationPanel
        authentication={{
          state: "signed-in",
          user: {
            name: "Test Rider",
            email: "rider@example.test",
            emailVerified: true,
          },
        }}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Delete account" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "permanently deletes the WorkOS account",
    );

    await user.click(
      screen.getByRole("button", { name: "Yes, delete my account" }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/account/delete/request",
        expect.objectContaining({
          method: "POST",
          credentials: "same-origin",
          headers: { "x-course-design-csrf": "same-origin" },
        }),
      ),
    );
  });

  it("fails closed without touching browser-local data when auth is unavailable", () => {
    render(<AuthenticationPanel authentication={{ state: "unavailable" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Browser-local data was not read or changed.",
    );
  });
});
