import jpeg from "jpeg-js";
import { Unzlib, zlibSync } from "fflate";
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from "../shared/product-images.js";
export class ImageFailure extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const invalid = () => {
  throw new ImageFailure(
    400,
    "Invalid or unsupported image. Choose a still JPEG or PNG image.",
  );
};
const dimensions = (w, h) => {
  if (!w || !h || w > 4096 || h > 4096 || w * h > MAX_IMAGE_PIXELS)
    throw new ImageFailure(
      400,
      "Image dimensions exceed the limit: 4096 per side and 4 megapixels. Choose a smaller image.",
    );
};
const join = (parts) => {
  const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    b.set(p, at);
    at += p.length;
  }
  return b;
};
const ascii = (b) => String.fromCharCode(...b);
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const chunk = new Uint8Array(data.length + 12),
    view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
  return chunk;
}
// Only the fixed Adobe color-transform header is retained. Unknown APP14
// segments, private flags and trailing payloads are stripped entirely.
function adobeSegment(data) {
  return (
    data.length === 12 &&
    ascii(data.subarray(0, 5)) === "Adobe" &&
    data[5] === 0 &&
    [100, 101].includes(data[6]) &&
    !data[7] &&
    !data[8] &&
    !data[9] &&
    !data[10] &&
    data[11] <= 2
  );
}
function png(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length),
    parts = [bytes.slice(0, 8)],
    compressed = [];
  let pos = 8,
    w,
    h,
    color,
    seenData = false,
    endedData = false,
    ended = false,
    palette = false,
    trns = false;
  while (pos < bytes.length) {
    if (pos + 12 > bytes.length) invalid();
    const len = view.getUint32(pos),
      end = pos + 12 + len,
      type = ascii(bytes.subarray(pos + 4, pos + 8));
    if (
      end > bytes.length ||
      !/^[A-Za-z]{4}$/.test(type) ||
      type[2] !== type[2].toUpperCase() ||
      crc32(bytes.subarray(pos + 4, end - 4)) !== view.getUint32(end - 4)
    )
      invalid();
    const data = bytes.subarray(pos + 8, end - 4);
    if (pos === 8 && type !== "IHDR") invalid();
    if (type === "IHDR") {
      if (pos !== 8 || len !== 13) invalid();
      w = view.getUint32(pos + 8);
      h = view.getUint32(pos + 12);
      dimensions(w, h);
      color = data[9];
      if (
        data[8] !== 8 ||
        ![0, 2, 3, 4, 6].includes(color) ||
        data[10] ||
        data[11] ||
        data[12]
      )
        invalid();
    } else if (type === "PLTE") {
      if (
        palette ||
        seenData ||
        len < 3 ||
        len > 768 ||
        len % 3 ||
        [0, 4].includes(color)
      )
        invalid();
      palette = len / 3;
    } else if (type === "tRNS") {
      if (
        trns ||
        seenData ||
        ![0, 2, 3].includes(color) ||
        ([0, 2].includes(color) && len !== (color === 0 ? 2 : 6)) ||
        (color === 3 && (!palette || len > palette || !len))
      )
        invalid();
      trns = true;
    } else if (type === "IDAT") {
      if (endedData || (color === 3 && !palette)) invalid();
      seenData = true;
      compressed.push(data);
    } else if (type === "IEND") {
      if (len || !seenData || end !== bytes.length) invalid();
      ended = true;
    } else {
      if (
        type[0] === type[0].toUpperCase() ||
        ["acTL", "fcTL", "fdAT"].includes(type)
      )
        invalid();
    }
    if (seenData && type !== "IDAT") endedData = true;
    if (["IHDR", "PLTE", "tRNS"].includes(type))
      parts.push(bytes.slice(pos, end));
    pos = end;
  }
  if (!ended) invalid();
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color],
    stride = w * channels + 1,
    expected = stride * h,
    input = join(compressed),
    pixels = new Uint8Array(expected);
  let count = 0,
    a = 1,
    b = 0,
    filter = 0,
    previous = new Uint8Array(stride - 1),
    row = new Uint8Array(stride - 1);
  const paeth = (left, up, corner) => {
    const p = left + up - corner,
      x = Math.abs(p - left),
      y = Math.abs(p - up),
      z = Math.abs(p - corner);
    return x <= y && x <= z ? left : y <= z ? up : corner;
  };
  const inflater = new Unzlib((chunk) => {
    if (count + chunk.length > expected) invalid();
    pixels.set(chunk, count);
    for (const value of chunk) {
      if (count % stride === 0 && value > 4) invalid();
      const index = (count % stride) - 1;
      if (index < 0) filter = value;
      else if (color === 3) {
        const left = index ? row[index - 1] : 0,
          up = previous[index],
          corner = index ? previous[index - 1] : 0;
        const predictor = [
          0,
          left,
          up,
          Math.floor((left + up) / 2),
          paeth(left, up, corner),
        ][filter];
        row[index] = (value + predictor) & 255;
        if (row[index] >= palette) invalid();
        if (index === row.length - 1) [row, previous] = [previous, row];
      }
      count++;
      a = (a + value) % 65521;
      b = (b + a) % 65521;
    }
  });
  // fflate retains unconsumed bytes in its stream buffer. Continuing to push
  // after the final DEFLATE block would repeatedly copy an arbitrary suffix.
  // Its streaming cursor points to the first byte after that block; when the
  // last push is final, Unzlib has already removed the four-byte Adler trailer.
  let complete = false;
  for (let i = 0; i < input.length; i += 64) {
    const end = Math.min(i + 64, input.length),
      final = end === input.length;
    inflater.push(input.subarray(i, end), final);
    if (inflater.s.f && !inflater.s.l) {
      const compressedEnd =
        end -
        (final ? 4 : 0) -
        inflater.p.length +
        Number(Boolean(inflater.s.p));
      if (compressedEnd !== input.length - 4) invalid();
      complete = true;
      break;
    }
  }
  if (
    !complete ||
    count !== expected ||
    input.length < 6 ||
    (b * 65536 + a) >>> 0 !==
      new DataView(input.buffer, input.byteOffset, input.length).getUint32(
        input.length - 4,
      )
  )
    invalid();
  // Rebuild one zlib stream from validated scanlines; no original IDAT bytes
  // survive, and extra compressed bytes were rejected above.
  const canonical = join([
    ...parts,
    pngChunk("IDAT", zlibSync(pixels, { level: 1 })),
    pngChunk("IEND", new Uint8Array()),
  ]);
  if (canonical.length > MAX_IMAGE_BYTES)
    throw new ImageFailure(
      413,
      "Normalized image exceeds 2 MiB. Choose a smaller image.",
    );
  return {
    bytes: canonical,
    width: w,
    height: h,
    type: "image/png",
    ext: "png",
  };
}
function orientationSegment(data) {
  // Retain only the camera orientation, never GPS, timestamps, device or thumbnail metadata.
  if (data.length < 14 || ascii(data.subarray(0, 6)) !== "Exif\0\0")
    return null;
  const tiff = new DataView(data.buffer, data.byteOffset + 6, data.length - 6),
    le = tiff.getUint16(0) === 0x4949;
  if (!le && tiff.getUint16(0) !== 0x4d4d) return null;
  if (tiff.getUint16(2, le) !== 42) return null;
  const start = tiff.getUint32(4, le);
  if (start + 2 > tiff.byteLength) return null;
  const count = tiff.getUint16(start, le);
  if (count > 64 || start + 2 + count * 12 > tiff.byteLength) return null;
  for (let i = 0; i < count; i++) {
    const at = start + 2 + i * 12;
    if (
      tiff.getUint16(at, le) !== 0x112 ||
      tiff.getUint16(at + 2, le) !== 3 ||
      tiff.getUint32(at + 4, le) !== 1
    )
      continue;
    const direction = tiff.getUint16(at + 8, le);
    if (direction < 1 || direction > 8) return null;
    return new Uint8Array([
      255,
      225,
      0,
      34,
      69,
      120,
      105,
      102,
      0,
      0,
      73,
      73,
      42,
      0,
      8,
      0,
      0,
      0,
      1,
      0,
      18,
      1,
      3,
      0,
      1,
      0,
      0,
      0,
      direction,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  }
  return null;
}
function jpg(bytes) {
  if (bytes.length < 4 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
    invalid();
  const parts = [bytes.slice(0, 2)];
  let pos = 2,
    scans = 0,
    adobe = false;
  while (pos < bytes.length) {
    const start = pos;
    if (bytes[pos++] !== 255) invalid();
    while (bytes[pos] === 255) pos++;
    const code = bytes[pos++];
    if (code === 217) {
      if (pos !== bytes.length || !scans) invalid();
      parts.push(bytes.slice(start, pos));
      break;
    }
    if (code === 216 || !code || pos + 2 > bytes.length) invalid();
    const len = (bytes[pos] << 8) | bytes[pos + 1],
      end = pos + len;
    if (len < 2 || end > bytes.length) invalid();
    if ([192, 193, 194].includes(code)) {
      if (len < 8) invalid();
      dimensions(
        (bytes[pos + 5] << 8) | bytes[pos + 6],
        (bytes[pos + 3] << 8) | bytes[pos + 4],
      );
    }
    if (code === 225) {
      const orientation = orientationSegment(bytes.subarray(pos + 2, end));
      if (orientation) parts.push(orientation);
    }
    if (code === 238 && adobeSegment(bytes.subarray(pos + 2, end))) {
      if (adobe) invalid();
      adobe = true;
      parts.push(bytes.slice(start, end));
    }
    if (!((code >= 224 && code <= 239) || code === 254))
      parts.push(bytes.slice(start, end));
    pos = end;
    if (code === 218) {
      scans++;
      const dataStart = pos;
      while (pos < bytes.length) {
        if (bytes[pos] !== 255) {
          pos++;
          continue;
        }
        let next = pos + 1;
        while (bytes[next] === 255) next++;
        if (bytes[next] === 0 || (bytes[next] >= 208 && bytes[next] <= 215)) {
          pos = next + 1;
          continue;
        }
        break;
      }
      parts.push(bytes.slice(dataStart, pos));
    }
  }
  const cleaned = join(parts);
  const result = jpeg.decode(cleaned, {
    useTArray: true,
    formatAsRGBA: false,
    tolerantDecoding: false,
    maxResolutionInMP: 4,
    maxMemoryUsageInMB: 48,
  });
  dimensions(result.width, result.height);
  return {
    bytes: cleaned,
    width: result.width,
    height: result.height,
    type: "image/jpeg",
    ext: "jpg",
  };
}
export async function validateImage(bytes) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new ImageFailure(413, "Choose an image up to 2 MiB.");
  try {
    if (bytes[0] === 255 && bytes[1] === 216) return jpg(bytes);
    if (ascii(bytes.subarray(0, 8)) === "\x89PNG\r\n\x1a\n") return png(bytes);
    if (
      ascii(bytes.subarray(0, 4)) === "RIFF" &&
      ascii(bytes.subarray(8, 12)) === "WEBP"
    )
      throw new ImageFailure(
        415,
        "WebP uploads are temporarily disabled. Choose JPEG or PNG.",
      );
    invalid();
  } catch (e) {
    if (e instanceof ImageFailure) throw e;
    invalid();
  }
}
