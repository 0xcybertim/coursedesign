import type { RasterImage } from "./png.ts";

export type FixtureCategory =
  | "clean"
  | "empty"
  | "multi_subject"
  | "badly_occluded";
export type ExpectedOutcome = "accept" | "reject";

export interface SubjectMaskFixtureDefinition {
  readonly id: string;
  readonly category: FixtureCategory;
  readonly subject: string;
  readonly expectedOutcome: ExpectedOutcome;
  readonly description: string;
  readonly renderer: string;
}

export const FIXTURE_WIDTH = 480;
export const FIXTURE_HEIGHT = 480;

const cleanSubjects = [
  ["clean-dog-side", "dog", "animal-dog"],
  ["clean-horse-profile", "horse", "animal-horse"],
  ["clean-cat-seated", "cat", "animal-cat"],
  ["clean-rabbit", "rabbit", "animal-rabbit"],
  ["clean-bird", "bird", "animal-bird"],
  ["clean-fish", "fish", "animal-fish"],
  ["clean-butterfly", "butterfly", "animal-butterfly"],
  ["clean-turtle", "turtle", "animal-turtle"],
  ["clean-fox", "fox", "animal-fox"],
  ["clean-elephant", "elephant", "animal-elephant"],
  ["clean-ball", "ball", "object-ball"],
  ["clean-chair", "chair", "object-chair"],
  ["clean-boot", "boot", "object-boot"],
  ["clean-watering-can", "watering can", "object-watering-can"],
  ["clean-umbrella", "umbrella", "object-umbrella"],
  ["clean-guitar", "guitar", "object-guitar"],
  ["clean-bicycle", "bicycle", "object-bicycle"],
  ["clean-teapot", "teapot", "object-teapot"],
  ["clean-lamp", "table lamp", "object-lamp"],
  ["clean-toy-plane", "toy airplane", "object-plane"],
] as const;

export const subjectMaskFixtures: readonly SubjectMaskFixtureDefinition[] = [
  ...cleanSubjects.map(([id, subject, renderer]) => ({
    id,
    category: "clean" as const,
    subject,
    expectedOutcome: "accept" as const,
    description: `One centered ${subject} against a generated textured background.`,
    renderer,
  })),
  {
    id: "empty-soft-gradient",
    category: "empty",
    subject: "none",
    expectedOutcome: "reject",
    description: "Generated soft gradient with no foreground subject.",
    renderer: "empty-gradient",
  },
  {
    id: "empty-speckled-wall",
    category: "empty",
    subject: "none",
    expectedOutcome: "reject",
    description: "Generated lightly speckled wall with no foreground subject.",
    renderer: "empty-speckles",
  },
  {
    id: "empty-floor-horizon",
    category: "empty",
    subject: "none",
    expectedOutcome: "reject",
    description: "Generated wall and floor horizon with no foreground subject.",
    renderer: "empty-horizon",
  },
  {
    id: "multi-dog-and-ball",
    category: "multi_subject",
    subject: "dog and ball",
    expectedOutcome: "reject",
    description: "Two separated generated subjects: a dog and a ball.",
    renderer: "multi-dog-ball",
  },
  {
    id: "multi-chair-and-lamp",
    category: "multi_subject",
    subject: "chair and lamp",
    expectedOutcome: "reject",
    description: "Two separated generated object subjects: a chair and a lamp.",
    renderer: "multi-chair-lamp",
  },
  {
    id: "multi-bird-and-fish",
    category: "multi_subject",
    subject: "bird and fish",
    expectedOutcome: "reject",
    description: "Two separated generated animal subjects: a bird and a fish.",
    renderer: "multi-bird-fish",
  },
  {
    id: "occluded-dog",
    category: "badly_occluded",
    subject: "dog",
    expectedOutcome: "reject",
    description:
      "Generated dog split into disconnected visible fragments by a wide occluder.",
    renderer: "occluded-dog",
  },
  {
    id: "occluded-chair",
    category: "badly_occluded",
    subject: "chair",
    expectedOutcome: "reject",
    description:
      "Generated chair split into disconnected visible fragments by a wide occluder.",
    renderer: "occluded-chair",
  },
  {
    id: "occluded-plane",
    category: "badly_occluded",
    subject: "toy airplane",
    expectedOutcome: "reject",
    description:
      "Generated airplane split into disconnected visible fragments by a wide occluder.",
    renderer: "occluded-plane",
  },
];

