import { artworkTransform, backgroundColor } from "@/domain/artwork";
import type {
  LowerElement,
  RenderArtworkSlot,
  RenderManifest,
} from "@/domain/product/types";
import type { ArtworkUrlMap } from "./useArtworkAssets";

function ArtworkPanel({
  slot,
  urls,
  x,
  y,
  width,
  height,
}: {
  slot: RenderArtworkSlot;
  urls: ArtworkUrlMap;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const url = urls[slot.renderContentHash];
  const transform = artworkTransform(slot.placement);
  const background = backgroundColor(slot.placement.background);
  const offsetX = transform.offsetX * width;
  const offsetY = transform.offsetY * height;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const clipId = `${slot.side}-panel-clip`;
  return (
    <g
      data-artwork-side={slot.side}
      data-artifact-hash={slot.renderContentHash}
      data-artwork-placement={JSON.stringify(slot.placement)}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={background ?? "#09245C"}
      />
      {url ? (
        <image
          href={url}
          x={x}
          y={y}
          width={width}
          height={height}
          preserveAspectRatio={`xMidYMid ${slot.placement.fit === "contain" ? "meet" : "slice"}`}
          clipPath={`url(#${clipId})`}
          transform={`translate(${offsetX} ${offsetY}) rotate(${transform.rotationDeg} ${centerX} ${centerY}) translate(${centerX} ${centerY}) scale(${transform.scale}) translate(${-centerX} ${-centerY})`}
        />
      ) : (
        <g aria-label={`Artwork unavailable for the ${slot.side} wing`}>
          <path
            d={`M${x} ${y} L${x + width} ${y + height} M${x + width} ${y} L${x} ${y + height}`}
            stroke="#C83B35"
            strokeWidth="4"
          />
        </g>
      )}
      {slot.placement.showBleedGuide ? (
        <rect
          x={x + 4}
          y={y + 4}
          width={width - 8}
          height={height - 8}
          fill="none"
          stroke="#FF5547"
          strokeWidth="2"
          strokeDasharray="7 5"
        />
      ) : null}
      {slot.placement.showSafeAreaGuide ? (
        <rect
          x={x + 12}
          y={y + 18}
          width={width - 24}
          height={height - 36}
          fill="none"
          stroke="#D7F200"
          strokeWidth="2"
          strokeDasharray="7 5"
        />
      ) : null}
    </g>
  );
}

function LowerElementShape({ selection }: { selection: LowerElement }) {
  if (selection === "none") return null;

  if (selection === "decorative_panel") {
    return (
      <g data-testid="lower-element-visual">
        <rect
          x="358"
          y="326"
          width="284"
          height="72"
          fill="#09245C"
          stroke="#0B0B0B"
          strokeWidth="4"
        />
        <path
          d="M370 388 L438 336 L500 388 L562 336 L630 388"
          fill="none"
          stroke="#FF5547"
          strokeWidth="15"
        />
      </g>
    );
  }

  if (selection === "gate") {
    return (
      <g
        data-testid="lower-element-visual"
        stroke="#0B0B0B"
        strokeWidth="12"
        strokeLinecap="square"
      >
        <path d="M365 397 L635 325 M365 325 L635 397" />
        <path d="M365 322 V402 M635 322 V402" />
      </g>
    );
  }

  return (
    <g data-testid="lower-element-visual" stroke="#0D43C7" strokeWidth="13">
      {Array.from({ length: 9 }, (_, index) => (
        <line
          key={index}
          x1={374 + index * 32}
          y1="332"
          x2={374 + index * 32}
          y2="397"
        />
      ))}
      <path d="M360 326 H640 M360 403 H640" stroke="#0B0B0B" strokeWidth="8" />
    </g>
  );
}

export function ObstacleTwoD({
  manifest,
  artworkUrls,
}: {
  manifest: RenderManifest;
  artworkUrls: ArtworkUrlMap;
}) {
  const poleHeights = [156, 236, 316, 396];

  return (
    <svg
      className="obstacle-two-d"
      viewBox="0 0 1000 540"
      role="img"
      aria-labelledby="obstacle-2d-title obstacle-2d-description"
      data-testid="2d-view"
      data-configuration-hash={manifest.configurationHash}
    >
      <title id="obstacle-2d-title">
        SPJ-04 Club Classic configured obstacle
      </title>
      <desc id="obstacle-2d-description">
        Two printed wing assemblies, four blue and white alternating poles, and{" "}
        {manifest.lowerElement === "none"
          ? "no lower element"
          : `one ${manifest.lowerElement.replaceAll("_", " ")}`}
        .
      </desc>
      <defs>
        <linearGradient id="pole-stripes" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={manifest.palette.polePrimary} />
          <stop offset="14%" stopColor={manifest.palette.polePrimary} />
          <stop offset="14%" stopColor={manifest.palette.poleSecondary} />
          <stop offset="28%" stopColor={manifest.palette.poleSecondary} />
          <stop offset="28%" stopColor={manifest.palette.polePrimary} />
          <stop offset="42%" stopColor={manifest.palette.polePrimary} />
          <stop offset="42%" stopColor={manifest.palette.poleSecondary} />
          <stop offset="56%" stopColor={manifest.palette.poleSecondary} />
          <stop offset="56%" stopColor={manifest.palette.polePrimary} />
          <stop offset="70%" stopColor={manifest.palette.polePrimary} />
          <stop offset="70%" stopColor={manifest.palette.poleSecondary} />
          <stop offset="84%" stopColor={manifest.palette.poleSecondary} />
          <stop offset="84%" stopColor={manifest.palette.polePrimary} />
          <stop offset="100%" stopColor={manifest.palette.polePrimary} />
        </linearGradient>
        <pattern
          id="studio-grid"
          width="48"
          height="48"
          patternUnits="userSpaceOnUse"
        >
          <path d="M48 0H0V48" fill="none" stroke="#D9D8D2" strokeWidth="1" />
        </pattern>
        <clipPath id="left-panel-clip">
          <rect x="110" y="112" width="122" height="312" />
        </clipPath>
        <clipPath id="right-panel-clip">
          <rect x="768" y="112" width="122" height="312" />
        </clipPath>
      </defs>

      <path
        d="M42 446 H958 L820 505 H180 Z"
        fill="url(#studio-grid)"
        opacity="0.72"
      />
      <ellipse
        cx="500"
        cy="455"
        rx="410"
        ry="28"
        fill="#0B0B0B"
        opacity="0.08"
      />

      <g data-component="left-wing">
        <rect
          x="90"
          y="86"
          width="162"
          height="366"
          fill="none"
          stroke={manifest.palette.frame}
          strokeWidth="18"
        />
        <rect
          x="110"
          y="112"
          width="122"
          height="312"
          fill={manifest.palette.panel}
        />
        <ArtworkPanel
          slot={manifest.artworkSlots.left}
          urls={artworkUrls}
          x={110}
          y={112}
          width={122}
          height={312}
        />
        <rect
          x="128"
          y="437"
          width="86"
          height="28"
          fill={manifest.palette.frame}
        />
        <rect
          x="82"
          y="449"
          width="76"
          height="20"
          fill={manifest.palette.frame}
        />
        <rect
          x="184"
          y="449"
          width="76"
          height="20"
          fill={manifest.palette.frame}
        />
        <path
          d="M242 120 V421"
          stroke={manifest.palette.hardware}
          strokeWidth="10"
        />
        <path
          d="M222 84 V52 L178 65 Z"
          fill="#FF5547"
          stroke="#0B0B0B"
          strokeWidth="3"
        />
      </g>

      <g data-component="right-wing">
        <rect
          x="748"
          y="86"
          width="162"
          height="366"
          fill="none"
          stroke={manifest.palette.frame}
          strokeWidth="18"
        />
        <rect
          x="768"
          y="112"
          width="122"
          height="312"
          fill={manifest.palette.panel}
        />
        <ArtworkPanel
          slot={manifest.artworkSlots.right}
          urls={artworkUrls}
          x={768}
          y={112}
          width={122}
          height={312}
        />
        <rect
          x="786"
          y="437"
          width="86"
          height="28"
          fill={manifest.palette.frame}
        />
        <rect
          x="740"
          y="449"
          width="76"
          height="20"
          fill={manifest.palette.frame}
        />
        <rect
          x="842"
          y="449"
          width="76"
          height="20"
          fill={manifest.palette.frame}
        />
        <path
          d="M758 120 V421"
          stroke={manifest.palette.hardware}
          strokeWidth="10"
        />
        <path
          d="M778 84 V52 L822 65 Z"
          fill="#FFFFFF"
          stroke="#0B0B0B"
          strokeWidth="3"
        />
      </g>

      <LowerElementShape selection={manifest.lowerElement} />

      <g data-component="poles">
        {poleHeights.map((y, index) => (
          <g key={y}>
            <line
              x1="238"
              y1={y}
              x2="762"
              y2={y}
              stroke={manifest.palette.hardware}
              strokeWidth="24"
              strokeLinecap="round"
            />
            <line
              x1="242"
              y1={y}
              x2="758"
              y2={y}
              stroke="url(#pole-stripes)"
              strokeWidth="16"
              strokeLinecap="butt"
              data-pole={index + 1}
            />
            <circle cx="242" cy={y} r="9" fill={manifest.palette.hardware} />
            <circle cx="758" cy={y} r="9" fill={manifest.palette.hardware} />
          </g>
        ))}
      </g>
    </svg>
  );
}
