import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArtworkAssets } from "@/components/studio/useArtworkAssets";
import {
  ARTWORK_PROCESSING_VERSION,
  createLinkedArtworkConfiguration,
  type ArtworkAsset,
} from "@/domain/artwork";
import { DEFAULT_OBSTACLE_INTENT, deriveConfiguration } from "@/domain/design";
import type { RenderManifest } from "@/domain/product/types";

const { getArtworkBlob } = vi.hoisted(() => ({ getArtworkBlob: vi.fn() }));

vi.mock("@/lib/browser/artifact-store", () => ({ getArtworkBlob }));

function asset(character: string): ArtworkAsset {
  return {
    assetId: `asset-${character}`,
    sourceContentHash: character.repeat(64),
    renderContentHash: String.fromCharCode(character.charCodeAt(0) + 1).repeat(
      64,
    ),
    originalFilename: `${character}.png`,
    detectedMediaType: "image/png",
    sourceByteLength: 10,
    renderedByteLength: 10,
    pixelWidth: 100,
    pixelHeight: 100,
    hasAlpha: true,
    processingVersion: ARTWORK_PROCESSING_VERSION,
    svgSanitized: false,
    rasterization: "browser_canvas_png",
    createdAt: "2026-07-15T10:00:00.000Z",
    status: "ready",
  };
}

function manifest(item: ArtworkAsset): RenderManifest {
  const result = deriveConfiguration({
    ...DEFAULT_OBSTACLE_INTENT,
    artwork: "custom_artwork",
    artworkConfiguration: createLinkedArtworkConfiguration(item),
  });
  if (!result.ok) throw new Error("Expected valid artwork manifest.");
  return result.value.renderManifest;
}

function Harness({ value }: { value: RenderManifest }) {
  const assets = useArtworkAssets(value);
  return (
    <output>{`${assets.status}:${Object.keys(assets.urls).length}`}</output>
  );
}

beforeEach(() => {
  getArtworkBlob.mockResolvedValue({ ok: true, value: new Blob(["png"]) });
  let id = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => `blob:artwork-${++id}`),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("resolved artwork URL lifecycle", () => {
  it("resolves only the requested content hash and revokes URLs on replace/unmount", async () => {
    const first = manifest(asset("a"));
    const second = manifest(asset("c"));
    const rendered = render(<Harness value={first} />);
    await waitFor(() => expect(screen.getByText("ready:1")).toBeVisible());
    expect(getArtworkBlob).toHaveBeenCalledWith("b".repeat(64));
    rendered.rerender(<Harness value={second} />);
    await waitFor(() =>
      expect(getArtworkBlob).toHaveBeenCalledWith("d".repeat(64)),
    );
    await waitFor(
      () => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:artwork-1"),
      { timeout: 2_500 },
    );
    rendered.unmount();
    await waitFor(
      () => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:artwork-2"),
      { timeout: 2_500 },
    );
  });
});
