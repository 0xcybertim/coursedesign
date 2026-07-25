import type {
  ArtworkAsset,
  ArtworkBackground,
  ArtworkConfiguration,
  ArtworkPlacement,
  ArtworkResult,
  ArtworkSide,
} from "./types";
import { ARTWORK_PROCESSING_VERSION } from "./types";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function integer(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeArtworkBackground(
  background: ArtworkBackground,
): ArtworkBackground {
  if (background.mode === "transparent") return { mode: "transparent" };
  if (background.mode === "white") return { mode: "white", color: "#FFFFFF" };
  if (background.mode === "navy") return { mode: "navy", color: "#09245C" };
  const color = COLOR_PATTERN.test(background.color)
    ? background.color.toUpperCase()
    : "#FFFFFF";
  return { mode: "custom", color };
}

export function normalizeArtworkPlacement(
  placement: ArtworkPlacement,
): ArtworkPlacement {
  return {
    ...placement,
    scalePermille: integer(placement.scalePermille, 250, 4000),
    offsetXBasisPoints: integer(placement.offsetXBasisPoints, -10_000, 10_000),
    offsetYBasisPoints: integer(placement.offsetYBasisPoints, -10_000, 10_000),
    rotationMilliDegrees: integer(
      placement.rotationMilliDegrees,
      -180_000,
      180_000,
    ),
    background: normalizeArtworkBackground(placement.background),
  };
}

export function createDefaultArtworkPlacement(
  asset: ArtworkAsset,
  side: ArtworkSide,
): ArtworkPlacement {
  return {
    side,
    assetId: asset.assetId,
    sourceContentHash: asset.sourceContentHash,
    renderContentHash: asset.renderContentHash,
    pixelWidth: asset.pixelWidth,
    pixelHeight: asset.pixelHeight,
    fit: "contain",
    scalePermille: 1000,
    offsetXBasisPoints: 0,
    offsetYBasisPoints: 0,
    rotationMilliDegrees: 0,
    background: { mode: "transparent" },
    showBleedGuide: true,
    showSafeAreaGuide: true,
  };
}

export function copyPlacementToSide(
  placement: ArtworkPlacement,
  side: ArtworkSide,
): ArtworkPlacement {
  return normalizeArtworkPlacement({ ...placement, side });
}

export function createLinkedArtworkConfiguration(
  asset: ArtworkAsset,
): ArtworkConfiguration {
  const left = createDefaultArtworkPlacement(asset, "left");
  return {
    schemaVersion: ARTWORK_PROCESSING_VERSION,
    mapping: "linked",
    left,
    right: copyPlacementToSide(left, "right"),
  };
}

function validPlacement(placement: unknown, side: ArtworkSide): boolean {
  if (placement === null || typeof placement !== "object") return false;
  const value = placement as Record<string, unknown>;
  const background = value.background as Record<string, unknown> | undefined;
  return (
    value.side === side &&
    typeof value.assetId === "string" &&
    value.assetId.length > 0 &&
    typeof value.sourceContentHash === "string" &&
    HASH_PATTERN.test(value.sourceContentHash) &&
    typeof value.renderContentHash === "string" &&
    HASH_PATTERN.test(value.renderContentHash) &&
    Number.isInteger(value.pixelWidth) &&
    (value.pixelWidth as number) > 0 &&
    Number.isInteger(value.pixelHeight) &&
    (value.pixelHeight as number) > 0 &&
    (value.fit === "contain" || value.fit === "cover") &&
    Number.isInteger(value.scalePermille) &&
    Number.isInteger(value.offsetXBasisPoints) &&
    Number.isInteger(value.offsetYBasisPoints) &&
    Number.isInteger(value.rotationMilliDegrees) &&
    typeof value.showBleedGuide === "boolean" &&
    typeof value.showSafeAreaGuide === "boolean" &&
    background !== undefined &&
    (background.mode === "transparent" ||
      background.mode === "white" ||
      background.mode === "navy" ||
      (background.mode === "custom" &&
        typeof background.color === "string" &&
        COLOR_PATTERN.test(background.color)))
  );
}

export function validateArtworkConfiguration(
  value: unknown,
): ArtworkResult<ArtworkConfiguration, "invalid_placement"> {
  if (value === null || typeof value !== "object") {
    return {
      ok: false,
      error: {
        kind: "invalid_placement",
        message: "Artwork configuration is missing or malformed.",
        recoverable: true,
      },
    };
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== ARTWORK_PROCESSING_VERSION ||
    (candidate.mapping !== "linked" && candidate.mapping !== "independent") ||
    !validPlacement(candidate.left, "left") ||
    !validPlacement(candidate.right, "right")
  ) {
    return {
      ok: false,
      error: {
        kind: "invalid_placement",
        message: "Artwork placement values are outside the Phase 1F contract.",
        recoverable: true,
      },
    };
  }
  const left = normalizeArtworkPlacement(candidate.left as ArtworkPlacement);
  const right = normalizeArtworkPlacement(candidate.right as ArtworkPlacement);
  if (
    candidate.mapping === "linked" &&
    JSON.stringify(copyPlacementToSide(left, "right")) !== JSON.stringify(right)
  ) {
    return {
      ok: false,
      error: {
        kind: "invalid_placement",
        message:
          "Linked artwork must use the same asset and placement on both wings.",
        recoverable: true,
      },
    };
  }
  return {
    ok: true,
    value: {
      schemaVersion: ARTWORK_PROCESSING_VERSION,
      mapping: candidate.mapping,
      left,
      right,
    },
  };
}

export function referencedArtworkHashes(
  configuration: ArtworkConfiguration,
): readonly string[] {
  return [
    ...new Set([
      configuration.left.sourceContentHash,
      configuration.left.renderContentHash,
      configuration.right.sourceContentHash,
      configuration.right.renderContentHash,
    ]),
  ].sort();
}

export function referencedRenderableArtworkHashes(
  configuration: ArtworkConfiguration,
): readonly string[] {
  return [
    ...new Set([
      configuration.left.renderContentHash,
      configuration.right.renderContentHash,
    ]),
  ].sort();
}

export function backgroundColor(background: ArtworkBackground): string | null {
  return background.mode === "transparent" ? null : background.color;
}

export interface ArtworkTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotationDeg: number;
}

export function artworkTransform(
  placement: ArtworkPlacement,
): ArtworkTransform {
  return {
    scale: placement.scalePermille / 1000,
    offsetX: placement.offsetXBasisPoints / 10_000,
    offsetY: placement.offsetYBasisPoints / 10_000,
    rotationDeg: placement.rotationMilliDegrees / 1000,
  };
}
