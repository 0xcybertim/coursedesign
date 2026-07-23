import type {
  BillOfMaterials,
  RenderManifest,
  ValidatedConfiguration,
} from "../product/types";
import { DOMAIN_SCHEMA_VERSION } from "../product/types";
import { SPJ04_DEFINITION } from "../product/definition";
import { copyPlacementToSide, type ArtworkPlacement } from "../artwork";

const FRAME_HEX = {
  white: "#F2F1EC",
  blue: "#0D43C7",
  red: "#FF5547",
  yellow: "#E8D51B",
} as const;

const BUILT_IN_ARTWORK_HASH =
  "64c0c0f233c52967cdea119b907efb22f66c362fd6629973d5181db7068153c1";

function builtInPlacement(side: "left" | "right"): ArtworkPlacement {
  return {
    side,
    assetId: "built-in-spj-04-club-classic",
    sourceContentHash: BUILT_IN_ARTWORK_HASH,
    renderContentHash: BUILT_IN_ARTWORK_HASH,
    pixelWidth: 1024,
    pixelHeight: 2048,
    fit: "cover",
    scalePermille: 1000,
    offsetXBasisPoints: 0,
    offsetYBasisPoints: 0,
    rotationMilliDegrees: 0,
    background: { mode: "navy", color: "#09245C" },
    showBleedGuide: false,
    showSafeAreaGuide: false,
  };
}

export function createRenderManifest(
  configuration: ValidatedConfiguration,
  billOfMaterials: BillOfMaterials,
  configurationHash: string,
): RenderManifest {
  const leftPlacement =
    configuration.artworkConfiguration?.left ?? builtInPlacement("left");
  const rightPlacement =
    configuration.artworkConfiguration?.right ??
    copyPlacementToSide(leftPlacement, "right");
  const custom = configuration.artwork === "custom_artwork";
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    configurationHash,
    rendererContract: "spj-04-render-manifest-v1",
    assetRevision: "prototype-v1",
    glbUrl: "/prototype-assets/spj-04-prototype-v1.glb",
    artworkMapping: configuration.artworkMapping,
    artworkSlots: {
      left: {
        side: "left",
        source: custom ? "content_addressed" : "built_in",
        assetId: leftPlacement.assetId,
        sourceContentHash: leftPlacement.sourceContentHash,
        renderContentHash: leftPlacement.renderContentHash,
        builtInUrl: custom ? null : "/prototype-assets/panel-artwork.png",
        placement: leftPlacement,
      },
      right: {
        side: "right",
        source: custom ? "content_addressed" : "built_in",
        assetId: rightPlacement.assetId,
        sourceContentHash: rightPlacement.sourceContentHash,
        renderContentHash: rightPlacement.renderContentHash,
        builtInUrl: custom ? null : "/prototype-assets/panel-artwork.png",
        placement: rightPlacement,
      },
    },
    geometryMm: SPJ04_DEFINITION.geometry,
    palette: {
      frame: FRAME_HEX[configuration.frameColor],
      polePrimary: "#0D43C7",
      poleSecondary: "#F7F6F1",
      hardware: "#0B0B0B",
      panel: "#09245C",
    },
    lowerElement: configuration.lowerElement,
    components: billOfMaterials.lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({
        id: line.componentKey,
        kind:
          line.componentKey === "printed_wing_assembly"
            ? "wing"
            : line.componentKey === "aluminum_jump_pole"
              ? "pole"
              : line.componentKey === "cup_or_release_adapter"
                ? "cup"
                : line.componentKey === "keyhole_track_assembly"
                  ? "track"
                  : line.componentKey === "foot_or_ballast_assembly"
                    ? "foot"
                    : line.componentKey === "flag"
                      ? "flag"
                      : line.componentKey === "pole_end_cap"
                        ? "cap"
                        : "lower_element",
        quantity: line.quantity,
        color:
          line.componentKey === "printed_wing_assembly"
            ? FRAME_HEX[configuration.frameColor]
            : undefined,
        meshPattern:
          line.componentKey === "printed_wing_assembly"
            ? "^(left|right)_(frame|foot|panel)"
            : line.componentKey === "aluminum_jump_pole"
              ? "^pole_[1-4]_segment_"
              : undefined,
      })),
  };
}
