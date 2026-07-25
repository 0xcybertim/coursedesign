"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  aggregateCourseQuantities,
  deriveCourseWarnings,
  LARGE_MOVE_MM,
  NORMAL_MOVE_MM,
  type CourseSceneryKind,
} from "@/domain/course";
import type { FrameColor, LowerElement } from "@/domain/product/types";
import {
  isProfileWingRevision,
  type LocalDesignRevision,
} from "@/domain/design";
import type { HorsePovProgress } from "./CourseArenaThreeScene";
import { useLocalCourseWorkspace } from "./useLocalCourseWorkspace";
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";

const CourseArenaThreeScene = dynamic(() => import("./CourseArenaThreeScene"), {
  ssr: false,
});

const FRAME_HEX: Record<FrameColor, string> = {
  white: "#f2f1ec",
  blue: "#0d43c7",
  red: "#ff5547",
  yellow: "#e8d51b",
};

const LOWER_LABEL: Record<Exclude<LowerElement, "none">, string> = {
  decorative_panel: "Decorative panels",
  gate: "Gates",
  filler: "Fillers",
};

const SCENERY_LABEL: Record<CourseSceneryKind, string> = {
  palm_tree: "Palm tree",
  leafy_tree: "Leafy tree",
  flower_box: "Flower box",
};

function metres(valueMm: number) {
  return `${(valueMm / 1000).toFixed(1)} m`;
}

function revisionPresentation(revision: LocalDesignRevision) {
  if (isProfileWingRevision(revision))
    return {
      color: "#e8d51b",
      detail: `Generated profile · ${revision.snapshot.provenance.sourceLabel ?? revision.snapshot.provenance.sourceFixtureId}`,
      family: "profile-wing",
    } as const;
  return {
    color: FRAME_HEX[revision.snapshot.configuration.frameColor],
    detail: `${revision.snapshot.configuration.frameColor} frame · ${revision.snapshot.configuration.lowerElement.replaceAll("_", " ")}`,
    family: "spj-04",
  } as const;
}

type ArenaCapability = "idle" | "loading" | "ready" | "failed";
type ArenaView = "2d" | "3d" | "horse-pov";

const EMPTY_HORSE_POV_PROGRESS: HorsePovProgress = {
  progress: 0,
  currentDisplayNumber: null,
  totalJumps: 0,
  durationSeconds: 0,
  motion: "approaching",
};

