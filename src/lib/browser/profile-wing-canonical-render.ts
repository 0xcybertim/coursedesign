import {
  hashArtworkBytes,
  type DerivedProfileWingPrototype,
} from "@/domain/design";

const CANONICAL_PROFILE_SIZE = 1024;
const CANONICAL_PROFILE_MARGIN = 72;

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new Error("The canonical Profile Wing PNG was not created."),
            ),
      "image/png",
    );
  });
}

export async function renderCanonicalProfileWing(
  prototype: DerivedProfileWingPrototype,
): Promise<{
  readonly blob: Blob;
  readonly contentHash: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}> {
  const canvas = document.createElement("canvas");
  canvas.width = CANONICAL_PROFILE_SIZE;
  canvas.height = CANONICAL_PROFILE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering is unavailable.");
  }
  const geometry = prototype.renderManifest.sharedProfileGeometry;
  const bounds = geometry.fittedBoundsMm;
  const available = CANONICAL_PROFILE_SIZE - CANONICAL_PROFILE_MARGIN * 2;
  const scale = Math.min(available / bounds.width, available / bounds.height);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.beginPath();
  for (const [index, point] of geometry.fittedPolygonMm.entries()) {
    const x = CANONICAL_PROFILE_SIZE / 2 + (point.x - centerX) * scale;
    const y = CANONICAL_PROFILE_SIZE / 2 - (point.y - centerY) * scale;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle =
    prototype.appearance?.palette.wing.toUpperCase() ?? "#0D43C7";
  context.fill();
  const blob = await canvasPng(canvas);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    blob,
    contentHash: hashArtworkBytes(bytes),
    pixelWidth: CANONICAL_PROFILE_SIZE,
    pixelHeight: CANONICAL_PROFILE_SIZE,
  };
}
