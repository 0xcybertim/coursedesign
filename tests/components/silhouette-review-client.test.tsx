import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SilhouetteReviewClient } from "../../src/components/silhouette/SilhouetteReviewClient";
import {
  LOCAL_SILHOUETTE_REVIEW_KEY,
  parseLocalSilhouetteReview,
} from "../../src/domain/silhouette/index.ts";

describe("Phase 1H-B2 silhouette review surface", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("shows immutable source/vector evidence and appends an eligible decision", async () => {
    const user = userEvent.setup();
    render(<SilhouetteReviewClient />);
    expect(
      screen.getByRole("heading", {
        name: "Review the silhouette, not an obstacle.",
      }),
    ).toBeVisible();
    expect(
      screen.getByAltText("Approved local source mask for clean-dog-side"),
    ).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: /Canonical clean-dog-side polygon with 50 vertices/,
      }),
    ).toBeVisible();
    expect(screen.getByText(/Zero provider calls/)).toBeVisible();
    expect(screen.getByText(/Still not a product specification/)).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByTestId("silhouette-persistence-status"),
      ).toHaveTextContent(/saved on this device/),
    );
    await user.click(
      screen.getByRole("button", { name: "Accept for future prototyping" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /no product geometry or revision was created/i,
    );
    expect(screen.getByText(/Current:/)).toHaveTextContent(
      /Accepted for future prototyping/,
    );
    const parsed = parseLocalSilhouetteReview(
      localStorage.getItem(LOCAL_SILHOUETTE_REVIEW_KEY) ?? "",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.decisions).toHaveLength(1);
    expect(parsed.value.decisions[0]?.fixtureId).toBe("clean-dog-side");
  });

  it("disables acceptance for rejected evidence and permits retention", async () => {
    const user = userEvent.setup();
    render(<SilhouetteReviewClient />);
    await user.click(screen.getByRole("button", { name: "Must retain 11" }));
    await user.click(screen.getByRole("button", { name: /clean-bicycle/i }));
    expect(
      screen.getByRole("heading", { name: "clean-bicycle" }),
    ).toBeVisible();
    expect(screen.getByText("holes_not_supported")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cannot accept rejected result" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Retain without conversion" }),
    );
    expect(screen.getByText(/Current:/)).toHaveTextContent(
      /Retained without conversion/,
    );
  });

  it("rejects tampered local review metadata visibly", async () => {
    localStorage.setItem(
      LOCAL_SILHOUETTE_REVIEW_KEY,
      JSON.stringify({
        schemaVersion: "1.0.0-phase1h-b2",
        evidenceSha256: "tampered",
        decisions: [],
        updatedAt: "2026-07-22T18:00:00.000Z",
      }),
    );
    render(<SilhouetteReviewClient />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Untrusted browser-local review was rejected/,
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/tampered_review/);
  });

  it("restores an exact decision after remount", async () => {
    const user = userEvent.setup();
    const first = render(<SilhouetteReviewClient />);
    await waitFor(() =>
      expect(
        screen.getByTestId("silhouette-persistence-status"),
      ).toHaveTextContent(/saved on this device/),
    );
    await user.click(
      screen.getByRole("button", { name: "Retain without conversion" }),
    );
    first.unmount();
    await act(async () => render(<SilhouetteReviewClient />));
    await waitFor(() =>
      expect(
        screen.getByTestId("silhouette-persistence-status"),
      ).toHaveTextContent(/restored on this device/),
    );
    expect(screen.getByText(/Current:/)).toHaveTextContent(
      /Retained without conversion/,
    );
  });
});