interface Canvas {
  readonly rgba: Uint8Array;
  readonly mask: Uint8Array;
}

type Color = readonly [number, number, number];

function seededNoise(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function background(seed: number): Canvas {
  const rgba = new Uint8Array(FIXTURE_WIDTH * FIXTURE_HEIGHT * 4);
  const mask = new Uint8Array(FIXTURE_WIDTH * FIXTURE_HEIGHT);
  const random = seededNoise(seed);
  for (let y = 0; y < FIXTURE_HEIGHT; y += 1) {
    for (let x = 0; x < FIXTURE_WIDTH; x += 1) {
      const pixel = y * FIXTURE_WIDTH + x;
      const texture = Math.floor(random() * 11) - 5;
      const light = Math.round(
        228 + 16 * (x / FIXTURE_WIDTH) - 8 * (y / FIXTURE_HEIGHT),
      );
      rgba[pixel * 4] = Math.max(0, Math.min(255, light + texture));
      rgba[pixel * 4 + 1] = Math.max(0, Math.min(255, light + 4 + texture));
      rgba[pixel * 4 + 2] = Math.max(0, Math.min(255, light + 9 + texture));
      rgba[pixel * 4 + 3] = 255;
    }
  }
  return { rgba, mask };
}

function setPixel(
  canvas: Canvas,
  x: number,
  y: number,
  color: Color,
  foreground = true,
) {
  if (x < 0 || y < 0 || x >= FIXTURE_WIDTH || y >= FIXTURE_HEIGHT) return;
  const pixel = Math.floor(y) * FIXTURE_WIDTH + Math.floor(x);
  canvas.rgba.set([...color, 255], pixel * 4);
  if (foreground) canvas.mask[pixel] = 255;
}

function ellipse(
  canvas: Canvas,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: Color,
) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1)
        setPixel(canvas, x, y, color);
}

function eraseEllipse(
  canvas: Canvas,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: Color,
) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) {
        if (x < 0 || y < 0 || x >= FIXTURE_WIDTH || y >= FIXTURE_HEIGHT)
          continue;
        const pixel = y * FIXTURE_WIDTH + x;
        canvas.rgba.set([...color, 255], pixel * 4);
        canvas.mask[pixel] = 0;
      }
}

function rectangle(
  canvas: Canvas,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Color,
) {
  for (let py = y; py < y + height; py += 1)
    for (let px = x; px < x + width; px += 1) setPixel(canvas, px, py, color);
}

function polygon(
  canvas: Canvas,
  points: readonly (readonly [number, number])[],
  color: Color,
) {
  const minY = Math.floor(Math.min(...points.map((point) => point[1])));
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections: number[] = [];
    for (let index = 0; index < points.length; index += 1) {
      const [x1, y1] = points[index]!;
      const [x2, y2] = points[(index + 1) % points.length]!;
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y))
        intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index < intersections.length; index += 2)
      for (
        let x = Math.ceil(intersections[index]!);
        x <= Math.floor(intersections[index + 1]!);
        x += 1
      )
        setPixel(canvas, x, y, color);
  }
}

function line(
  canvas: Canvas,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: Color,
) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / Math.max(1, steps);
    ellipse(
      canvas,
      x1 + (x2 - x1) * t,
      y1 + (y2 - y1) * t,
      width / 2,
      width / 2,
      color,
    );
  }
}

const NAVY: Color = [20, 52, 96];
const RUST: Color = [183, 78, 35];
const GOLD: Color = [215, 162, 42];
const GREEN: Color = [44, 116, 78];
const CORAL: Color = [224, 83, 75];
const BLACK: Color = [24, 25, 28];

