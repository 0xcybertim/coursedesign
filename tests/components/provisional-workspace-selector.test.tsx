import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProvisionalWorkspaceSelector } from "@/components/workspace/ProvisionalWorkspaceSelector";
import { UNVERIFIED_WORKSPACE_WARNING } from "@/domain/identity";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public workspace selector", () => {
  it("explains the insecure selector before entry without authentication claims", () => {
    render(<ProvisionalWorkspaceSelector />);
    expect(screen.getByRole("note")).toHaveTextContent(
      UNVERIFIED_WORKSPACE_WARNING,
    );
    expect(
      screen.getByRole("textbox", { name: "Public workspace email" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /password|magic link|email verified|verification link/i,
      ),
    ).toBeNull();
  });

  it("keeps the exact warning visible after a server workspace opens", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          workspace: {
            displayName: "Course Design workspace",
            warning: UNVERIFIED_WORKSPACE_WARNING,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<ProvisionalWorkspaceSelector />);
    await user.type(
      screen.getByRole("textbox", { name: "Public workspace email" }),
      "workspace-a@example.test",
    );
    await user.click(
      screen.getByRole("button", { name: "Open server workspace" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Course Design workspace",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      UNVERIFIED_WORKSPACE_WARNING,
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/workspace/select",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );
  });
});
