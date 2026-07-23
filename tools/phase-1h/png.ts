import { deflateSync, inflateSync } from "node:zlib";

export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value >>> 0);
  return bytes;
}

function chunk(type: string, data: Uint8Array) {
  const typeBytes = Buffer.from(type, "ascii");
  return Buffer.concat([
    uint32(data.byteLength),
    typeBytes,
    data,
    uint32(crc32(Buffer.concat([typeBytes, data]))),
  ]);
}

export function encodeRgbaPng(image: RasterImage) {
  if (image.rgba.byteLength !== image.width * image.height * 4)
    throw new Error("RGBA byte length does not match the image dimensions.");
  const rows = Buffer.alloc(image.height * (1 + image.width * 4));
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (1 + image.width * 4);
    rows[rowOffset] = 0;
    rows.set(
      image.rgba.subarray(y * image.width * 4, (y + 1) * image.width * 4),
      rowOffset + 1,
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ]);
}

function paeth(left: number, above: number, upperLeft: number) {
  const p = left + above - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - above);
  const pc = Math.abs(p - upperLeft);
  return pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
}

export function decodePng(bytes: Uint8Array): RasterImage {
  if (
    bytes.byteLength < PNG_SIGNATURE.byteLength ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  )
    throw new Error("Mask response is not a PNG image.");
  let offset = PNG_SIGNATURE.byteLength;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const compressed: Buffer[] = [];
  while (offset + 12 <= bytes.byteLength) {
    const length = Buffer.from(bytes).readUInt32BE(offset);
    const type = Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString(
      "ascii",
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.byteLength)
      throw new Error("PNG chunk is truncated.");
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = Buffer.from(data).readUInt32BE(0);
      height = Buffer.from(data).readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0)
        throw new Error("Only 8-bit non-interlaced PNG masks are supported.");
      colorType = data[9] ?? -1;
    } else if (type === "IDAT") {
      compressed.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType] ?? 0;
  if (!width || !height || !channels || compressed.length === 0)
    throw new Error("PNG mask uses an unsupported or incomplete layout.");
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  if (raw.byteLength !== height * (stride + 1))
    throw new Error("PNG scanline size is inconsistent with its header.");
  const unpacked = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1);
    const filter = raw[rawOffset];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rawOffset + 1 + x] ?? 0;
      const left = x >= channels ? unpacked[y * stride + x - channels]! : 0;
      const above = y > 0 ? unpacked[(y - 1) * stride + x]! : 0;
      const upperLeft =
        y > 0 && x >= channels ? unpacked[(y - 1) * stride + x - channels]! : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : filter === 4
                  ? paeth(left, above, upperLeft)
                  : Number.NaN;
      if (Number.isNaN(predictor))
        throw new Error("PNG uses an unknown filter.");
      unpacked[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    if (colorType === 0 || colorType === 4) {
      const gray = unpacked[source] ?? 0;
      rgba[target] = gray;
      rgba[target + 1] = gray;
      rgba[target + 2] = gray;
      rgba[target + 3] = colorType === 4 ? (unpacked[source + 1] ?? 255) : 255;
    } else {
      rgba[target] = unpacked[source] ?? 0;
      rgba[target + 1] = unpacked[source + 1] ?? 0;
      rgba[target + 2] = unpacked[source + 2] ?? 0;
      rgba[target + 3] = colorType === 6 ? (unpacked[source + 3] ?? 255) : 255;
    }
  }
  return { width, height, rgba };
}

export function maskValues(image: RasterImage) {
  const values = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < values.byteLength; pixel += 1) {
    const offset = pixel * 4;
    values[pixel] = Math.round(
      ((image.rgba[offset] ?? 0) +
        (image.rgba[offset + 1] ?? 0) +
        (image.rgba[offset + 2] ?? 0)) /
        3,
    );
  }
  return values;
}

export function maskToPng(width: number, height: number, mask: Uint8Array) {
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const value = mask[pixel] ?? 0;
    rgba.set([value, value, value, 255], pixel * 4);
  }
  return encodeRgbaPng({ width, height, rgba });
}

export function alphaChannelToMaskPng(png: Uint8Array) {
  const image = decodePng(png);
  const mask = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < mask.byteLength; pixel += 1)
    mask[pixel] = image.rgba[pixel * 4 + 3] ?? 255;
  return maskToPng(image.width, image.height, mask);
}
