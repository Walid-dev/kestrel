// The app's icons, drawn by code so the repo needs no image tools: the wolf howling at the moon on kestrel's dark
// ground. Run once: node scripts/make-icons.ts. The PNGs are committed.
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
const VIOLET: [number, number, number] = [0xc0, 0x99, 0xff];
// the mark: a wolf howling at the moon, the same geometry as web/src/mark.tsx and favicon.svg (a 100-unit box);
// the wolf is one polygon filled by ray casting, sampled 3x3 per pixel so the edges stay smooth
const WOLF: [number, number][] = [
  [66, 2],
  [61, 10],
  [57, 13],
  [52, 24],
  [50, 40],
  [48, 56],
  [46, 84],
  [39, 84],
  [41, 64],
  [35, 65],
  [31, 84],
  [23, 84],
  [22, 74],
  [15, 66],
  [2, 72],
  [12, 58],
  [14, 49],
  [29, 40],
  [38, 32],
  [46, 24],
  [40, 16],
  [47, 14],
  [51, 8],
];
const MOON = { x: 80, y: 16, r: 8 };
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
    let moon = 0;
    for (let sx = 0; sx < 3; sx++)
      for (let sy = 0; sy < 3; sy++) {
        const px = (x + (sx + 0.5) / 3) / u;
        const py = (y + (sy + 0.5) / 3) / u;
        if (inPolygon(px, py, WOLF)) wolf++;
        else if (Math.hypot(px - MOON.x, py - MOON.y) < MOON.r) moon++;
      }
    return mix(mix(BG, VIOLET, moon / 9), PINK, wolf / 9);
  });
  writeFileSync(`web/public/icons/icon-${size}.png`, icon);
  console.log(`icon-${size}.png: ${icon.length} bytes`);
}
