import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARTWORK_LIMITS,
  ARTWORK_PROCESSING_VERSION,
  copyPlacementToSide,
  createDefaultArtworkPlacement,
  createLinkedArtworkConfiguration,
  detectArtworkMediaType,
  hashArtworkBytes,
  normalizeArtworkPlacement,
  processArtworkFile,
  validateArtworkConfiguration,
  validateArtworkSource,
  type ArtworkAsset,
} from "@/domain/artwork";
import { DEFAULT_OBSTACLE_INTENT, deriveConfiguration } from "@/domain/design";

afterEach(() => {
  vi.restoreAllMocks();
});

function png(width = 200, height = 100, colorType = 6) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = colorType;
  return bytes;
}

function jpeg(width = 320, height = 240) {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0,
    17,
    8,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0,
    0xff,
    0xd9,
  ]);
}

function svg(markup: string) {
  return new TextEncoder().encode(markup);
}

function browserFile(bytes: Uint8Array, name: string, type: string): File {
  const file = new Blob([Uint8Array.from(bytes).buffer], { type }) as Blob & {
    name: string;
    lastModified: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
  };
  file.name = name;
  file.lastModified = 0;
  file.arrayBuffer = async () => Uint8Array.from(bytes).buffer;
  return file as File;
}

function asset(): ArtworkAsset {
  return {
    assetId: "artwork-test",
    sourceContentHash: "a".repeat(64),
    renderContentHash: "b".repeat(64),
    originalFilename: "logo.svg",
    detectedMediaType: "image/svg+xml",
    sourceByteLength: 100,
    renderedByteLength: 200,
    pixelWidth: 800,
    pixelHeight: 400,
    hasAlpha: true,
    processingVersion: ARTWORK_PROCESSING_VERSION,
    svgSanitized: true,
    rasterization: "browser_canvas_png",
    createdAt: "2026-07-15T10:00:00.000Z",
    status: "ready",
  };
}

