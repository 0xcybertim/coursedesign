import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseReviewClient } from "@/components/course/CourseReviewClient";
import {
  COURSE_STORAGE_KEY,
  createCourseDraft,
  placeCourseInstance,
  serializeCourseDraft,
  type CourseDraft,
  type CourseResult,
} from "@/domain/course";
import {
  LOCAL_WORKSPACE_STORAGE_KEY,
  createLocalDesignWorkspace,
  saveLocalRevision,
  serializeLocalDesignWorkspace,
  updateLocalDraft,
  type LocalDesignWorkspace,
  type LocalWorkspaceResult,
} from "@/domain/design";

const T0 = "2026-07-13T10:00:00.000Z";
const T1 = "2026-07-13T10:01:00.000Z";
const T2 = "2026-07-13T10:02:00.000Z";
const T3 = "2026-07-13T10:03:00.000Z";

afterEach(() => cleanup());
beforeEach(() => window.localStorage.clear());

function success<T>(result: LocalWorkspaceResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function courseSuccess(result: CourseResult<CourseDraft>) {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function revisionWorkspace(count = 2): LocalDesignWorkspace {
  const initial = createLocalDesignWorkspace({ draftId: "draft-1", now: T0 });
  const first = success(
    saveLocalRevision(initial, { revisionId: "revision-1", now: T1 }),
  );
  if (count === 1) return first;
  const changed = success(
    updateLocalDraft(
      first,
      { ...first.draft.intent, frameColor: "red", lowerElement: "gate" },
      T2,
    ),
  );
  const second = success(
    saveLocalRevision(changed, { revisionId: "revision-2", now: T2 }),
  );
  if (count === 2) return second;
  const changedAgain = success(
    updateLocalDraft(
      second,
      { ...second.draft.intent, frameColor: "yellow", lowerElement: "filler" },
      T3,
    ),
  );
  return success(
    saveLocalRevision(changedAgain, { revisionId: "revision-3", now: T3 }),
  );
}

function reviewCourse(secondRevision = "revision-2") {
  let course = createCourseDraft(T0);
  course = courseSuccess(
    placeCourseInstance(course, {
      instanceId: "instance-1",
      obstacleDesignRevisionId: "revision-1",
      xMm: 30000,
      yMm: 20000,
      rotationDeg: 0,
      now: T1,
    }),
  );
  return courseSuccess(
    placeCourseInstance(course, {
      instanceId: "instance-2",
      obstacleDesignRevisionId: secondRevision,
      xMm: 32000,
      yMm: 20000,
      rotationDeg: 15,
      now: T2,
    }),
  );
}

function mixedReviewCourse() {
  const firstTwo = reviewCourse("revision-1");
  return courseSuccess(
    placeCourseInstance(firstTwo, {
      instanceId: "instance-3",
      obstacleDesignRevisionId: "revision-2",
      xMm: 42000,
      yMm: 24000,
      rotationDeg: 15,
      now: T3,
    }),
  );
}

function store(workspace: LocalDesignWorkspace, course: CourseDraft) {
  window.localStorage.setItem(
    LOCAL_WORKSPACE_STORAGE_KEY,
    serializeLocalDesignWorkspace(workspace),
  );
  window.localStorage.setItem(COURSE_STORAGE_KEY, serializeCourseDraft(course));
}

async function ready() {
  await waitFor(() => {
    expect(screen.getByTestId("review-source-status")).toHaveTextContent(
      "restored",
    );
  });
}

describe("Course Review", () => {
  it("renders the direct read-only review content and return navigation", async () => {
    store(revisionWorkspace(), reviewCourse());
    render(<CourseReviewClient />);
    await ready();
    expect(
      screen.getByRole("heading", { name: "Course Review", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Return to editable course" }),
    ).toHaveAttribute("href", "/courses/local-course-1");
    expect(
      screen.getByRole("img", {
        name: /60 by 40 metres, 2 numbered placements/,
      }),
    ).toBeVisible();
    expect(screen.getByTestId("review-completeness")).toHaveTextContent(
      "Complete local review",
    );
  });

  it("shows exact placement, quantity, warning, and hash evidence", async () => {
    store(revisionWorkspace(), reviewCourse());
    render(<CourseReviewClient />);
    await ready();
    const register = screen.getByTestId("placement-register");
    expect(register).toHaveTextContent("X 30,000 mm · Y 20,000 mm");
    expect(register).toHaveTextContent("Club Classic · Revision 1");
    expect(register).toHaveTextContent("revision-2");
    expect(register).toHaveTextContent(/^[\s\S]*15°[\s\S]*$/);
    expect(screen.getByTestId("review-quantities")).toHaveTextContent("Poles8");
    expect(screen.getByTestId("review-quantities")).toHaveTextContent("Gates1");
    expect(screen.getByTestId("review-warnings")).toHaveTextContent(
      "Obstacle 2 overlaps Obstacle 1",
    );
    expect(screen.getByTestId("review-hash")).toHaveTextContent(
      /^[a-f0-9]{64}$/,
    );
  });

  it("keeps visible and machine-readable review content aligned", async () => {
    store(revisionWorkspace(), reviewCourse());
    render(<CourseReviewClient />);
    await ready();
    const machine = JSON.parse(
      screen.getByTestId("review-json").textContent ?? "{}",
    ) as {
      reviewHash: string;
      equipmentQuantities: { poles: number };
      placements: { rotationDeg: number }[];
      prototypeDisclaimer: string;
    };
    expect(machine.reviewHash).toBe(
      screen.getByTestId("review-hash").textContent,
    );
    expect(machine.equipmentQuantities.poles).toBe(8);
    expect(machine.placements[1].rotationDeg).toBe(15);
    expect(machine.prototypeDisclaimer).toContain("not supplier-approved");
  });

  it("copies deterministic JSON with a keyboard-operable control", async () => {
    store(revisionWorkspace(), reviewCourse());
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CourseReviewClient />);
    await ready();
    const copyButton = screen.getByRole("button", { name: "Copy JSON" });
    copyButton.focus();
    await user.keyboard("[Enter]");
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "JSON copied" })).toHaveFocus();
    expect(writeText.mock.calls[0][0]).toContain(
      screen.getByTestId("review-hash").textContent,
    );
  });

  it("keeps detection passive until an explicit update action is chosen", async () => {
    store(revisionWorkspace(3), reviewCourse("revision-1"));
    render(<CourseReviewClient />);
    await ready();
    expect(screen.getAllByText(/Newer revision available/)).toHaveLength(2);
    expect(screen.getAllByText(/remains pinned to revision-1/)).toHaveLength(2);
    expect(
      screen.getByRole("button", {
        name: "Update this placement, obstacle 01",
      }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", {
        name: /Replace all using this revision, 2 placements pinned to Revision 01/,
      }),
    ).toHaveLength(2);
    expect(
      JSON.parse(window.localStorage.getItem(COURSE_STORAGE_KEY) ?? "{}")
        .instances[0].obstacleDesignRevisionId,
    ).toBe("revision-1");
  });

  it("previews exact evidence and Cancel leaves every stored input unchanged", async () => {
    const workspace = revisionWorkspace(3);
    const course = reviewCourse("revision-1");
    store(workspace, course);
    const storageBefore = window.localStorage.getItem(COURSE_STORAGE_KEY);
    const revisionsBefore = window.localStorage.getItem(
      LOCAL_WORKSPACE_STORAGE_KEY,
    );
    const user = userEvent.setup();
    render(<CourseReviewClient />);
    await ready();
    const currentHash = screen.getByTestId("review-hash").textContent;
    const trigger = screen.getByRole("button", {
      name: "Update this placement, obstacle 01",
    });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "Update obstacle 01",
    });
    expect(dialog).toHaveTextContent("Operation · update_one");
    expect(dialog).toHaveTextContent("revision-1");
    expect(dialog).toHaveTextContent("revision-3");
    expect(dialog).toHaveTextContent("Obstacle 01");
    expect(dialog).toHaveTextContent("Equipment quantities");
    expect(dialog).toHaveTextContent("Geometry warnings");
    expect(screen.getByTestId("proposed-review-hash")).toHaveTextContent(
      /^[a-f0-9]{64}$/,
    );
    expect(screen.getByTestId("proposed-review-hash")).not.toHaveTextContent(
      currentHash ?? "",
    );
    const cancel = screen.getByRole("button", {
      name: "Cancel · keep current course",
    });
    expect(cancel).toHaveFocus();
    await user.click(cancel);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(window.localStorage.getItem(COURSE_STORAGE_KEY)).toBe(storageBefore);
    expect(window.localStorage.getItem(LOCAL_WORKSPACE_STORAGE_KEY)).toBe(
      revisionsBefore,
    );
    expect(screen.getByTestId("review-hash")).toHaveTextContent(
      currentHash ?? "",
    );
    expect(screen.getByText(/Update preview cancelled/)).toBeVisible();
  });

  it("closes safely on Escape and restores focus to the trigger", async () => {
    store(revisionWorkspace(3), reviewCourse("revision-1"));
    const user = userEvent.setup();
    render(<CourseReviewClient />);
    await ready();
    const trigger = screen.getByRole("button", {
      name: "Update this placement, obstacle 01",
    });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("confirms one placement, announces success, and reloads the previewed hash", async () => {
    const workspace = revisionWorkspace(3);
    const course = reviewCourse("revision-1");
    store(workspace, course);
    const user = userEvent.setup();
    const first = render(<CourseReviewClient />);
    await ready();
    await user.click(
      screen.getByRole("button", {
        name: "Update this placement, obstacle 01",
      }),
    );
    const proposedHash = screen.getByTestId("proposed-review-hash").textContent;
    await user.click(
      screen.getByRole("button", { name: "Confirm placement update" }),
    );

    const stored = JSON.parse(
      window.localStorage.getItem(COURSE_STORAGE_KEY) ?? "{}",
    ) as CourseDraft;
    expect(stored.draftVersion).toBe(course.draftVersion + 1);
    expect(
      stored.instances.map((instance) => instance.obstacleDesignRevisionId),
    ).toEqual(["revision-3", "revision-1"]);
    expect(screen.getByTestId("review-hash")).toHaveTextContent(
      proposedHash ?? "",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Course updated successfully",
    );
    expect(screen.getByRole("status")).toHaveFocus();
    expect(window.localStorage.getItem(LOCAL_WORKSPACE_STORAGE_KEY)).toBe(
      serializeLocalDesignWorkspace(workspace),
    );

    first.unmount();
    render(<CourseReviewClient />);
    await ready();
    expect(screen.getByTestId("review-hash")).toHaveTextContent(
      proposedHash ?? "",
    );
    expect(screen.getByTestId("placement-register")).toHaveTextContent(
      "revision-3",
    );
  });

  it("confirms replace-all atomically for exact source matches only", async () => {
    const workspace = revisionWorkspace(3);
    const course = mixedReviewCourse();
    store(workspace, course);
    const user = userEvent.setup();
    render(<CourseReviewClient />);
    await ready();
    await user.click(
      screen.getAllByRole("button", {
        name: /Replace all using this revision, 2 placements pinned to Revision 01/,
      })[0],
    );
    expect(
      screen.getByRole("dialog", {
        name: "Replace 2 placements pinned to Revision 01",
      }),
    ).toHaveTextContent("display 01, 02");
    const proposedHash = screen.getByTestId("proposed-review-hash").textContent;
    await user.click(
      screen.getByRole("button", { name: "Confirm exact replace-all" }),
    );
    const stored = JSON.parse(
      window.localStorage.getItem(COURSE_STORAGE_KEY) ?? "{}",
    ) as CourseDraft;
    expect(stored.draftVersion).toBe(course.draftVersion + 1);
    expect(
      stored.instances.map((instance) => instance.obstacleDesignRevisionId),
    ).toEqual(["revision-3", "revision-3", "revision-2"]);
    expect(screen.getByTestId("review-hash")).toHaveTextContent(
      proposedHash ?? "",
    );
  });

  it("rejects a stale open preview without overwriting browser storage", async () => {
    const workspace = revisionWorkspace(3);
    const course = reviewCourse("revision-1");
    store(workspace, course);
    const user = userEvent.setup();
    render(<CourseReviewClient />);
    await ready();
    const visibleHash = screen.getByTestId("review-hash").textContent;
    await user.click(
      screen.getByRole("button", {
        name: "Update this placement, obstacle 01",
      }),
    );
    const staleStored = serializeCourseDraft({
      ...course,
      draftVersion: course.draftVersion + 1,
      updatedAt: T3,
    });
    window.localStorage.setItem(COURSE_STORAGE_KEY, staleStored);
    await user.click(
      screen.getByRole("button", { name: "Confirm placement update" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "stale_course_precondition",
    );
    expect(window.localStorage.getItem(COURSE_STORAGE_KEY)).toBe(staleStored);
    expect(screen.getByTestId("review-hash")).toHaveTextContent(
      visibleHash ?? "",
    );
  });

  it("marks all mutation controls as print-hidden navigation", async () => {
    store(revisionWorkspace(3), reviewCourse("revision-1"));
    render(<CourseReviewClient />);
    await ready();
    for (const control of screen.getAllByRole("button", {
      name: /Update this placement|Replace all using this revision/,
    })) {
      expect(control.closest(".review-navigation")).not.toBeNull();
    }
  });

  it("keeps an incomplete review visible and excludes missing quantities", async () => {
    store(revisionWorkspace(), reviewCourse("missing-revision"));
    render(<CourseReviewClient />);
    await ready();
    expect(screen.getByTestId("review-completeness")).toHaveTextContent(
      "Incomplete · unsuitable for production",
    );
    expect(screen.getByTestId("placement-register")).toHaveTextContent(
      "Missing pinned product data",
    );
    expect(screen.getByTestId("review-quantities")).toHaveTextContent("Poles4");
    expect(screen.getByTestId("review-warnings")).toHaveTextContent(
      "unavailable on this device",
    );
    expect(screen.getByTestId("review-json")).toHaveTextContent(
      '"completeness": "incomplete"',
    );
  });

  it("restores the same review hash after a remount", async () => {
    store(revisionWorkspace(), reviewCourse());
    const first = render(<CourseReviewClient />);
    await ready();
    const hash = screen.getByTestId("review-hash").textContent;
    first.unmount();
    render(<CourseReviewClient />);
    await ready();
    expect(screen.getByTestId("review-hash")).toHaveTextContent(hash ?? "");
  });
});
