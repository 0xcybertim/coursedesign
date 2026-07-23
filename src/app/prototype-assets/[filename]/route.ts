import { readFile } from "node:fs/promises";
import path from "node:path";

const ASSETS = {
  "spj-04-prototype-v1.glb": {
    contentType: "model/gltf-binary",
    cacheControl: "public, max-age=31536000, immutable",
  },
  "panel-artwork.png": {
    contentType: "image/png",
    cacheControl: "public, max-age=31536000, immutable",
  },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const asset = ASSETS[filename as keyof typeof ASSETS];
  if (!asset) return new Response("Not found", { status: 404 });

  const file = await readFile(
    path.join(process.cwd(), "assets", "spj-04", "prototype-v1", filename),
  );
  return new Response(file, {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": asset.cacheControl,
      "Content-Length": String(file.byteLength),
    },
  });
}