function drawDog(canvas: Canvas, ox = 0, oy = 0, scale = 1) {
  ellipse(
    canvas,
    ox + 235 * scale,
    oy + 270 * scale,
    104 * scale,
    58 * scale,
    RUST,
  );
  ellipse(
    canvas,
    ox + 335 * scale,
    oy + 226 * scale,
    50 * scale,
    48 * scale,
    RUST,
  );
  polygon(
    canvas,
    [
      [ox + 310 * scale, oy + 195 * scale],
      [ox + 318 * scale, oy + 133 * scale],
      [ox + 348 * scale, oy + 190 * scale],
    ],
    NAVY,
  );
  polygon(
    canvas,
    [
      [ox + 350 * scale, oy + 192 * scale],
      [ox + 382 * scale, oy + 148 * scale],
      [ox + 382 * scale, oy + 216 * scale],
    ],
    NAVY,
  );
  rectangle(
    canvas,
    ox + 166 * scale,
    oy + 300 * scale,
    30 * scale,
    96 * scale,
    RUST,
  );
  rectangle(
    canvas,
    ox + 270 * scale,
    oy + 300 * scale,
    30 * scale,
    96 * scale,
    RUST,
  );
  line(
    canvas,
    ox + 140 * scale,
    oy + 250 * scale,
    ox + 82 * scale,
    oy + 202 * scale,
    22 * scale,
    NAVY,
  );
}

function drawHorse(canvas: Canvas) {
  ellipse(canvas, 225, 278, 112, 58, NAVY);
  polygon(
    canvas,
    [
      [278, 264],
      [304, 144],
      [350, 162],
      [330, 285],
    ],
    RUST,
  );
  ellipse(canvas, 342, 162, 47, 38, RUST);
  polygon(
    canvas,
    [
      [320, 135],
      [327, 88],
      [347, 140],
    ],
    GOLD,
  );
  polygon(
    canvas,
    [
      [350, 139],
      [374, 99],
      [369, 154],
    ],
    GOLD,
  );
  rectangle(canvas, 150, 304, 29, 104, NAVY);
  rectangle(canvas, 262, 304, 29, 104, NAVY);
  line(canvas, 118, 274, 72, 208, 21, RUST);
}

function drawCat(canvas: Canvas) {
  ellipse(canvas, 237, 302, 91, 102, NAVY);
  ellipse(canvas, 246, 191, 67, 59, NAVY);
  polygon(
    canvas,
    [
      [190, 164],
      [201, 93],
      [235, 154],
    ],
    RUST,
  );
  polygon(
    canvas,
    [
      [258, 153],
      [301, 95],
      [299, 176],
    ],
    RUST,
  );
  line(canvas, 162, 326, 104, 230, 24, NAVY);
  ellipse(canvas, 103, 222, 19, 31, NAVY);
}

function drawRabbit(canvas: Canvas) {
  ellipse(canvas, 230, 306, 100, 79, GREEN);
  ellipse(canvas, 319, 232, 58, 54, GREEN);
  ellipse(canvas, 302, 139, 25, 85, RUST);
  ellipse(canvas, 345, 135, 23, 87, RUST);
  ellipse(canvas, 133, 286, 26, 30, GOLD);
}

function drawBird(canvas: Canvas, ox = 0, oy = 0, scale = 1) {
  ellipse(
    canvas,
    ox + 229 * scale,
    oy + 270 * scale,
    108 * scale,
    73 * scale,
    CORAL,
  );
  ellipse(
    canvas,
    ox + 327 * scale,
    oy + 218 * scale,
    51 * scale,
    49 * scale,
    CORAL,
  );
  ellipse(
    canvas,
    ox + 218 * scale,
    oy + 273 * scale,
    58 * scale,
    45 * scale,
    NAVY,
  );
  polygon(
    canvas,
    [
      [ox + 377 * scale, oy + 213 * scale],
      [ox + 426 * scale, oy + 232 * scale],
      [ox + 376 * scale, oy + 246 * scale],
    ],
    GOLD,
  );
  polygon(
    canvas,
    [
      [ox + 130 * scale, oy + 270 * scale],
      [ox + 67 * scale, oy + 223 * scale],
      [ox + 104 * scale, oy + 313 * scale],
    ],
    NAVY,
  );
  line(
    canvas,
    ox + 224 * scale,
    oy + 334 * scale,
    ox + 214 * scale,
    oy + 389 * scale,
    10 * scale,
    BLACK,
  );
}

