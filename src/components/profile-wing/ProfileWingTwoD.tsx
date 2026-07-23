import type {
  ProfileWingPointMm,
  ProfileWingRenderManifest,
} from "@/domain/design";

const VIEW_WIDTH = 5900;
const VIEW_HEIGHT = 2300;
const FLOOR_Y = 2050;

function polygonPath(
  points: readonly ProfileWingPointMm[],
  translateX: number,
  mirrorX: boolean,
) {
  return points
    .map((point, index) => {
      const x = translateX + (mirrorX ? -point.x : point.x);
      const y = FLOOR_Y - point.y;
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ")
    .concat(" Z");
}

export function ProfileWingTwoD({
  manifest,
}: {
  readonly manifest: ProfileWingRenderManifest;
}) {
  const geometry = manifest.sharedProfileGeometry;

  return (
    <svg
      className="profile-wing-two-d"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-labelledby="profile-wing-2d-title profile-wing-2d-description"
      data-testid="profile-wing-2d"
      data-geometry-sha256={manifest.geometrySha256}
    >
      <title id="profile-wing-2d-title">
        Generated Profile Wing Vertical prototype
      </title>
      <desc id="profile-wing-2d-description">
        Two mirrored silhouette plates, four prototype poles, and fixed inferred
        supports. The silhouette is rendered from the exact shared polygon used
        by the 3D extrusion.
      </desc>
      <defs>
        <pattern
          id="profile-studio-grid"
          width="250"
          height="250"
          patternUnits="userSpaceOnUse"
        >
          <path d="M250 0H0V250" fill="none" stroke="#d9d8d2" strokeWidth="8" />
        </pattern>
        <linearGradient id="profile-pole-stripes" x1="0" x2="1">
          <stop offset="0%" stopColor="#0d43c7" />
          <stop offset="14%" stopColor="#0d43c7" />
          <stop offset="14%" stopColor="#ffffff" />
          <stop offset="28%" stopColor="#ffffff" />
          <stop offset="28%" stopColor="#0d43c7" />
          <stop offset="42%" stopColor="#0d43c7" />
          <stop offset="42%" stopColor="#ffffff" />
          <stop offset="56%" stopColor="#ffffff" />
          <stop offset="56%" stopColor="#0d43c7" />
          <stop offset="70%" stopColor="#0d43c7" />
          <stop offset="70%" stopColor="#ffffff" />
          <stop offset="84%" stopColor="#ffffff" />
          <stop offset="84%" stopColor="#0d43c7" />
        </linearGradient>
      </defs>

      <path
        d={`M0 ${FLOOR_Y}H${VIEW_WIDTH}V${VIEW_HEIGHT}H0Z`}
        fill="url(#profile-studio-grid)"
      />
      <ellipse
        cx={VIEW_WIDTH / 2}
        cy={FLOOR_Y + 55}
        rx="2600"
        ry="95"
        fill="#0b0b0b"
        opacity="0.08"
      />

      {manifest.fixedSupports.feet.map((foot, index) => (
        <path
          key={`foot-${foot.xMm}`}
          d={`M${VIEW_WIDTH / 2 + foot.xMm - 600} ${FLOOR_Y + 45}h1200l-120 115h-960Z`}
          fill={index === 0 ? "#ff5547" : "#e8d51b"}
          stroke="#0b0b0b"
          strokeWidth="28"
        />
      ))}

      {manifest.wingInstances.map((wing, index) => (
        <path
          key={wing.id}
          d={polygonPath(
            geometry.fittedPolygonMm,
            VIEW_WIDTH / 2 + wing.translateMm[0],
            wing.mirrorX,
          )}
          fill={index === 0 ? "#ff5547" : "#e8d51b"}
          stroke="#0b0b0b"
          strokeLinejoin="round"
          strokeWidth="34"
          data-wing-id={wing.id}
          data-source-geometry-sha256={manifest.geometrySha256}
        />
      ))}

      {manifest.fixedSupports.tracks.map((track) => (
        <rect
          key={`track-${track.xMm}`}
          x={VIEW_WIDTH / 2 + track.xMm - 38}
          y={FLOOR_Y - track.heightMm}
          width="76"
          height={track.heightMm}
          fill="#252624"
        />
      ))}

      {manifest.poles.map((pole) => (
        <rect
          key={pole.id}
          x={VIEW_WIDTH / 2 - pole.lengthMm / 2}
          y={FLOOR_Y - pole.centerHeightMm - pole.diameterMm / 2}
          width={pole.lengthMm}
          height={pole.diameterMm}
          rx={pole.diameterMm / 2}
          fill="url(#profile-pole-stripes)"
          stroke="#0b0b0b"
          strokeWidth="18"
          data-pole-id={pole.id}
        />
      ))}

      {manifest.fixedSupports.flags.map((flag, index) => {
        const x = VIEW_WIDTH / 2 + flag.xMm;
        const y = FLOOR_Y - flag.yMm;
        const direction = index === 0 ? -1 : 1;
        return (
          <path
            key={`flag-${flag.xMm}`}
            d={`M${x} ${y}v-210h${direction * 250}l${-direction * 60} 100H${x}Z`}
            fill={index === 0 ? "#ffffff" : "#ff5547"}
            stroke="#0b0b0b"
            strokeWidth="20"
          />
        );
      })}

      <g className="profile-dimension" aria-hidden="true">
        <path d="M0 2220H5900M15 2180V2260M5885 2180V2260" />
        <text x="2950" y="2190" textAnchor="middle">
          5,900 mm inferred envelope
        </text>
      </g>
    </svg>
  );
}
