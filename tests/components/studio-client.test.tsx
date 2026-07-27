import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioClient } from "@/components/studio/StudioClient";
import {
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  parseLocalDesignLibrary,
} from "@/domain/design";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/designs/local-spj-04/edit");
});

async function waitForLocalReady() {
  await waitFor(() => {
    expect(screen.getByTestId("local-save-status")).not.toHaveTextContent(
      "Checking",
    );
  });
}

describe("SPJ-04 studio interface", () => {
  it("keeps standard, described, and uploaded wings inside one configurator", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          enabled: true,
          provider: "deterministic-test",
          reason: "enabled",
          automaticRetries: 0,
          externalCallOccursOnlyOnPost: true,
        }),
      })),
    );
    render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();

    expect(
      screen.getByRole("radio", { name: /Standard panels/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Describe custom wings/i }),
    ).toBeVisible();
    const imageStyle = screen.getByRole("radio", {
      name: /Upload a wing image/i,
    });
    expect(imageStyle).toBeVisible();

    await user.click(imageStyle);

    expect(window.location.search).toBe("?wing=image");
    expect(
      screen.getByRole("heading", {
        name: "Build custom wings from an image",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Start with one clear subject." }),
    ).toBeVisible();
    expect(screen.queryByTestId("local-save-status")).toBeNull();
    expect(
      screen.getByText(
        "Standard foundation shown until the custom silhouette is approved.",
      ),
    ).toBeVisible();

    await user.click(screen.getByRole("radio", { name: /Standard panels/i }));
    expect(window.location.search).toBe("");
    expect(
      screen.getByRole("radio", { name: "White frame, selected" }),
    ).toBeVisible();
    expect(screen.getByTestId("local-save-status")).toBeVisible();
  });

  it("shows named swatches with a visible selected state", () => {
    render(<StudioClient forceThreeFailure />);
    expect(
      screen.getByRole("radio", { name: "White frame, selected" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Blue frame" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Red frame" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Yellow frame" })).toBeVisible();
  });

  it("supports keyboard operation for options", async () => {
    const user = userEvent.setup();
    render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();
    const red = screen.getByRole("radio", { name: "Red frame" });
    red.focus();
    await user.keyboard("[Space]");
    expect(red).toHaveAttribute("aria-checked", "true");
    expect(red).toHaveFocus();
  });

  it("keeps the supplier evidence and prototype warning visible", () => {
    render(<StudioClient forceThreeFailure />);
    expect(screen.getByTestId("price-label")).toHaveTextContent(
      "Prototype supplier example · CNY 9,000 · excludes tax, freight and retail markup",
    );
    expect(
      screen.getAllByText("Non-sellable prototype").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Add to course" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Save a revision to add it to a course."),
    ).toBeVisible();
  });

  it("updates the visual, hashes, bill of materials and specification from one option change", async () => {
    const user = userEvent.setup();
    const { container } = render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();
    const initialHash = screen
      .getByTestId("2d-view")
      .getAttribute("data-configuration-hash");

    await user.click(screen.getByRole("radio", { name: "Red frame" }));
    await user.click(screen.getByRole("radio", { name: "Gate" }));

    const nextHash = screen
      .getByTestId("2d-view")
      .getAttribute("data-configuration-hash");
    expect(nextHash).not.toBe(initialHash);
    expect(screen.getByTestId("2d-view")).toHaveAttribute(
      "data-configuration-hash",
      nextHash,
    );
    expect(screen.getByTestId("lower-element-visual")).toBeInTheDocument();
    expect(
      container.querySelector('[data-component-key="lower_element"]'),
    ).toHaveTextContent("1");
    expect(screen.getByTestId("spec-summary")).toHaveTextContent("red frame");
    expect(screen.getByTestId("surcharge-status")).toHaveTextContent(
      "Example unchanged",
    );
    expect(screen.getAllByTitle(nextHash ?? "").length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it("leaves 2.5D and current selections intact when the 3D upgrade fails", async () => {
    const user = userEvent.setup();
    render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();
    await user.click(screen.getByRole("radio", { name: "Blue frame" }));
    await user.click(screen.getByRole("radio", { name: "Filler" }));

    await waitFor(() => {
      expect(screen.getByTestId("capability-status")).toHaveTextContent(
        "intentionally disabled",
      );
    });
    expect(screen.getByTestId("2d-view")).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "Blue frame, selected" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Filler" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("bom-summary")).toHaveTextContent("filler");
  });

  it("exposes reduced-motion state and keeps the direct visual update", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();

    await waitFor(() => {
      expect(
        screen.getByTestId("2d-view").closest(".visual-stage"),
      ).toHaveAttribute("data-reduced-motion", "true");
    });
    fireEvent.click(screen.getByRole("radio", { name: "Panel" }));
    expect(screen.getByTestId("lower-element-visual")).toBeInTheDocument();
  });

  it("automatically restores the mutable draft after a real remount", async () => {
    const user = userEvent.setup();
    const first = render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();
    await user.click(screen.getByRole("radio", { name: "Red frame" }));
    await user.click(screen.getByRole("radio", { name: "Gate" }));

    const serialized = window.localStorage.getItem(
      LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
    );
    expect(serialized).not.toBeNull();
    const stored = parseLocalDesignLibrary(serialized ?? "");
    expect(stored).toMatchObject({
      ok: true,
      value: {
        spj04Workspace: {
          draft: {
            draftVersion: 3,
            intent: { frameColor: "red", lowerElement: "gate" },
          },
        },
      },
    });

    first.unmount();
    render(<StudioClient forceThreeFailure />);
    await waitFor(() => {
      expect(screen.getByTestId("local-save-status")).toHaveTextContent(
        "Draft restored on this device",
      );
    });
    expect(
      screen.getByRole("radio", { name: "Red frame, selected" }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "Gate" })).toBeChecked();
  });

  it("reopens an immutable revision read-only and duplicates it before editing", async () => {
    const user = userEvent.setup();
    render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();
    await user.click(screen.getByRole("radio", { name: "Red frame" }));
    await user.click(screen.getByRole("radio", { name: "Gate" }));
    const revisionHash = screen
      .getByTestId("2d-view")
      .getAttribute("data-configuration-hash");
    await user.click(
      screen.getByRole("button", { name: "Save immutable revision" }),
    );

    expect(screen.getByText("Club Classic · Revision 1")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Blue frame" }));
    await user.click(screen.getByRole("radio", { name: "Filler" }));
    await user.click(screen.getByRole("button", { name: "Open revision 01" }));

    expect(
      screen.getByText("Read-only saved revision", { selector: "span" }),
    ).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "Red frame, selected" }),
    ).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Gate" })).toBeDisabled();
    expect(screen.getByTestId("2d-view")).toHaveAttribute(
      "data-configuration-hash",
      revisionHash,
    );

    await user.click(screen.getByRole("button", { name: "Duplicate to edit" }));
    expect(
      screen.getByRole("radio", { name: "Red frame, selected" }),
    ).toBeEnabled();
    expect(screen.getByTestId("draft-record")).toHaveTextContent("Version1");
    await user.click(screen.getByRole("radio", { name: "Yellow frame" }));
    await user.click(screen.getByRole("button", { name: "Open revision 01" }));
    expect(
      screen.getByRole("radio", { name: "Red frame, selected" }),
    ).toBeDisabled();
  });

  it("restores saved revision history after a remount", async () => {
    const user = userEvent.setup();
    const first = render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();
    await user.click(
      screen.getByRole("button", { name: "Save immutable revision" }),
    );
    first.unmount();

    render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();
    expect(screen.getByText("1 saved revision")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open revision 01" }),
    ).toBeVisible();
  });

  it("offers the exact newly saved revision to the course", async () => {
    const user = userEvent.setup();
    render(<StudioClient forceThreeFailure />);
    await waitForLocalReady();
    await user.click(
      screen.getByRole("button", { name: "Save immutable revision" }),
    );
    const stored = parseLocalDesignLibrary(
      window.localStorage.getItem(LOCAL_DESIGN_LIBRARY_STORAGE_KEY) ?? "",
    );
    if (!stored.ok) throw new Error(stored.error.message);
    const exact = stored.value.spj04Workspace.revisions[0];
    expect(exact).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Add Revision 01 to course" }),
    ).toHaveAttribute(
      "href",
      `/courses/local-course-1?revision=${exact?.revisionId}`,
    );
    expect(
      screen.getByRole("link", { name: "View saved design" }),
    ).toHaveAttribute("href", "/designs/local-spj-04");
  });

  it("does not let malformed browser data become trusted configuration", async () => {
    window.localStorage.setItem(LOCAL_DESIGN_LIBRARY_STORAGE_KEY, "malformed");
    render(<StudioClient forceThreeFailure />);
    await waitFor(() => {
      expect(screen.getByTestId("local-save-status")).toHaveTextContent(
        "Stored draft was invalid",
      );
    });
    expect(
      screen.getByRole("radio", { name: "White frame, selected" }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Open revision/ })).toBeNull();
  });
});
