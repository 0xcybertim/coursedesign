import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CourseStudioClient } from "@/components/course/CourseStudioClient";
import { COURSE_STORAGE_KEY, parseCourseDraft } from "@/domain/course";
import {
  createLocalDesignWorkspace,
  createLocalDesignLibrary,
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  saveLocalRevision,
  serializeLocalDesignLibrary,
  updateLocalDraft,
  type LocalDesignWorkspace,
  type LocalWorkspaceResult,
} from "@/domain/design";

const T0 = "2026-07-13T10:00:00.000Z";
const T1 = "2026-07-13T10:01:00.000Z";
const T2 = "2026-07-13T10:02:00.000Z";

afterEach(() => cleanup());
beforeEach(() => window.localStorage.clear());

function success<T>(result: LocalWorkspaceResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function workspaceWithRevisionOne(): LocalDesignWorkspace {
  return success(
    saveLocalRevision(
      createLocalDesignWorkspace({ draftId: "draft-1", now: T0 }),
      { revisionId: "revision-1", now: T1 },
    ),
  );
}

function workspaceWithTwoRevisions(): LocalDesignWorkspace {
  const first = workspaceWithRevisionOne();
  const changed = success(
    updateLocalDraft(
      first,
      { ...first.draft.intent, frameColor: "red", lowerElement: "gate" },
      T2,
    ),
  );
  return success(
    saveLocalRevision(changed, { revisionId: "revision-2", now: T2 }),
  );
}

function storeObstacleWorkspace(workspace: LocalDesignWorkspace) {
  window.localStorage.setItem(
    LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
    serializeLocalDesignLibrary(
      createLocalDesignLibrary({
        now: T2,
        draftId: "unused-migration-draft",
        legacyWorkspace: workspace,
      }),
    ),
  );
}

async function ready() {
  await waitFor(() => {
    expect(screen.getByTestId("course-save-status")).not.toHaveTextContent(
      "Checking",
    );
  });
}

describe("Phase 1C course studio", () => {
  it("shows an honest empty state without a fake placement", async () => {
    render(<CourseStudioClient />);
    await ready();
    expect(screen.getByTestId("course-empty-state")).toHaveTextContent(
      "starts with a saved obstacle revision",
    );
    expect(
      screen.getByRole("link", { name: "Create and save an obstacle" }),
    ).toHaveAttribute("href", "/designs/local-spj-04/edit");
    expect(screen.queryByRole("button", { name: /Obstacle 1/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Horse POV" })).toBeDisabled();
  });

  it("shows real saved revisions and places one repeatedly in the center", async () => {
    storeObstacleWorkspace(workspaceWithRevisionOne());
    const user = userEvent.setup();
    render(<CourseStudioClient />);
    await ready();
    expect(screen.getByRole("radio", { name: /Revision 01/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    expect(screen.getByRole("button", { name: /Obstacle 1,/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Obstacle 2,/ })).toBeVisible();
    expect(screen.getByTestId("quantity-summary")).toHaveTextContent(
      "Obstacle instances2",
    );
    expect(screen.getByTestId("quantity-summary")).toHaveTextContent("Poles8");
    expect(screen.getAllByText(/Obstacle 2 overlaps Obstacle 1/)).toHaveLength(
      2,
    );
    expect(screen.getByRole("link", { name: "Review course" })).toHaveAttribute(
      "href",
      "/courses/local-course-1/review",
    );
  });

  it("selects a requested exact revision without placing it", async () => {
    storeObstacleWorkspace(workspaceWithTwoRevisions());
    render(<CourseStudioClient requestedRevisionId="revision-2" />);
    await ready();
    expect(
      screen.getByText(
        "Requested revision selected and ready to place. Nothing was placed automatically.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /Revision 02/ })).toBeChecked();
    expect(screen.queryByRole("button", { name: /Obstacle 1,/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Edit selected SPJ-04 revision" }),
    ).toHaveAttribute("href", "/designs/local-spj-04/edit?revision=revision-2");
  });

  it("rejects an unknown requested revision without placing it", async () => {
    storeObstacleWorkspace(workspaceWithRevisionOne());
    render(<CourseStudioClient requestedRevisionId="unknown-revision" />);
    await ready();
    expect(
      screen.getByText(
        "The requested revision is not in this browser. The normal selection remains available and nothing was placed.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /Revision 01/ })).toBeChecked();
    expect(screen.queryByRole("button", { name: /Obstacle 1,/ })).toBeNull();
  });

  it("supports visible movement, rotation, removal, and non-blocking warnings", async () => {
    storeObstacleWorkspace(workspaceWithRevisionOne());
    const user = userEvent.setup();
    render(<CourseStudioClient />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    expect(screen.getAllByText(/overlaps/)).toHaveLength(2);
    await waitFor(() => {
      expect(screen.getByTestId("course-announcement")).toHaveTextContent(
        "Obstacle 2 overlaps Obstacle 1",
      );
    });

    await user.click(screen.getByRole("button", { name: "Move right 0.5 m" }));
    expect(screen.getByTestId("course-announcement")).toHaveTextContent(
      "Position 30.5 by 20.0 metres",
    );
    await user.click(screen.getByRole("button", { name: "2 m" }));
    await user.click(screen.getByRole("button", { name: "Move right 2 m" }));
    await user.click(
      screen.getByRole("button", { name: "Rotate right 15 degrees" }),
    );
    expect(screen.getByTestId("course-announcement")).toHaveTextContent(
      "Rotation 15 degrees",
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByTestId("course-announcement")).toHaveTextContent(
      "Removed Obstacle 2",
    );
    expect(screen.getByText(/No overlap or boundary warnings/)).toBeVisible();
  });

  it("supports arrow, Shift+arrow, R, and Delete with live announcements", async () => {
    storeObstacleWorkspace(workspaceWithRevisionOne());
    const user = userEvent.setup();
    render(<CourseStudioClient />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    const obstacle = screen.getByRole("button", { name: /Obstacle 1,/ });
    obstacle.focus();
    await user.keyboard("[ArrowRight]");
    expect(screen.getByTestId("course-announcement")).toHaveTextContent(
      "Position 30.5 by 20.0 metres",
    );
    await user.keyboard("{Shift>}[ArrowDown]{/Shift}");
    expect(screen.getByTestId("course-announcement")).toHaveTextContent(
      "Position 30.5 by 22.0 metres",
    );
    await user.keyboard("r");
    expect(screen.getByTestId("course-announcement")).toHaveTextContent(
      "Rotation 15 degrees",
    );
    await user.keyboard("[Delete]");
    expect(screen.queryByRole("button", { name: /Obstacle 1,/ })).toBeNull();
  });

  it("moves the focused obstacle instead of a previously selected placement", async () => {
    storeObstacleWorkspace(workspaceWithRevisionOne());
    const user = userEvent.setup();
    render(<CourseStudioClient />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    const obstacleOne = screen.getByRole("button", { name: /Obstacle 1,/ });
    obstacleOne.focus();
    await user.keyboard("[ArrowRight]");
    expect(screen.getByTestId("course-announcement")).toHaveTextContent(
      "Moved Obstacle 1. Position 30.5 by 20.0 metres",
    );
  });

  it("moves by pointer on the arena and snaps to 500 mm", async () => {
    storeObstacleWorkspace(workspaceWithRevisionOne());
    const user = userEvent.setup();
    render(<CourseStudioClient />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    const arena = screen.getByTestId("arena-canvas");
    arena.getBoundingClientRect = () =>
      ({
        width: 600,
        height: 400,
        left: 0,
        top: 0,
        right: 600,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const obstacle = screen.getByRole("button", { name: /Obstacle 1,/ });
    fireEvent.pointerDown(obstacle, {
      pointerId: 1,
      clientX: 300,
      clientY: 200,
    });
    fireEvent.pointerMove(obstacle, {
      pointerId: 1,
      clientX: 321,
      clientY: 211,
    });
    fireEvent.pointerUp(obstacle, {
      pointerId: 1,
      clientX: 321,
      clientY: 211,
    });
    expect(screen.getByTestId("course-announcement")).toHaveTextContent(
      "Position 32.0 by 21.0 metres",
    );
  });

  it("restores the course after reload", async () => {
    storeObstacleWorkspace(workspaceWithRevisionOne());
    const user = userEvent.setup();
    const first = render(<CourseStudioClient />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    await user.click(screen.getByRole("button", { name: "Move right 0.5 m" }));
    const serialized = window.localStorage.getItem(COURSE_STORAGE_KEY);
    expect(parseCourseDraft(serialized ?? "")).toMatchObject({
      ok: true,
      value: { instances: [{ xMm: 30500 }] },
    });
    first.unmount();
    render(<CourseStudioClient />);
    await waitFor(() => {
      expect(screen.getByTestId("course-save-status")).toHaveTextContent(
        "Course restored",
      );
    });
    expect(
      screen.getByRole("button", { name: /Obstacle 1,/ }),
    ).toHaveAccessibleName(/position 30.5 m by 20.0 m/);
  });

  it("keeps Revision 01 placements pinned when Revision 02 appears", async () => {
    const firstWorkspace = workspaceWithRevisionOne();
    storeObstacleWorkspace(firstWorkspace);
    const user = userEvent.setup();
    const first = render(<CourseStudioClient />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    first.unmount();

    storeObstacleWorkspace(workspaceWithTwoRevisions());
    render(<CourseStudioClient />);
    await ready();
    expect(screen.getAllByRole("button", { name: /Revision 1,/ })).toHaveLength(
      2,
    );
    await user.click(screen.getByRole("radio", { name: /Revision 02/ }));
    await user.click(screen.getByRole("button", { name: "Place in center" }));
    expect(screen.getAllByRole("button", { name: /Revision 1,/ })).toHaveLength(
      2,
    );
    expect(
      screen.getByRole("button", { name: /Obstacle 3, Revision 2/ }),
    ).toBeVisible();
    expect(screen.getByTestId("quantity-summary")).toHaveTextContent("Gates1");
  });

  it("adds grass and movable scenery as a persistent visual-only layer", async () => {
    const user = userEvent.setup();
    const first = render(<CourseStudioClient />);
    await ready();

    await user.click(screen.getByRole("button", { name: "Grass" }));
    await user.click(screen.getByRole("button", { name: "Add palm tree" }));
    expect(screen.getByTestId("arena-canvas")).toHaveAttribute(
      "data-surface",
      "grass",
    );
    expect(
      screen.getByRole("button", { name: /Palm tree 1, visual scenery/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Palm tree 1")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Move scenery right 2 m" }),
    );
    const stored = parseCourseDraft(
      window.localStorage.getItem(COURSE_STORAGE_KEY) ?? "",
    );
    expect(stored).toMatchObject({
      ok: true,
      value: {
        environment: {
          surface: "grass",
          scenery: [
            {
              kind: "palm_tree",
              xMm: 7000,
              yMm: 5000,
              displayNumber: 1,
            },
          ],
        },
      },
    });
    expect(screen.getByTestId("quantity-summary")).toHaveTextContent(
      "Obstacle instances0",
    );

    first.unmount();
    render(<CourseStudioClient />);
    await waitFor(() =>
      expect(screen.getByTestId("course-save-status")).toHaveTextContent(
        "Course restored",
      ),
    );
    expect(screen.getByTestId("arena-canvas")).toHaveAttribute(
      "data-surface",
      "grass",
    );
    expect(
      screen.getByRole("button", { name: /Palm tree 1, visual scenery/ }),
    ).toBeVisible();
  });

  it("keeps mobile-essential controls present and at least structurally usable", async () => {
    Object.defineProperty(window, "innerWidth", {
      value: 375,
      configurable: true,
    });
    storeObstacleWorkspace(workspaceWithRevisionOne());
    render(<CourseStudioClient />);
    await ready();
    expect(
      screen.getByRole("button", { name: "Place in center" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Move left 0.5 m" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Rotate right 15 degrees" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Grass" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add palm tree" })).toBeVisible();
  });

  it("offers an on-demand 3D arena and returns safely to the editable plan when WebGL fails", async () => {
    storeObstacleWorkspace(workspaceWithRevisionOne());
    const user = userEvent.setup();
    render(<CourseStudioClient forceThreeFailure />);
    await ready();

    const twoD = screen.getByRole("button", { name: "2D plan" });
    const threeD = screen.getByRole("button", { name: "3D arena" });
    expect(twoD).toHaveAttribute("aria-pressed", "true");
    expect(threeD).toHaveAttribute("aria-pressed", "false");

    await user.click(threeD);
    expect(
      await screen.findByText(
        "Interactive arena 3D was intentionally disabled. The editable 2D plan remains active.",
      ),
    ).toBeVisible();
    expect(twoD).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("arena-canvas")).toBeVisible();
  });

  it("offers Horse POV after a placement and falls back safely when WebGL fails", async () => {
    storeObstacleWorkspace(workspaceWithRevisionOne());
    const user = userEvent.setup();
    render(<CourseStudioClient forceThreeFailure />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Place in center" }));

    const horsePov = screen.getByRole("button", { name: "Horse POV" });
    expect(horsePov).toBeEnabled();
    await user.click(horsePov);

    expect(
      await screen.findByText(
        "Interactive arena 3D was intentionally disabled. The editable 2D plan remains active.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "2D plan" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