function drawFish(canvas: Canvas, ox = 0, oy = 0, scale = 1) {
  ellipse(
    canvas,
    ox + 242 * scale,
    oy + 248 * scale,
    115 * scale,
    70 * scale,
    NAVY,
  );
  polygon(
    canvas,
    [
      [ox + 136 * scale, oy + 248 * scale],
      [ox + 62 * scale, oy + 169 * scale],
      [ox + 62 * scale, oy + 327 * scale],
    ],
    CORAL,
  );
  polygon(
    canvas,
    [
      [ox + 223 * scale, oy + 191 * scale],
      [ox + 275 * scale, oy + 128 * scale],
      [ox + 294 * scale, oy + 210 * scale],
    ],
    GOLD,
  );
  ellipse(
    canvas,
    ox + 318 * scale,
    oy + 229 * scale,
    10 * scale,
    10 * scale,
    BLACK,
  );
}

function drawButterfly(canvas: Canvas) {
  ellipse(canvas, 177, 224, 82, 105, CORAL);
  ellipse(canvas, 303, 224, 82, 105, GOLD);
  ellipse(canvas, 183, 333, 63, 71, NAVY);
  ellipse(canvas, 297, 333, 63, 71, GREEN);
  rectangle(canvas, 226, 160, 28, 211, BLACK);
  line(canvas, 234, 168, 197, 107, 8, BLACK);
  line(canvas, 246, 168, 283, 107, 8, BLACK);
}

function drawTurtle(canvas: Canvas) {
  ellipse(canvas, 229, 267, 126, 86, GREEN);
  ellipse(canvas, 351, 261, 48, 38, RUST);
  ellipse(canvas, 138, 191, 35, 29, RUST);
  ellipse(canvas, 138, 344, 35, 29, RUST);
  ellipse(canvas, 285, 190, 35, 29, RUST);
  ellipse(canvas, 285, 344, 35, 29, RUST);
  polygon(
    canvas,
    [
      [102, 260],
      [60, 239],
      [60, 282],
    ],
    NAVY,
  );
  line(canvas, 94, 260, 145, 260, 18, NAVY);
}

function drawFox(canvas: Canvas) {
  ellipse(canvas, 230, 286, 110, 61, RUST);
  polygon(
    canvas,
    [
      [270, 266],
      [335, 164],
      [394, 231],
      [333, 303],
    ],
    RUST,
  );
  polygon(
    canvas,
    [
      [321, 177],
      [325, 105],
      [353, 166],
    ],
    NAVY,
  );
  polygon(
    canvas,
    [
      [356, 175],
      [393, 120],
      [389, 206],
    ],
    NAVY,
  );
  line(canvas, 340, 183, 374, 190, 22, NAVY);
  rectangle(canvas, 168, 314, 27, 90, RUST);
  rectangle(canvas, 270, 314, 27, 90, RUST);
  line(canvas, 133, 280, 67, 228, 38, RUST);
}

function drawElephant(canvas: Canvas) {
  ellipse(canvas, 224, 270, 124, 88, NAVY);
  ellipse(canvas, 340, 238, 66, 61, NAVY);
  ellipse(canvas, 302, 229, 52, 61, CORAL);
  line(canvas, 373, 261, 389, 359, 29, NAVY);
  rectangle(canvas, 139, 315, 35, 91, NAVY);
  rectangle(canvas, 258, 315, 35, 91, NAVY);
  line(canvas, 107, 265, 77, 229, 13, NAVY);
}

function drawBall(canvas: Canvas, ox = 0, oy = 0, scale = 1) {
  ellipse(
    canvas,
    ox + 240 * scale,
    oy + 252 * scale,
    119 * scale,
    119 * scale,
    CORAL,
  );
  line(
    canvas,
    ox + 142 * scale,
    oy + 206 * scale,
    ox + 340 * scale,
    oy + 299 * scale,
    15 * scale,
    GOLD,
  );
  line(
    canvas,
    ox + 193 * scale,
    oy + 140 * scale,
    ox + 286 * scale,
    oy + 364 * scale,
    15 * scale,
    NAVY,
  );
}