describe("Phase 1F artwork validation and placement", () => {
  it("detects real PNG, JPEG, SVG and PDF bytes", () => {
    expect(detectArtworkMediaType(png())).toBe("image/png");
    expect(detectArtworkMediaType(jpeg())).toBe("image/jpeg");
    expect(detectArtworkMediaType(svg('<svg viewBox="0 0 10 10"/>'))).toBe(
      "image/svg+xml",
    );
    expect(detectArtworkMediaType(svg("%PDF-1.7"))).toBe("application/pdf");
  });

  it("accepts transparent PNG and valid JPEG dimensions", () => {
    expect(
      validateArtworkSource({
        bytes: png(),
        filename: "transparent.png",
        declaredMediaType: "image/png",
      }),
    ).toMatchObject({
      ok: true,
      value: { pixelWidth: 200, pixelHeight: 100, hasAlpha: true },
    });
    expect(
      validateArtworkSource({
        bytes: jpeg(),
        filename: "photo.jpg",
        declaredMediaType: "image/jpeg",
      }),
    ).toMatchObject({
      ok: true,
      value: { pixelWidth: 320, pixelHeight: 240, hasAlpha: false },
    });
  });

  it("sanitizes a passive SVG and preserves finite dimensions", () => {
    const result = validateArtworkSource({
      bytes: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><path fill="#0D43C7" d="M0 0h800v400H0z"/></svg>',
      ),
      filename: "logo.svg",
      declaredMediaType: "image/svg+xml",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        detectedMediaType: "image/svg+xml",
        pixelWidth: 800,
        pixelHeight: 400,
        hasAlpha: true,
      },
    });
    if (result.ok) {
      expect(result.value.sanitizedSvgMarkup).toContain("<svg");
      expect(result.value.sanitizedSvgMarkup).toContain(
        'xmlns="http://www.w3.org/2000/svg"',
      );
    }
  });

  it.each([
    ['<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>', "svg_script"],
    [
      '<svg viewBox="0 0 10 10"><path onclick="x()"/></svg>',
      "svg_event_handler",
    ],
    [
      '<svg viewBox="0 0 10 10"><image href="https://example.com/a.png"/></svg>',
      "svg_external_reference",
    ],
    [
      '<svg viewBox="0 0 10 10"><style>@font-face{src:url(font.woff)}</style></svg>',
      "svg_remote_font",
    ],
    [
      '<svg viewBox="0 0 10 10"><foreignObject><div>unsafe</div></foreignObject></svg>',
      "svg_foreign_object",
    ],
    [
      '<svg viewBox="0 0 10 10"><animate attributeName="x"/></svg>',
      "svg_active_content",
    ],
  ])("rejects unsafe SVG content as %s", (markup, kind) => {
    expect(
      validateArtworkSource({ bytes: svg(markup), filename: "bad.svg" }),
    ).toMatchObject({ ok: false, error: { kind } });
  });

  it("rejects excessive SVG complexity", () => {
    const markup = `<svg viewBox="0 0 10 10">${"<path d='M0 0'/>".repeat(
      ARTWORK_LIMITS.svgMaxElements + 1,
    )}</svg>`;
    expect(
      validateArtworkSource({ bytes: svg(markup), filename: "complex.svg" }),
    ).toMatchObject({ ok: false, error: { kind: "svg_too_complex" } });
  });

  it("rejects PDF, spoofed MIME, corrupt bytes, size and decoded limits", () => {
    expect(
      validateArtworkSource({ bytes: svg("%PDF-1.7"), filename: "art.pdf" }),
    ).toMatchObject({ ok: false, error: { kind: "unsupported_pdf" } });
    expect(
      validateArtworkSource({
        bytes: png(),
        filename: "fake.jpg",
        declaredMediaType: "image/jpeg",
      }),
    ).toMatchObject({ ok: false, error: { kind: "spoofed_media_type" } });
    expect(
      validateArtworkSource({
        bytes: Uint8Array.from([1, 2, 3]),
        filename: "bad.png",
      }),
    ).toMatchObject({ ok: false, error: { kind: "unsupported_media_type" } });
    const oversize = new Uint8Array(ARTWORK_LIMITS.rasterSourceMaxBytes + 1);
    oversize.set(png());
    expect(
      validateArtworkSource({ bytes: oversize, filename: "large.png" }),
    ).toMatchObject({ ok: false, error: { kind: "source_too_large" } });
    expect(
      validateArtworkSource({ bytes: png(7000, 6000), filename: "huge.png" }),
    ).toMatchObject({
      ok: false,
      error: { kind: "decoded_dimensions_too_large" },
    });
  });

  it("produces stable SHA-256 content hashes", () => {
    expect(hashArtworkBytes(new TextEncoder().encode("phase-1f"))).toBe(
      "11be9bbd602194fad450ca276724da9cd4162e9fb4838a22f4197ab9be929d20",
    );
  });

  it.each([
    ["transparent.png", "image/png", png(4096, 2048)],
    ["photo.jpg", "image/jpeg", jpeg(4096, 2048)],
    [
      "logo.svg",
      "image/svg+xml",
      svg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4096 2048"><path d="M0 0h4096v2048H0z"/></svg>',
      ),
    ],
  ])(
    "processes %s into a bounded content-addressed canonical PNG",
    async (name, type, bytes) => {
      const close = vi.fn();
      const createBitmap = vi.fn(async () => ({
        width: 4096,
        height: 2048,
        close,
      }));
      vi.stubGlobal("createImageBitmap", createBitmap);
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      } as never);
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        (callback) => {
          const canonicalBytes = new TextEncoder().encode("canonical-png");
          const blob = new Blob([canonicalBytes], { type: "image/png" });
          Object.defineProperty(blob, "arrayBuffer", {
            value: async () => Uint8Array.from(canonicalBytes).buffer,
          });
          callback(blob);
        },
      );

      const result = await processArtworkFile(
        browserFile(bytes, name, type),
        "2026-07-15T10:00:00.000Z",
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.asset).toMatchObject({
        originalFilename: name,
        detectedMediaType: type,
        pixelWidth: 2048,
        pixelHeight: 1024,
        processingVersion: ARTWORK_PROCESSING_VERSION,
        rasterization: "browser_canvas_png",
        status: "ready",
      });
      expect(result.value.asset.sourceContentHash).toBe(
        hashArtworkBytes(bytes),
      );
      expect(result.value.asset.renderContentHash).toBe(
        hashArtworkBytes(new TextEncoder().encode("canonical-png")),
      );
      expect(result.value.renderedBlob.type).toBe("image/png");
      expect(createBitmap).toHaveBeenCalledWith(expect.any(Blob), {
        imageOrientation: "from-image",
      });
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it("falls back to a revoked object URL when sanitized SVG bitmap decoding is unavailable", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("SVG bitmap decoding unavailable");
      }),
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:sanitized-svg"),
      revokeObjectURL,
    });
    vi.stubGlobal(
      "Image",
      class {
        decoding = "auto";
        src = "";
        naturalWidth = 800;
        naturalHeight = 400;
        async decode() {}
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => {
        const bytes = new TextEncoder().encode("svg-canonical-png");
        const blob = new Blob([bytes], { type: "image/png" });
        Object.defineProperty(blob, "arrayBuffer", {
          value: async () => Uint8Array.from(bytes).buffer,
        });
        callback(blob);
      },
    );

    const result = await processArtworkFile(
      browserFile(
        svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"/>'),
        "logo.svg",
        "image/svg+xml",
      ),
    );

    expect(result.ok).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sanitized-svg");
  });

  it("normalizes placement transforms to bounded integers", () => {
    const placement = createDefaultArtworkPlacement(asset(), "left");
    const normalized = normalizeArtworkPlacement({
      ...placement,
      scalePermille: 1000.6,
      offsetXBasisPoints: 20_000.2,
      offsetYBasisPoints: -20_000.2,
      rotationMilliDegrees: 181_000,
    });
    expect(normalized).toMatchObject({
      scalePermille: 1001,
      offsetXBasisPoints: 10_000,
      offsetYBasisPoints: -10_000,
      rotationMilliDegrees: 180_000,
    });
  });

  it("creates explicit linked placements and rejects an unsafe relink mismatch", () => {
    const linked = createLinkedArtworkConfiguration(asset());
    expect(linked.mapping).toBe("linked");
    expect(linked.right).toEqual(copyPlacementToSide(linked.left, "right"));
    expect(validateArtworkConfiguration(linked).ok).toBe(true);
    expect(
      validateArtworkConfiguration({
        ...linked,
        right: { ...linked.right, offsetXBasisPoints: 500 },
      }),
    ).toMatchObject({ ok: false, error: { kind: "invalid_placement" } });
  });

  it("preserves the built-in Club Classic hash and changes it for asset or placement changes", () => {
    const builtIn = deriveConfiguration(DEFAULT_OBSTACLE_INTENT);
    expect(builtIn.ok).toBe(true);
    if (!builtIn.ok) return;
    expect(builtIn.value.configurationHash).toBe(
      "721cfa28f279bc077a811d94a4b3b42b204e8f84331a82d0d69a4f44ce4a0c80",
    );
    const linked = createLinkedArtworkConfiguration(asset());
    const custom = deriveConfiguration({
      ...DEFAULT_OBSTACLE_INTENT,
      artwork: "custom_artwork",
      artworkConfiguration: linked,
    });
    const moved = deriveConfiguration({
      ...DEFAULT_OBSTACLE_INTENT,
      artwork: "custom_artwork",
      artworkConfiguration: {
        ...linked,
        mapping: "independent",
        right: { ...linked.right, offsetXBasisPoints: 500 },
      },
    });
    expect(custom.ok && moved.ok).toBe(true);
    if (!custom.ok || !moved.ok) return;
    expect(custom.value.configurationHash).not.toBe(
      builtIn.value.configurationHash,
    );
    expect(moved.value.configurationHash).not.toBe(
      custom.value.configurationHash,
    );
    expect(
      custom.value.renderManifest.artworkSlots.left.renderContentHash,
    ).toBe(asset().renderContentHash);
    expect(custom.value.renderManifest.artworkSlots.right.placement).toEqual(
      copyPlacementToSide(linked.left, "right"),
    );
  });
});
