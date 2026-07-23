import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtworkEditor } from "@/components/studio/ArtworkEditor";
import {
  ARTWORK_PROCESSING_VERSION,
  createLinkedArtworkConfiguration,
  type ArtworkAsset,
  type ProcessedArtwork,
} from "@/domain/artwork";

const { processArtworkFile, storeArtworkArtifact } = vi.hoisted(() => ({
  processArtworkFile: vi.fn(),
  storeArtworkArtifact: vi.fn(),
}));

vi.mock("@/domain/artwork", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/domain/artwork")>();
  return { ...original, processArtworkFile };
});

vi.mock("@/lib/browser/artifact-store", () => ({
  storeArtworkArtifact,
}));

function asset(
  media: ArtworkAsset["detectedMediaType"] = "image/svg+xml",
): ArtworkAsset {
  return {
    assetId: "artwork-editor-test",
    sourceContentHash: "a".repeat(64),
    renderContentHash: "b".repeat(64),
    originalFilename: media === "image/jpeg" ? "photo.jpg" : "logo.svg",
    detectedMediaType: media,
    sourceByteLength: 100,
    renderedByteLength: 200,
    pixelWidth: 800,
    pixelHeight: 400,
    hasAlpha: media !== "image/jpeg",
    processingVersion: ARTWORK_PROCESSING_VERSION,
    svgSanitized: media === "image/svg+xml",
    rasterization: "browser_canvas_png",
    createdAt: "2026-07-15T10:00:00.000Z",
    status: "ready",
  };
}

function processed(
  media: ArtworkAsset["detectedMediaType"] = "image/svg+xml",
): ProcessedArtwork {
  return {
    asset: asset(media),
    sourceBlob: new Blob(["source"]),
    renderedBlob: new Blob(["render"]),
    warnings: [],
  };
}

beforeEach(() => {
  processArtworkFile.mockResolvedValue({ ok: true, value: processed() });
  storeArtworkArtifact.mockResolvedValue({ ok: true, value: asset() });
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:phase-1f"),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderEditor(input?: {
  initialConfiguration?: ReturnType<typeof createLinkedArtworkConfiguration>;
}) {
  const onPreview = vi.fn();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ArtworkEditor
      initialConfiguration={input?.initialConfiguration}
      resolvedUrls={{}}
      onPreview={onPreview}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onPreview, onConfirm, onCancel };
}

describe("Phase 1F artwork editor", () => {
  it("keeps an accessible file-picker alternative and reports filename/status", async () => {
    const user = userEvent.setup();
    renderEditor();
    const input = screen.getByLabelText("Choose artwork");
    await user.upload(
      input,
      new File(["<svg/>"], "sponsor.svg", { type: "image/svg+xml" }),
    );
    await waitFor(() => expect(screen.getByText("sponsor.svg")).toBeVisible());
    expect(screen.getByText(/processed as canonical PNG/)).toBeVisible();
    expect(screen.getByText(/PDF unsupported/)).toBeVisible();
  });

  it("edits linked wings together, then preserves independent right placement", async () => {
    const user = userEvent.setup();
    const { onPreview } = renderEditor();
    await user.upload(
      screen.getByLabelText("Choose artwork"),
      new File(["logo"], "logo.svg", { type: "image/svg+xml" }),
    );
    const horizontal = await screen.findByLabelText("Horizontal position");
    await user.clear(horizontal);
    await user.type(horizontal, "12");
    await waitFor(() => {
      const preview = onPreview.mock.calls.at(-1)?.[0];
      expect(preview.left.offsetXBasisPoints).toBe(1200);
      expect(preview.right.offsetXBasisPoints).toBe(1200);
    });
    await user.click(screen.getByLabelText("Edit wings separately"));
    expect(screen.getByRole("tab", { name: "Right wing" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.change(horizontal, { target: { value: "-20" } });
    await waitFor(() => {
      const preview = onPreview.mock.calls.at(-1)?.[0];
      expect(preview.mapping).toBe("independent");
      expect(preview.left.offsetXBasisPoints).toBe(1200);
      expect(preview.right.offsetXBasisPoints).toBe(-2000);
    });
  });

  it("requires explicit confirmation before relinking overwrites the right wing", async () => {
    const user = userEvent.setup();
    const independent = {
      ...createLinkedArtworkConfiguration(asset()),
      mapping: "independent" as const,
      right: {
        ...createLinkedArtworkConfiguration(asset()).right,
        offsetXBasisPoints: 2500,
      },
    };
    const { onPreview } = renderEditor({ initialConfiguration: independent });
    await user.click(screen.getByLabelText("Edit wings separately"));
    expect(
      screen.getByRole("alertdialog", { name: "Relink both wings?" }),
    ).toBeVisible();
    expect(onPreview.mock.calls.at(-1)?.[0].mapping).toBe("independent");
    await user.click(screen.getByRole("button", { name: "Confirm relink" }));
    await waitFor(() => {
      const preview = onPreview.mock.calls.at(-1)?.[0];
      expect(preview.mapping).toBe("linked");
      expect(preview.right.offsetXBasisPoints).toBe(
        preview.left.offsetXBasisPoints,
      );
    });
  });

  it("blocks transparent JPEG confirmation until an explicit background is chosen", async () => {
    processArtworkFile.mockResolvedValueOnce({
      ok: true,
      value: processed("image/jpeg"),
    });
    const user = userEvent.setup();
    const { onConfirm } = renderEditor();
    await user.upload(
      screen.getByLabelText("Choose artwork"),
      new File(["jpeg"], "photo.jpg", { type: "image/jpeg" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm artwork" }),
    );
    expect(screen.getByText(/jpeg_background_required/)).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "White" }));
    await user.click(screen.getByRole("button", { name: "Confirm artwork" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(storeArtworkArtifact).toHaveBeenCalledTimes(1);
  });

  it("supports cancel and staged remove without mutating the confirmed draft", async () => {
    const user = userEvent.setup();
    const linked = createLinkedArtworkConfiguration(asset());
    const first = renderEditor({ initialConfiguration: linked });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(first.onCancel).toHaveBeenCalledTimes(1);
    expect(first.onConfirm).not.toHaveBeenCalled();
    cleanup();
    const second = renderEditor({ initialConfiguration: linked });
    await user.click(
      screen.getByRole("button", { name: "Remove custom artwork" }),
    );
    expect(second.onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep artwork" }));
    expect(second.onConfirm).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Remove custom artwork" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(second.onConfirm).toHaveBeenCalledWith(null);
  });

  it("exposes numeric controls and prototype-only guide/fastener copy", () => {
    renderEditor({
      initialConfiguration: createLinkedArtworkConfiguration(asset()),
    });
    expect(screen.getByLabelText("Horizontal position")).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText("Vertical position")).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText("Rotation in degrees")).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText("Show prototype bleed guide")).toBeChecked();
    expect(
      screen.getByLabelText("Show prototype safe-area guide"),
    ).toBeChecked();
    expect(screen.getByText(/Fastener positions/)).toBeVisible();
    expect(
      screen.getByText(/not supplier-confirmed print rules/),
    ).toBeVisible();
  });
});