function drawChair(canvas: Canvas, ox = 0, oy = 0, scale = 1) {
  rectangle(
    canvas,
    ox + 153 * scale,
    oy + 118 * scale,
    174 * scale,
    150 * scale,
    GREEN,
  );
  rectangle(
    canvas,
    ox + 129 * scale,
    oy + 255 * scale,
    222 * scale,
    57 * scale,
    RUST,
  );
  rectangle(
    canvas,
    ox + 150 * scale,
    oy + 302 * scale,
    31 * scale,
    112 * scale,
    NAVY,
  );
  rectangle(
    canvas,
    ox + 300 * scale,
    oy + 302 * scale,
    31 * scale,
    112 * scale,
    NAVY,
  );
}

function drawBoot(canvas: Canvas) {
  polygon(
    canvas,
    [
      [160, 103],
      [304, 103],
      [304, 290],
      [388, 326],
      [388, 386],
      [145, 386],
      [145, 306],
      [175, 270],
    ],
    NAVY,
  );
  rectangle(canvas, 170, 133, 104, 38, GOLD);
}

function drawWateringCan(canvas: Canvas) {
  rectangle(canvas, 157, 214, 174, 147, GREEN);
  ellipse(canvas, 242, 215, 88, 47, GREEN);
  polygon(
    canvas,
    [
      [158, 244],
      [70, 293],
      [63, 329],
      [163, 296],
    ],
    GOLD,
  );
  line(canvas, 297, 216, 363, 141, 29, GREEN);
  line(canvas, 363, 141, 399, 228, 29, GREEN);
}

function drawUmbrella(canvas: Canvas) {
  polygon(
    canvas,
    [
      [67, 250],
      [97, 175],
      [154, 124],
      [239, 102],
      [326, 124],
      [384, 175],
      [414, 250],
    ],
    CORAL,
  );
  ellipse(canvas, 240, 248, 173, 55, CORAL);
  rectangle(canvas, 231, 244, 18, 147, NAVY);
  line(canvas, 240, 385, 277, 409, 17, NAVY);
}

function drawGuitar(canvas: Canvas) {
  ellipse(canvas, 196, 315, 83, 93, RUST);
  ellipse(canvas, 224, 227, 62, 69, RUST);
  polygon(
    canvas,
    [
      [241, 199],
      [310, 84],
      [343, 102],
      [274, 222],
    ],
    NAVY,
  );
  ellipse(canvas, 210, 281, 23, 23, BLACK);
}

function drawBicycle(canvas: Canvas) {
  ellipse(canvas, 131, 324, 78, 78, NAVY);
  ellipse(canvas, 349, 324, 78, 78, NAVY);
  eraseEllipse(canvas, 131, 324, 48, 48, [232, 236, 241]);
  eraseEllipse(canvas, 349, 324, 48, 48, [232, 236, 241]);
  line(canvas, 131, 324, 220, 322, 18, CORAL);
  line(canvas, 220, 322, 278, 224, 18, CORAL);
  line(canvas, 278, 224, 349, 324, 18, CORAL);
  line(canvas, 220, 322, 349, 324, 18, CORAL);
  line(canvas, 278, 224, 315, 201, 15, NAVY);
  line(canvas, 208, 228, 229, 322, 15, NAVY);
}

function drawTeapot(canvas: Canvas) {
  ellipse(canvas, 235, 281, 111, 84, CORAL);
  rectangle(canvas, 181, 177, 108, 42, NAVY);
  ellipse(canvas, 235, 171, 22, 18, GOLD);
  polygon(
    canvas,
    [
      [133, 246],
      [55, 203],
      [72, 292],
      [138, 304],
    ],
    CORAL,
  );
  line(canvas, 337, 247, 397, 203, 27, NAVY);
  line(canvas, 397, 203, 400, 321, 27, NAVY);
  line(canvas, 400, 321, 341, 311, 27, NAVY);
}

function drawLamp(canvas: Canvas, ox = 0, oy = 0, scale = 1) {
  polygon(
    canvas,
    [
      [ox + 160 * scale, oy + 122 * scale],
      [ox + 320 * scale, oy + 122 * scale],
      [ox + 359 * scale, oy + 245 * scale],
      [ox + 121 * scale, oy + 245 * scale],
    ],
    GOLD,
  );
  rectangle(
    canvas,
    ox + 226 * scale,
    oy + 239 * scale,
    28 * scale,
    126 * scale,
    NAVY,
  );
  ellipse(
    canvas,
    ox + 240 * scale,
    oy + 380 * scale,
    95 * scale,
    30 * scale,
    NAVY,
  );
}

