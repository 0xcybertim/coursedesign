import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/AppShell";
import { LanguageProvider } from "@/i18n/LanguageProvider";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  navigation.pathname = "/";
});

function renderShell(children: React.ReactNode, labEnabled = false) {
  return render(
    <LanguageProvider>
      <AppShell labEnabled={labEnabled}>{children}</AppShell>
    </LanguageProvider>,
  );
}

describe("shared Course Design application shell", () => {
  it("renders one global navigation, active state, and a skip target", async () => {
    navigation.pathname = "/designs";
    renderShell(
      <main>
        <h1>Design library</h1>
      </main>,
    );
    expect(screen.getByRole("link", { name: "Course Design" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Designs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.queryByRole("link", { name: "Lab" })).toBeNull();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole("main")).toHaveAttribute("id", "page-main"),
    );
    expect(
      screen.getByRole("link", { name: "Skip to page content" }),
    ).toHaveAttribute("href", "#page-main");
  });

  it("opens an accessible mobile menu, traps focus, and restores it on Escape", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderShell(
      <main>
        <h1>Home</h1>
        <button type="button">Background action</button>
      </main>,
    );
    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toBeVisible();
    expect(
      screen.getByText("Background action").closest(".app-page"),
    ).toHaveAttribute("inert");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("shows Lab only when explicitly enabled or already in Lab", () => {
    const { rerender } = render(
      <LanguageProvider>
        <AppShell labEnabled={true}>
          <main>
            <h1>Home</h1>
          </main>
        </AppShell>
      </LanguageProvider>,
    );
    expect(screen.getByRole("link", { name: "Lab" })).toHaveAttribute(
      "href",
      "/lab",
    );
    navigation.pathname = "/lab";
    rerender(
      <LanguageProvider>
        <AppShell labEnabled={false}>
          <main>
            <h1>Developer Lab</h1>
          </main>
        </AppShell>
      </LanguageProvider>,
    );
    expect(screen.getByRole("link", { name: "Lab" })).toBeVisible();
  });

  it("switches the interface to Dutch and persists the choice", async () => {
    const user = userEvent.setup();
    renderShell(
      <main>
        <h1>Customize a jump. Build a course.</h1>
      </main>,
    );

    const picker = screen.getByRole("combobox", { name: "Language" });
    expect(picker).toHaveValue("en");
    await user.selectOptions(picker, "nl");

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Pas een sprong aan. Bouw een parcours.",
        }),
      ).toBeVisible(),
    );
    expect(screen.getByRole("link", { name: "Overzicht" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Ontwerpen" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Taal" })).toHaveValue("nl");
    expect(document.documentElement).toHaveAttribute("lang", "nl");
    expect(window.localStorage.getItem("course-design-language")).toBe("nl");
  });

  it("loads a previously selected Dutch interface", async () => {
    window.localStorage.setItem("course-design-language", "nl");
    renderShell(
      <main>
        <h1>Courses</h1>
      </main>,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Parcoursen" })).toBeVisible(),
    );
    expect(screen.getByRole("combobox", { name: "Taal" })).toHaveValue("nl");
  });

  it("labels server mode truthfully and preserves browser-local data", () => {
    const browserLocal = "recognizable-browser-local-work";
    window.localStorage.setItem(
      "course-design.spj-04.local-workspace.v1",
      browserLocal,
    );
    render(
      <LanguageProvider>
        <AppShell labEnabled={false} persistenceMode="server">
          <main>
            <h1>Server-backed page</h1>
          </main>
        </AppShell>
      </LanguageProvider>,
    );

    expect(
      screen.getByRole("link", {
        name: "Private team workspace · server-backed",
      }),
    ).toBeVisible();
    expect(
      screen.queryByText("Local prototype · saved in this browser"),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Continue to sign in" }),
    ).toHaveAttribute("href", "/account/sign-in");
    expect(
      screen.queryByText(
        "Unverified email workspace. Anyone who enters this email can access and change this work.",
      ),
    ).toBeNull();
    expect(
      window.localStorage.getItem("course-design.spj-04.local-workspace.v1"),
    ).toBe(browserLocal);
  });

  it("does not retain a local password-recovery route or open a private workspace", () => {
    navigation.pathname = "/account/reset-password";
    render(
      <LanguageProvider>
        <AppShell labEnabled={false} persistenceMode="server">
          <main>
            <h1>Choose a new password</h1>
          </main>
        </AppShell>
      </LanguageProvider>,
    );

    expect(
      screen.queryByRole("heading", { name: "Choose a new password" }),
    ).toBeNull();
    expect(
      screen.getByText("Sign in to open your private team workspace."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Continue to sign in" }),
    ).toBeVisible();
  });
});