export function CourseStudioClient({
  forceThreeFailure = false,
  requestedRevisionId,
}: {
  readonly forceThreeFailure?: boolean;
  readonly requestedRevisionId?: string;
}) {
  const workspace = useLocalCourseWorkspace(requestedRevisionId);
  const persistenceMode = usePersistenceMode();
  const arenaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    instanceId: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [visibleMoveStep, setVisibleMoveStep] =
    useState<number>(NORMAL_MOVE_MM);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [arenaView, setArenaView] = useState<ArenaView>("2d");
  const arenaViewRef = useRef<ArenaView>("2d");
  const [shouldLoadThree, setShouldLoadThree] = useState(false);
  const [arenaCapability, setArenaCapability] =
    useState<ArenaCapability>("idle");
  const [arenaResetViewKey, setArenaResetViewKey] = useState(0);
  const [horsePovPlaying, setHorsePovPlaying] = useState(false);
  const [horsePovRestartKey, setHorsePovRestartKey] = useState(0);
  const [horsePovSpeed, setHorsePovSpeed] = useState(1);
  const [horsePovProgress, setHorsePovProgress] = useState<HorsePovProgress>(
    EMPTY_HORSE_POV_PROGRESS,
  );
  const [arenaCapabilityStatus, setArenaCapabilityStatus] = useState(
    "Editable 2D plan ready · 3D arena and Horse POV available on request",
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    arenaViewRef.current = arenaView;
  }, [arenaView]);
  const warnings = useMemo(
    () => deriveCourseWarnings(workspace.course, workspace.revisions),
    [workspace.course, workspace.revisions],
  );
  const quantities = useMemo(
    () => aggregateCourseQuantities(workspace.course, workspace.revisions),
    [workspace.course, workspace.revisions],
  );
  const warningInstanceIds = useMemo(
    () => new Set(warnings.flatMap((warning) => [...warning.instanceIds])),
    [warnings],
  );
  const warningInstanceIdList = useMemo(
    () => [...warningInstanceIds].sort(),
    [warningInstanceIds],
  );
  const revisionGroups = useMemo(() => {
    const groups = new Map<string, LocalDesignRevision[]>();
    for (const revision of workspace.revisions) {
      const group = groups.get(revision.designId) ?? [];
      group.push(revision);
      groups.set(revision.designId, group);
    }
    return [...groups.entries()];
  }, [workspace.revisions]);
  const selectedRevision = workspace.revisions.find(
    (revision) => revision.revisionId === workspace.selectedRevisionId,
  );

  useEffect(() => {
    if (!requestedRevisionId || workspace.requestedRevisionStatus !== "ready")
      return;
    const requestedOption = [
      ...document.querySelectorAll<HTMLElement>("[data-revision-id]"),
    ].find((element) => element.dataset.revisionId === requestedRevisionId);
    requestedOption?.scrollIntoView?.({ block: "nearest" });
  }, [
    requestedRevisionId,
    workspace.hydrated,
    workspace.requestedRevisionStatus,
  ]);

  const openThreeArena = useCallback(() => {
    setHorsePovPlaying(false);
    if (arenaCapability === "ready") {
      setArenaView("3d");
      setArenaCapabilityStatus(
        "Editable 2D plan ready · interactive 3D arena ready",
      );
      return;
    }
    setArenaCapability("loading");
    setArenaCapabilityStatus(
      "Editable 2D plan ready · loading interactive 3D arena",
    );
    setArenaView("3d");
    setShouldLoadThree(true);
  }, [arenaCapability]);

  const openHorsePov = useCallback(() => {
    if (workspace.course.instances.length === 0) return;
    setArenaView("horse-pov");
    setHorsePovRestartKey((value) => value + 1);
    setHorsePovPlaying(!reducedMotion);
    if (arenaCapability === "ready") {
      setArenaCapabilityStatus(
        "Horse POV ready · inferred route through the saved obstacle order",
      );
      return;
    }
    setArenaCapability("loading");
    setArenaCapabilityStatus(
      "Editable 2D plan ready · loading Horse POV preview",
    );
    setShouldLoadThree(true);
  }, [arenaCapability, reducedMotion, workspace.course.instances.length]);

  const handleThreeReady = useCallback(() => {
    setArenaCapability("ready");
    setArenaCapabilityStatus(
      arenaViewRef.current === "horse-pov"
        ? "Horse POV ready · inferred route through the saved obstacle order"
        : "Editable 2D plan ready · interactive 3D arena ready",
    );
  }, []);

  const handleThreeFailure = useCallback((message: string) => {
    setArenaCapability("failed");
    setArenaCapabilityStatus(message);
    setArenaView("2d");
    setShouldLoadThree(false);
    setHorsePovPlaying(false);
  }, []);

  const handleHorsePovProgress = useCallback(
    (progress: HorsePovProgress) => setHorsePovProgress(progress),
    [],
  );
  const handleHorsePovComplete = useCallback(
    () => setHorsePovPlaying(false),
    [],
  );

  const openTwoDPlan = useCallback(() => {
    setHorsePovPlaying(false);
    setArenaView("2d");
    setArenaCapabilityStatus(
      arenaCapability === "ready"
        ? "Editable 2D plan ready · 3D arena and Horse POV ready"
        : "Editable 2D plan ready · 3D arena and Horse POV available on request",
    );
  }, [arenaCapability]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const targetInstanceId = event.currentTarget.dataset.instanceId;
    if (!targetInstanceId) return;
    const step = event.shiftKey ? LARGE_MOVE_MM : NORMAL_MOVE_MM;
    const movement: Record<string, { xMm: number; yMm: number }> = {
      ArrowLeft: { xMm: -step, yMm: 0 },
      ArrowRight: { xMm: step, yMm: 0 },
      ArrowUp: { xMm: 0, yMm: -step },
      ArrowDown: { xMm: 0, yMm: step },
    };
    if (movement[event.key]) {
      event.preventDefault();
      workspace.moveSelected(movement[event.key], targetInstanceId);
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      workspace.rotateSelected(15, targetInstanceId);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      workspace.removeSelected(targetInstanceId);
    }
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    const instance = workspace.course.instances.find(
      (candidate) =>
        candidate.instanceId === event.currentTarget.dataset.instanceId,
    );
    if (!instance) return;
    workspace.selectInstance(instance.instanceId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      instanceId: instance.instanceId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: instance.xMm,
      startY: instance.yMm,
    };
  }

  function drag(event: PointerEvent<HTMLButtonElement>) {
    const active = dragRef.current;
    const arena = arenaRef.current?.getBoundingClientRect();
    if (
      !active ||
      active.pointerId !== event.pointerId ||
      !arena?.width ||
      !arena.height
    )
      return;
    workspace.moveSelectedTo(
      {
        xMm:
          active.startX +
          ((event.clientX - active.startClientX) / arena.width) * 60000,
        yMm:
          active.startY +
          ((event.clientY - active.startClientY) / arena.height) * 40000,
      },
      active.instanceId,
    );
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  }

  function handleSceneryKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const targetSceneryId = event.currentTarget.dataset.sceneryId;
    if (!targetSceneryId) return;
    const step = event.shiftKey ? 5000 : 2000;
    const movement: Record<string, { xMm: number; yMm: number }> = {
      ArrowLeft: { xMm: -step, yMm: 0 },
      ArrowRight: { xMm: step, yMm: 0 },
      ArrowUp: { xMm: 0, yMm: -step },
      ArrowDown: { xMm: 0, yMm: step },
    };
    if (movement[event.key]) {
      event.preventDefault();
      workspace.moveSelectedScenery(movement[event.key], targetSceneryId);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      workspace.removeSelectedScenery(targetSceneryId);
    }
  }

  const selectedNumber = workspace.selectedInstance?.displayNumber;

  return (
    <main className="course-studio-shell">
      <header className="course-header">
        <div className="course-identity">
          <strong>Local Course 01</strong>
          <span>60 × 40 m · prototype arena</span>
          <Link
            className="course-review-link"
            href="/courses/local-course-1/review"
          >
            Review course
          </Link>
        </div>
        <div className="course-save-state">
          <span
            className={`save-state-dot save-state-${workspace.saveState}`}
            aria-hidden="true"
          />
          <div>
            <strong data-testid="course-save-status">{workspace.status}</strong>
            <small>
              {persistenceMode === "server"
                ? "Saved to this unverified public server workspace"
                : "Browser-local · clearing storage removes this course"}
            </small>
          </div>
        </div>
      </header>

      {workspace.conflict ? (
        <section className="requested-revision-notice is-error" role="alert">
          <strong>Your attempted course edit was not overwritten.</strong>
          <p>
            This course changed in another context. Load the latest course or
            retry the preserved edit against it.
          </p>
          <button type="button" onClick={workspace.reloadLatest}>
            Load latest server course
          </button>
          <button type="button" onClick={workspace.retryAttempted}>
            Retry my preserved course edit
          </button>
        </section>
      ) : null}

      <div className="course-workspace">
        <aside
          className="saved-design-rail"
          aria-labelledby="saved-designs-title"
        >
          <div className="pane-heading">
            <p className="eyebrow">Saved designs</p>
            <h1 id="saved-designs-title">Place a revision</h1>
            <p>Each placement pins this exact immutable revision.</p>
          </div>
          {workspace.requestedRevisionStatus === "ready" ? (
            <p className="requested-revision-notice" role="status">
              Requested revision selected and ready to place. Nothing was placed
              automatically.
            </p>
          ) : workspace.requestedRevisionStatus === "invalid" ? (
            <p className="requested-revision-notice is-error" role="alert">
              The requested revision is not in this{" "}
              {persistenceMode === "server" ? "server workspace" : "browser"}.
              The normal selection remains available and nothing was placed.
            </p>
          ) : null}
          {!workspace.hydrated ? (
            <p>Loading saved revisions…</p>
          ) : workspace.revisions.length === 0 ? (
            <div
              className="course-empty-state"
              data-testid="course-empty-state"
            >
              <strong>
                Your course starts with a saved obstacle revision.
              </strong>
              <p>No example or fake placement has been inserted.</p>
              <Link href="/designs/local-spj-04/edit">
                Create and save an obstacle
              </Link>
            </div>
          ) : (
            <>
              <div
                className="saved-revision-list"
                role="radiogroup"
                aria-label="Saved obstacle revisions"
              >
                {revisionGroups.map(([designId, revisions]) => (
                  <section className="saved-design-group" key={designId}>
                    <h2>
                      {designId === "local-spj-04"
                        ? "SPJ-04 · Club Classic"
                        : revisions[0]?.name.split(" · Revision")[0] ||
                          "Custom Profile Wing"}
                    </h2>
                    {revisions.map((revision) => {
                      const selected =
                        workspace.selectedRevisionId === revision.revisionId;
                      const presentation = revisionPresentation(revision);
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className="saved-revision-option"
                          key={revision.revisionId}
                          data-revision-id={revision.revisionId}
                          onClick={() =>
                            workspace.setSelectedRevisionId(revision.revisionId)
                          }
                        >
                          <span
                            className="revision-symbol"
                            style={{ background: presentation.color }}
                            data-family={presentation.family}
                            aria-hidden="true"
                          />
                          <span>
                            <strong>
                              Revision{" "}
                              {String(revision.ordinal).padStart(2, "0")}
                            </strong>
                            <small>{presentation.detail}</small>
                            <code>
                              CFG {revision.configurationHash.slice(0, 8)}
                            </code>
                            {workspace.unavailableArtworkRevisionIds.has(
                              revision.revisionId,
                            ) ? (
                              <small className="revision-artwork-unavailable">
                                Exact artwork unavailable on this device ·
                                revision identity remains pinned
                              </small>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
              <button
                type="button"
                className="place-center-action"
                onClick={workspace.placeSelectedRevision}
                disabled={!workspace.selectedRevisionId}
              >
                Place in center
              </button>
              <Link
                className="edit-obstacle-link"
                href={
                  selectedRevision && isProfileWingRevision(selectedRevision)
                    ? `/designs/${selectedRevision.designId}`
                    : selectedRevision
                      ? `/designs/local-spj-04/edit?revision=${encodeURIComponent(
                          selectedRevision.revisionId,
                        )}`
                      : "/designs"
                }
              >
                {selectedRevision && isProfileWingRevision(selectedRevision)
                  ? "View selected Profile Wing"
                  : "Edit selected SPJ-04 revision"}
              </Link>
            </>
          )}
        </aside>

        <section className="arena-pane" aria-labelledby="arena-title">
          <div className="arena-heading">
            <div>
              <p className="eyebrow">Course workspace</p>
              <h2 id="arena-title">Prototype arena</h2>
            </div>
            <div className="arena-heading-actions">
              <div className="arena-dimensions">
                <span>60,000 mm</span>
                <span>40,000 mm</span>
              </div>
              <div className="arena-view-controls" aria-label="Arena view">
                <button
                  type="button"
                  aria-pressed={arenaView === "2d"}
                  onClick={openTwoDPlan}
                >
                  2D plan
                </button>
                <button
                  type="button"
                  aria-pressed={arenaView === "3d"}
                  disabled={arenaCapability === "loading"}
                  onClick={openThreeArena}
                >
                  {arenaCapability === "loading" ? "Loading 3D…" : "3D arena"}
                </button>
                <button
                  type="button"
                  aria-pressed={arenaView === "horse-pov"}
                  disabled={
                    arenaCapability === "loading" ||
                    workspace.course.instances.length === 0
                  }
                  title={
                    workspace.course.instances.length === 0
                      ? "Place at least one obstacle to preview the course."
                      : undefined
                  }
                  onClick={openHorsePov}
                >
                  Horse POV
                </button>
                {arenaView === "3d" && arenaCapability === "ready" ? (
                  <button
                    type="button"
                    className="arena-reset-view"
                    onClick={() => setArenaResetViewKey((value) => value + 1)}
                  >
                    Reset view
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <section
            className="arena-environment-panel"
            aria-labelledby="arena-environment-title"
          >
            <div className="arena-environment-heading">
              <p className="eyebrow">Arena environment</p>
              <h3 id="arena-environment-title">Surface and scenery</h3>
              <p>
                Visual planning layer · excluded from obstacle warnings and
                equipment quantities.
              </p>
            </div>
            <fieldset className="arena-surface-controls">
              <legend>Ground</legend>
              {(["sand", "grass"] as const).map((surface) => (
                <button
                  type="button"
                  key={surface}
                  aria-pressed={
                    workspace.course.environment.surface === surface
                  }
                  onClick={() => workspace.updateSurface(surface)}
                >
                  <span
                    className="arena-surface-swatch"
                    data-surface={surface}
                    aria-hidden="true"
                  />
                  {surface === "sand" ? "Sand" : "Grass"}
                </button>
              ))}
            </fieldset>
            <div className="arena-scenery-add-controls">
              <strong>Place scenery</strong>
              <div>
                {(["palm_tree", "leafy_tree", "flower_box"] as const).map(
                  (kind) => (
                    <button
                      type="button"
                      key={kind}
                      onClick={() => workspace.addScenery(kind)}
                    >
                      <span
                        className="course-scenery-symbol"
                        data-kind={kind}
                        aria-hidden="true"
                      />
                      {`Add ${SCENERY_LABEL[kind].toLowerCase()}`}
                    </button>
                  ),
                )}
              </div>
            </div>
          </section>
          <div className="course-arena-visual-stage">
            <div
              className={`course-arena-view-layer ${
                arenaView === "2d" ? "is-active" : ""
              }`}
              aria-hidden={arenaView !== "2d"}
            >
              <div className="arena-frame">
                <span className="arena-width-label">60 m</span>
                <span className="arena-height-label">40 m</span>
                <div
                  className="arena-canvas"
                  ref={arenaRef}
                  data-testid="arena-canvas"
                  data-surface={workspace.course.environment.surface}
                >
                  {workspace.course.instances.length === 0 ? (
                    <div className="arena-empty-prompt">
                      <strong>The arena is ready.</strong>
                      <span>
                        Choose a saved revision and place it in the center.
                      </span>
                    </div>
                  ) : null}
                  {workspace.course.environment.scenery.map((item) => {
                    const selected =
                      workspace.selectedSceneryId === item.sceneryId;
                    return (
                      <button
                        type="button"
                        key={item.sceneryId}
                        className={`course-scenery${selected ? " is-selected" : ""}`}
                        style={{
                          left: `${(item.xMm / workspace.course.arena.width) * 100}%`,
                          top: `${(item.yMm / workspace.course.arena.height) * 100}%`,
                        }}
                        data-scenery-id={item.sceneryId}
                        aria-label={`${SCENERY_LABEL[item.kind]} ${item.displayNumber}, visual scenery at ${metres(item.xMm)} by ${metres(item.yMm)}`}
                        aria-pressed={selected}
                        onClick={() => workspace.selectScenery(item.sceneryId)}
                        onKeyDown={handleSceneryKeyDown}
                      >
                        <span
                          className="course-scenery-symbol"
                          data-kind={item.kind}
                          aria-hidden="true"
                        />
                        <span className="scenery-number">
                          {item.displayNumber}
                        </span>
                      </button>
                    );
                  })}
                  {workspace.course.instances.map((instance) => {
                    const revision = workspace.revisions.find(
                      (candidate) =>
                        candidate.revisionId ===
                        instance.obstacleDesignRevisionId,
                    );
                    const presentation = revision
                      ? revisionPresentation(revision)
                      : { color: FRAME_HEX.white, family: "missing" as const };
                    const selected =
                      workspace.selectedInstanceId === instance.instanceId;
                    return (
                      <button
                        type="button"
                        key={instance.instanceId}
                        className={`course-obstacle${selected ? " is-selected" : ""}${warningInstanceIds.has(instance.instanceId) ? " has-warning" : ""}`}
                        style={{
                          left: `${(instance.xMm / workspace.course.arena.width) * 100}%`,
                          top: `${(instance.yMm / workspace.course.arena.height) * 100}%`,
                          transform: `translate(-50%, -50%) rotate(${instance.rotationDeg}deg)`,
                        }}
                        data-instance-id={instance.instanceId}
                        aria-label={`Obstacle ${instance.displayNumber}, Revision ${revision?.ordinal ?? "missing"}, position ${metres(instance.xMm)} by ${metres(instance.yMm)}, rotation ${instance.rotationDeg} degrees${warningInstanceIds.has(instance.instanceId) ? ", planning warning" : ""}`}
                        aria-pressed={selected}
                        onClick={() =>
                          workspace.selectInstance(instance.instanceId)
                        }
                        onKeyDown={handleKeyDown}
                        onPointerDown={startDrag}
                        onPointerMove={drag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      >
                        <span
                          className="course-obstacle-symbol"
                          style={{ background: presentation.color }}
                          data-family={presentation.family}
                          aria-hidden="true"
                        >
                          <span className="symbol-wing" />
                          <span className="symbol-poles" />
                          <span className="symbol-wing" />
                        </span>
                        <span className="obstacle-number">
                          {instance.displayNumber}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {shouldLoadThree ? (
              <div
                className={`course-arena-view-layer course-arena-three-frame ${
                  arenaView !== "2d" ? "is-active" : ""
                }`}
                aria-hidden={arenaView === "2d"}
              >
                <CourseArenaThreeScene
                  course={workspace.course}
                  revisions={workspace.revisions}
                  selectedInstanceId={workspace.selectedInstanceId}
                  warningInstanceIds={warningInstanceIdList}
                  active={arenaView !== "2d"}
                  mode={arenaView === "horse-pov" ? "horse-pov" : "overview"}
                  horsePovPlaying={horsePovPlaying}
                  horsePovRestartKey={horsePovRestartKey}
                  horsePovSpeed={horsePovSpeed}
                  reducedMotion={reducedMotion}
                  forceFailure={forceThreeFailure}
                  resetViewKey={arenaResetViewKey}
                  onReady={handleThreeReady}
                  onFailure={handleThreeFailure}
                  onHorsePovProgress={handleHorsePovProgress}
                  onHorsePovComplete={handleHorsePovComplete}
                />
                {arenaView === "3d" && arenaCapability === "ready" ? (
                  <p className="course-arena-navigation-guide">
                    <span aria-hidden="true">← ↑ ↓ →</span>
                    <strong>Arrow keys move</strong>
                    <span>Drag rotates · scroll zooms</span>
                  </p>
                ) : null}
                {arenaView === "horse-pov" && arenaCapability === "ready" ? (
                  <>
                    <div className="course-horse-pov-ears" aria-hidden="true">
                      <span />
                      <span />
                    </div>
                    <div
                      className="course-horse-pov-hud"
                      aria-label="Horse POV playback"
                    >
                      <div className="course-horse-pov-status">
                        <span>Horse POV · inferred route</span>
                        <strong>
                          {horsePovProgress.currentDisplayNumber === null
                            ? "Course preview"
                            : `${horsePovProgress.motion === "finished" ? "Finished at" : horsePovProgress.motion === "jumping" ? "Jumping" : "Approaching"} jump ${horsePovProgress.currentDisplayNumber} of ${horsePovProgress.totalJumps}`}
                        </strong>
                      </div>
                      <progress
                        aria-label="Horse POV course progress"
                        max={1}
                        value={horsePovProgress.progress}
                      />
                      <div className="course-horse-pov-actions">
                        <button
                          type="button"
                          onClick={() =>
                            setHorsePovPlaying((playing) => !playing)
                          }
                        >
                          {horsePovPlaying ? "Pause" : "Play"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHorsePovRestartKey((value) => value + 1);
                            setHorsePovPlaying(true);
                          }}
                        >
                          Restart
                        </button>
                        <div
                          className="course-horse-pov-speed"
                          aria-label="Preview speed"
                        >
                          {[0.75, 1, 1.5].map((speed) => (
                            <button
                              type="button"
                              key={speed}
                              aria-pressed={horsePovSpeed === speed}
                              onClick={() => setHorsePovSpeed(speed)}
                            >
                              {speed}×
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <p
            className={`course-arena-capability capability-${arenaCapability}`}
            data-testid="course-arena-capability"
            aria-live="polite"
          >
            <span aria-hidden="true" /> {arenaCapabilityStatus}
          </p>
          {arenaView === "3d" && arenaCapability === "ready" ? (
            <p className="course-arena-three-boundary">
              Read-only overview from pinned prototype geometry and placement
              records. Arrow keys move the camera; drag rotates and scroll
              zooms. Use the 2D plan to select, drag, and edit. Artwork detail,
              safety, course validity, and venue measurement remain outside this
              view.
            </p>
          ) : null}
          {arenaView === "horse-pov" && arenaCapability === "ready" ? (
            <p className="course-arena-three-boundary">
              Horse-height experience preview inferred from placement numbers
              and obstacle rotations. The approach side, line, pace, takeoff,
              jump arc, and landing are illustrative—not rider guidance,
              training advice, safety validation, or course certification.
            </p>
          ) : null}

          {workspace.selectedScenery ? (
            <div
              className="scenery-placement-controls"
              aria-label="Selected scenery controls"
            >
              <div>
                <p className="eyebrow">Selected scenery</p>
                <strong>
                  {SCENERY_LABEL[workspace.selectedScenery.kind]}{" "}
                  {workspace.selectedScenery.displayNumber}
                </strong>
                <span>
                  {metres(workspace.selectedScenery.xMm)} ×{" "}
                  {metres(workspace.selectedScenery.yMm)}
                </span>
              </div>
              <div className="scenery-direction-controls">
                <button
                  type="button"
                  aria-label="Move scenery left 2 m"
                  onClick={() =>
                    workspace.moveSelectedScenery({ xMm: -2000, yMm: 0 })
                  }
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Move scenery up 2 m"
                  onClick={() =>
                    workspace.moveSelectedScenery({ xMm: 0, yMm: -2000 })
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move scenery down 2 m"
                  onClick={() =>
                    workspace.moveSelectedScenery({ xMm: 0, yMm: 2000 })
                  }
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Move scenery right 2 m"
                  onClick={() =>
                    workspace.moveSelectedScenery({ xMm: 2000, yMm: 0 })
                  }
                >
                  →
                </button>
              </div>
              <button
                type="button"
                className="remove-scenery"
                onClick={() => workspace.removeSelectedScenery()}
              >
                Remove scenery
              </button>
            </div>
          ) : null}

          <div
            className="placement-controls"
            aria-label="Selected obstacle controls"
          >
            <div>
              <p className="eyebrow">Selected placement</p>
              <strong>
                {selectedNumber
                  ? `Obstacle ${selectedNumber}`
                  : "Select an obstacle"}
              </strong>
              {workspace.selectedInstance ? (
                <span>
                  {metres(workspace.selectedInstance.xMm)} ×{" "}
                  {metres(workspace.selectedInstance.yMm)} ·{" "}
                  {workspace.selectedInstance.rotationDeg}°
                </span>
              ) : null}
            </div>
            <div
              className="move-step-control"
              aria-label="Visible movement step"
            >
              <button
                type="button"
                aria-pressed={visibleMoveStep === NORMAL_MOVE_MM}
                onClick={() => setVisibleMoveStep(NORMAL_MOVE_MM)}
              >
                0.5 m
              </button>
              <button
                type="button"
                aria-pressed={visibleMoveStep === LARGE_MOVE_MM}
                onClick={() => setVisibleMoveStep(LARGE_MOVE_MM)}
              >
                2 m
              </button>
            </div>
            <div className="direction-controls">
              <button
                type="button"
                disabled={!workspace.selectedInstance}
                aria-label={`Move left ${visibleMoveStep / 1000} m`}
                onClick={() =>
                  workspace.moveSelected({ xMm: -visibleMoveStep, yMm: 0 })
                }
              >
                ←
              </button>
              <button
                type="button"
                disabled={!workspace.selectedInstance}
                aria-label={`Move up ${visibleMoveStep / 1000} m`}
                onClick={() =>
                  workspace.moveSelected({ xMm: 0, yMm: -visibleMoveStep })
                }
              >
                ↑
              </button>
              <button
                type="button"
                disabled={!workspace.selectedInstance}
                aria-label={`Move down ${visibleMoveStep / 1000} m`}
                onClick={() =>
                  workspace.moveSelected({ xMm: 0, yMm: visibleMoveStep })
                }
              >
                ↓
              </button>
              <button
                type="button"
                disabled={!workspace.selectedInstance}
                aria-label={`Move right ${visibleMoveStep / 1000} m`}
                onClick={() =>
                  workspace.moveSelected({ xMm: visibleMoveStep, yMm: 0 })
                }
              >
                →
              </button>
            </div>
            <div className="orientation-controls">
              <button
                type="button"
                disabled={!workspace.selectedInstance}
                onClick={() => workspace.rotateSelected(-15)}
                aria-label="Rotate left 15 degrees"
              >
                ↶ 15°
              </button>
              <button
                type="button"
                disabled={!workspace.selectedInstance}
                onClick={() => workspace.rotateSelected(15)}
                aria-label="Rotate right 15 degrees"
              >
                ↷ 15°
              </button>
              <button
                type="button"
                className="remove-placement"
                disabled={!workspace.selectedInstance}
                onClick={() => workspace.removeSelected()}
              >
                Remove
              </button>
            </div>
          </div>

          <section
            className="course-notes"
            aria-labelledby="course-notes-title"
          >
            <div>
              <p className="eyebrow">Course notes</p>
              <h3 id="course-notes-title">Purchase-planning geometry</h3>
            </div>
            {warnings.length === 0 ? (
              <p className="no-warnings">
                No overlap or boundary warnings in the current arrangement.
              </p>
            ) : (
              <ul>
                {warnings.map((warning, index) => (
                  <li key={`${warning.kind}-${index}`}>{warning.message}</li>
                ))}
              </ul>
            )}
            <p className="warning-boundary">
              Advisory only. These are purchase-planning geometry warnings—not
              safety, federation, regulatory, course-validity, or
              venue-measurement certification.
            </p>
          </section>
        </section>

        <aside className="equipment-summary" aria-labelledby="equipment-title">
          <div className="pane-heading">
            <p className="eyebrow">Equipment summary</p>
            <h2 id="equipment-title">Pinned quantities</h2>
            <p>Aggregated only from the exact saved snapshots used here.</p>
          </div>
          <dl data-testid="quantity-summary">
            <div>
              <dt>Obstacle instances</dt>
              <dd>{quantities.obstacleInstances}</dd>
            </div>
            <div>
              <dt>Wing assemblies / silhouette plates</dt>
              <dd>{quantities.printedWingAssemblies}</dd>
            </div>
            <div>
              <dt>Poles</dt>
              <dd>{quantities.poles}</dd>
            </div>
            <div>
              <dt>Cups / release adapters</dt>
              <dd>{quantities.cupsOrReleaseAdapters}</dd>
            </div>
            <div>
              <dt>Track assemblies</dt>
              <dd>{quantities.trackAssemblies}</dd>
            </div>
            <div>
              <dt>Foot / ballast assemblies</dt>
              <dd>{quantities.footOrBallastAssemblies}</dd>
            </div>
            <div>
              <dt>Flags</dt>
              <dd>{quantities.flags}</dd>
            </div>
            <div>
              <dt>Pole end caps</dt>
              <dd>{quantities.poleEndCaps}</dd>
            </div>
            {Object.entries(quantities.lowerElements)
              .filter(([, quantity]) => quantity > 0)
              .map(([kind, quantity]) => (
                <div key={kind}>
                  <dt>{LOWER_LABEL[kind as Exclude<LowerElement, "none">]}</dt>
                  <dd>{quantity}</dd>
                </div>
              ))}
          </dl>
          <div className="summary-boundary">
            <strong>Non-sellable prototype</strong>
            <p>
              No retail total, delivered price, freight, tax, duty, margin,
              checkout, factory quantity, or production approval.
            </p>
          </div>
        </aside>
      </div>
      <p
        className="sr-only"
        aria-live="polite"
        data-testid="course-announcement"
      >
        {workspace.announcement}
      </p>
    </main>
  );
}