function drawPlane(canvas: Canvas) {
  polygon(
    canvas,
    [
      [54, 264],
      [204, 230],
      [292, 119],
      [323, 127],
      [286, 229],
      [417, 254],
      [420, 286],
      [282, 284],
      [324, 376],
      [292, 387],
      [202, 289],
      [54, 292],
    ],
    NAVY,
  );
  polygon(
    canvas,
    [
      [89, 250],
      [62, 190],
      [90, 184],
      [139, 241],
    ],
    CORAL,
  );
  line(canvas, 102, 247, 168, 252, 20, CORAL);
}

function drawRenderer(canvas: Canvas, renderer: string) {
  const draw: Record<string, (target: Canvas) => void> = {
    "animal-dog": drawDog,
    "animal-horse": drawHorse,
    "animal-cat": drawCat,
    "animal-rabbit": drawRabbit,
    "animal-bird": drawBird,
    "animal-fish": drawFish,
    "animal-butterfly": drawButterfly,
    "animal-turtle": drawTurtle,
    "animal-fox": drawFox,
    "animal-elephant": drawElephant,
    "object-ball": drawBall,
    "object-chair": drawChair,
    "object-boot": drawBoot,
    "object-watering-can": drawWateringCan,
    "object-umbrella": drawUmbrella,
    "object-guitar": drawGuitar,
    "object-bicycle": drawBicycle,
    "object-teapot": drawTeapot,
    "object-lamp": drawLamp,
    "object-plane": drawPlane,
  };
  const rendererFunction = draw[renderer];
  if (!rendererFunction)
    throw new Error(`Unknown fixture renderer: ${renderer}`);
  rendererFunction(canvas);
}

function eraseMaskRectangle(
  canvas: Canvas,
  y: number,
  height: number,
  color: Color,
) {
  for (let py = y; py < y + height; py += 1)
    for (let px = 0; px < FIXTURE_WIDTH; px += 1) {
      const pixel = py * FIXTURE_WIDTH + px;
      canvas.rgba.set([...color, 255], pixel * 4);
      canvas.mask[pixel] = 0;
    }
}

export function renderSubjectMaskFixture(
  definition: SubjectMaskFixtureDefinition,
): {
  readonly input: RasterImage;
  readonly groundTruthMask: Uint8Array;
} {
  const seed = [...definition.id].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    17,
  );
  const canvas = background(seed);
  if (definition.category === "clean")
    drawRenderer(canvas, definition.renderer);
  else if (definition.renderer === "empty-speckles") {
    for (let index = 0; index < 1_400; index += 1) {
      const x = (index * 83) % FIXTURE_WIDTH;
      const y = (index * 191) % FIXTURE_HEIGHT;
      setPixel(canvas, x, y, [197, 204, 211], false);
    }
  } else if (definition.renderer === "empty-horizon") {
    for (let y = 322; y < FIXTURE_HEIGHT; y += 1)
      for (let x = 0; x < FIXTURE_WIDTH; x += 1)
        setPixel(canvas, x, y, [205, 198, 187], false);
  } else if (definition.renderer === "multi-dog-ball") {
    drawDog(canvas, -48, 72, 0.68);
    drawBall(canvas, 218, 91, 0.58);
  } else if (definition.renderer === "multi-chair-lamp") {
    drawChair(canvas, -54, 58, 0.65);
    drawLamp(canvas, 221, 62, 0.6);
  } else if (definition.renderer === "multi-bird-fish") {
    drawBird(canvas, -50, 28, 0.66);
    drawFish(canvas, 215, 80, 0.58);
  } else if (definition.renderer === "occluded-dog") {
    drawDog(canvas);
    eraseMaskRectangle(canvas, 238, 86, [192, 198, 207]);
  } else if (definition.renderer === "occluded-chair") {
    drawChair(canvas);
    eraseMaskRectangle(canvas, 226, 92, [192, 198, 207]);
  } else if (definition.renderer === "occluded-plane") {
    drawPlane(canvas);
    eraseMaskRectangle(canvas, 233, 80, [192, 198, 207]);
  }
  return {
    input: { width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT, rgba: canvas.rgba },
    groundTruthMask: canvas.mask,
  };
}
