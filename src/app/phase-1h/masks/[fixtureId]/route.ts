import { readFile } from "node:fs/promises";
import path from "node:path";
import { silhouetteReviewFixtures } from "@/domain/silhouette";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fixtureId: string }> },
) {
  const { fixtureId } = await params;
  const fixture = silhouetteReviewFixtures().find(
    (item) => item.fixtureId === fixtureId,
  );
  if (!fixture) return new Response("Not found", { status: 404 });
  const sourceDirectory =
    fixture.sourceKind === "approved-remove-bg-mask"
      ? path.join(process.cwd(), "docs", "phase-1h", "remove-bg-live-masks")
      : path.join(
          process.cwd(),
          "tests",
          "fixtures",
          "phase-1h",
          "ground-truth",
        );
  const bytes = await readFile(
    path.join(sourceDirectory, `${fixture.fixtureId}.png`),
  );
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Sha256": fixture.sourceMaskSha256,
    },
  });
}
