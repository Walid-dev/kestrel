// The app's icons, drawn by code so the repo needs no image tools: the wolf's face on kestrel's dark ground. Run
// once: node scripts/make-icons.ts. The PNGs are committed.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = (crcTable[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

function png(size: number, draw: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = draw(x, y);
      const at = y * (size * 3 + 1) + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: rgb
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG: [number, number, number] = [0x11, 0x14, 0x1b];
const PINK: [number, number, number] = [0xff, 0x75, 0x7f];
// the mark: a wolf's face, the same geometry as web/src/mark.tsx and favicon.svg (a 100-unit box); one polygon
// filled by ray casting, the eyes cut back to the ground, sampled 3x3 per pixel so the edges stay smooth
const WOLF: [number, number][] = [
  [22, 4],
  [36, 15],
  [50, 15],
  [64, 15],
  [78, 4],
  [72, 20],
  [82, 30],
  [87, 42],
  [75, 50],
  [79, 61],
  [64, 75],
  [50, 87],
  [36, 75],
  [21, 61],
  [25, 50],
  [13, 42],
  [18, 30],
  [28, 20],
];
const EYES: [number, number][][] = [
  [
    [56, 36],
    [70, 33],
    [62, 44],
  ],
  [
    [44, 36],
    [30, 33],
    [38, 44],
  ],
];
function inPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const mix = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * k),
  Math.round(a[1] + (b[1] - a[1]) * k),
  Math.round(a[2] + (b[2] - a[2]) * k),
];
for (const size of [192, 512]) {
  const u = size / 100; // icon coordinates to the mark's 100-unit box
  const icon = png(size, (x, y) => {
    let wolf = 0;
    for (let sx = 0; sx < 3; sx++)
      for (let sy = 0; sy < 3; sy++) {
        const px = (x + (sx + 0.5) / 3) / u;
        const py = (y + (sy + 0.5) / 3) / u;
        if (inPolygon(px, py, WOLF) && !EYES.some((e) => inPolygon(px, py, e))) wolf++;
      }
    return mix(BG, PINK, wolf / 9);
  });
  writeFileSync(`web/public/icons/icon-${size}.png`, icon);
  console.log(`icon-${size}.png: ${icon.length} bytes`);
}
