import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  prepareProfileWingSource,
  rasterMaskFromCutout,
} from "@/components/profile-wing/profile-wing-source";

function sourceCanvas(output: Blob) {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    })),
    toBlob: (callback: (blob: Blob | null) => void) => callback(output),
  } as unknown as HTMLCanvasElement;
}

describe("Profile Wing source preparation", () => {
  it("byte-validates, resizes, hashes, and stores a metadata-stripped JPEG derivative", async () => {
    const bytes = readFileSync(
      "tests/fixtures/phase-1h/input/clean-dog-side.png",
    );
    const file = new File(
      [
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ],
      "dog.png",
      { type: "image/png" },
    );
    const derivative = new Blob(["jpeg-derivative"], {
      type: "image/jpeg",
    });
    const close = vi.fn();
    const store = vi.fn(async () => ({
      ok: true as const,
      value: "stored",
    }));
    const prepared = await prepareProfileWingSource(
      {
        blob: file,
        filename: file.name,
        declaredMediaType: file.type,
        sourceKind: "user_upload",
        sourceLabel: "My dog",
      },
      {
        decode: async () => ({
          source: {} as CanvasImageSource,
          width: 4096,
          height: 2048,
          close,
        }),
        createCanvas: () => sourceCanvas(derivative),
        store,
      },
    );
    expect(prepared.metadata).toMatchObject({
      sourceKind: "user_upload",
      sourceLabel: "My dog",
      originalFilename: "dog.png",
      mediaType: "image/jpeg",
      pixelWidth: 2048,
      pixelHeight: 1024,
      byteLength: derivative.size,
    });
    expect(prepared.metadata.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.metadata.sourceId).toBe(
      `upload-${prepared.metadata.contentHash.slice(0, 24)}`,
    );
    expect(store).toHaveBeenCalledWith({
      contentHash: prepared.metadata.contentHash,
      blob: derivative,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects non-PNG/JPEG user uploads before decode or storage", async () => {
    const pdf = new File(["%PDF-1.7"], "document.pdf", {
      type: "application/pdf",
    });
    const decode = vi.fn();
    const store = vi.fn();
    await expect(
      prepareProfileWingSource(
        {
          blob: pdf,
          filename: pdf.name,
          declaredMediaType: pdf.type,
          sourceKind: "user_upload",
          sourceLabel: "Document",
        },
        { decode, store },
      ),
    ).rejects.toMatchObject({ kind: "unsupported_source" });
    expect(decode).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it("extracts the returned PNG alpha channel as deterministic mask values", async () => {
    const close = vi.fn();
    const rgba = new Uint8ClampedArray([
      10, 20, 30, 0, 10, 20, 30, 64, 10, 20, 30, 128, 10, 20, 30, 255,
    ]);
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: rgba })),
      })),
    } as unknown as HTMLCanvasElement;
    const mask = await rasterMaskFromCutout(
      new Blob(["png"], { type: "image/png" }),
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      {
        decode: async () => ({
          source: {} as CanvasImageSource,
          width: 2,
          height: 2,
          close,
        }),
        createCanvas: () => canvas,
      },
    );
    expect(mask.width).toBe(2);
    expect(mask.height).toBe(2);
    expect([...mask.values]).toEqual([0, 64, 128, 255]);
    expect(close).toHaveBeenCalledOnce();
  });
});
