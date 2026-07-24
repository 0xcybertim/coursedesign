import type { SupportedFixtureSubject } from "@/domain/generation";
import { encodeRgbaPng } from "../../../tools/phase-1h/png";

type Point = readonly [x: number, y: number];
type DeterministicConceptSubject = SupportedFixtureSubject | "generic";

const SIZE = 480;

const PROFILES: Record<
  DeterministicConceptSubject,
  readonly Point[]
> = {
  butterfly: [
    [240, 92],
    [276, 48],
    [266, 128],
    [342, 82],
    [408, 126],
    [430, 210],
    [394, 272],
    [424, 344],
    [388, 410],
    [302, 386],
    [260, 326],
    [260, 430],
    [220, 430],
    [220, 326],
    [178, 386],
    [92, 410],
    [56, 344],
    [86, 272],
    [50, 210],
    [72, 126],
    [138, 82],
    [214, 128],
    [204, 48],
  ],
  castle: [
    [68, 420],
    [68, 150],
    [110, 150],
    [110, 94],
    [158, 94],
    [158, 150],
    [202, 150],
    [202, 68],
    [258, 68],
    [258, 150],
    [302, 150],
    [302, 94],
    [350, 94],
    [350, 150],
    [412, 150],
    [412, 420],
  ],
  dog: [
    [74, 420],
    [74, 286],
    [108, 236],
    [156, 222],
    [188, 176],
    [242, 156],
    [286, 176],
    [332, 154],
    [320, 214],
    [370, 240],
    [350, 294],
    [310, 310],
    [296, 420],
    [250, 420],
    [238, 330],
    [160, 330],
    [152, 420],
  ],
  horse: [
    [72, 420],
    [72, 286],
    [116, 236],
    [164, 216],
    [194, 142],
    [216, 70],
    [244, 142],
    [288, 164],
    [350, 228],
    [330, 286],
    [286, 306],
    [272, 420],
    [226, 420],
    [216, 326],
    [154, 326],
    [144, 420],
  ],
  leaf: [
    [72, 390],
    [86, 286],
    [132, 190],
    [214, 112],
    [330, 74],
    [416, 100],
    [406, 202],
    [362, 298],
    [278, 376],
    [170, 414],
    [98, 406],
    [88, 430],
    [66, 430],
  ],
  wave: [
    [58, 420],
    [58, 304],
    [104, 286],
    [144, 228],
    [188, 154],
    [244, 104],
    [314, 114],
    [380, 172],
    [424, 248],
    [366, 220],
    [322, 232],
    [292, 274],
    [274, 342],
    [222, 396],
    [150, 420],
  ],
  generic: [
    [72, 420],
    [72, 252],
    [132, 174],
    [240, 112],
    [348, 174],
    [408, 252],
    [408, 420],
    [344, 420],
    [344, 302],
    [240, 244],
    [136, 302],
    [136, 420],
  ],
};

function containsPoint(
  x: number,
  y: number,
  polygon: readonly Point[],
) {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const [currentX, currentY] = polygon[index]!;
    const [previousX, previousY] = polygon[previous]!;
    const crosses =
      currentY > y !== previousY > y &&
      x <
        ((previousX - currentX) * (y - currentY)) /
          (previousY - currentY) +
          currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function deterministicConceptCutout(
  subject: DeterministicConceptSubject,
) {
  const polygon = PROFILES[subject];
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!containsPoint(x + 0.5, y + 0.5, polygon)) continue;
      const offset = (y * SIZE + x) * 4;
      rgba[offset] = 36;
      rgba[offset + 1] = 80;
      rgba[offset + 2] = 120;
      rgba[offset + 3] = 255;
    }
  }
  return new Uint8Array(
    encodeRgbaPng({
      width: SIZE,
      height: SIZE,
      rgba,
    }),
  );
}
