import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LOCAL_SILHOUETTE_REVIEW_KEY,
  appendSilhouetteDecision,
  createEmptySilhouetteReview,
  serializeLocalSilhouetteReview,
} from "@/domain/silhouette";
import {
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  parseLocalDesignLibrary,
} from "@/domain/design";
import { ProfileWingStudioClient } from "@/components/profile-wing/ProfileWingStudioClient";

function acceptedDogReview() {
  const result = appendSilhouetteDecision(createEmptySilhouetteReview(), {
    decisionId: "decision-clean-dog-side",
    fixtureId: "clean-dog-side",
    action: "accepted_for_future_prototyping",
    createdAt: "2026-07-23T08:00:00.000Z",
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("Phase 1H-C2 profile-wing renderer parity", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("blocks honestly until a current accepted B2 decision exists", async () => {
    render(<ProfileWingStudioClient forceThreeFailure />);
    expect(
      await screen.findByRole("heading", {
        name: "No currently accepted silhouette is available.",
      }),
    ).toBeVisible();
    expect(screen.queryByTestId("profile-wing-2d")).not.toBeInTheDocument();
  });

  it("exposes one shared geometry hash in the 2.5D and stage contracts", async () => {
    window.localStorage.setItem(
      LOCAL_SILHOUETTE_REVIEW_KEY,
      serializeLocalSilhouetteReview(acceptedDogReview()),
    );
    const { container } = render(
      <ProfileWingStudioClient
        requestedFixtureId="clean-dog-side"
        forceThreeFailure
      />,
    );

    const twoD = await screen.findByTestId("profile-wing-2d");
    const hash = twoD.getAttribute("data-geometry-sha256");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      container.querySelector(".profile-wing-visual-stage"),
    ).toHaveAttribute("data-geometry-sha256", hash);
    expect(
      container.querySelector(".profile-wing-visual-stage"),
    ).toHaveAttribute("data-parity", "exact");
    expect(
      container.querySelectorAll(`[data-source-geometry-sha256="${hash}"]`),
    ).toHaveLength(2);
  });

  it("keeps the exact 2.5D silhouette active when 3D fails", async () => {
    window.localStorage.setItem(
      LOCAL_SILHOUETTE_REVIEW_KEY,
      serializeLocalSilhouetteReview(acceptedDogReview()),
    );
    render(<ProfileWingStudioClient forceThreeFailure />);

    const twoD = await screen.findByTestId("profile-wing-2d");
    await waitFor(() => {
      expect(screen.getByTestId("profile-wing-capability")).toHaveTextContent(
        "intentionally disabled",
      );
    });
    expect(twoD).toBeVisible();
    expect(screen.getByRole("button", { name: "2.5D" })).toHaveClass(
      "is-selected",
    );
    expect(screen.getByRole("button", { name: "3D" })).toBeDisabled();
  });

  it("saves and restores an immutable generated revision in library v2", async () => {
    window.localStorage.setItem(
      LOCAL_SILHOUETTE_REVIEW_KEY,
      serializeLocalSilhouetteReview(acceptedDogReview()),
    );
    const user = userEvent.setup();
    const first = render(
      <ProfileWingStudioClient
        requestedFixtureId="clean-dog-side"
        forceThreeFailure
      />,
    );
    const save = await screen.findByRole("button", {
      name: "Save immutable generated revision",
    });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    expect(screen.getByTestId("profile-wing-library-status")).toHaveTextContent(
      "Immutable generated-prototype revision saved",
    );
    expect(screen.getByText("Revision 01")).toBeVisible();
    const serialized = window.localStorage.getItem(
      LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
    );
    expect(parseLocalDesignLibrary(serialized ?? "")).toMatchObject({
      ok: true,
      value: {
        profileWingRevisions: [
          {
            designId: "local-profile-wing-clean-dog-side",
            ordinal: 1,
            snapshot: {
              kind: "profile-wing-generated",
              provenance: {
                classification: "generated",
                evidenceStatus: "inferred_not_supplier_confirmed",
              },
            },
          },
        ],
      },
    });

    first.unmount();
    render(
      <ProfileWingStudioClient
        requestedFixtureId="clean-dog-side"
        forceThreeFailure
      />,
    );
    expect(
      await screen.findByText("1 saved revisions for this design"),
    ).toBeVisible();
    expect(screen.getByText("Revision 01")).toBeVisible();
  });
});
