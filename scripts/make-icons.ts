// The app's icons, drawn by code so the repo needs no image tools: kestrel's warm graphite ground with the copper
// feather mark. Run once: node scripts/make-icons.ts. The PNGs are committed.
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

const BG: [number, number, number] = [0x13, 0x12, 0x10];
const COPPER: [number, number, number] = [0xd0, 0x8a, 0x4e];
// the mark: three tapered feathers, the same geometry as web/src/mark.tsx and favicon.svg (a 100-unit box),
// drawn as triangles with 3x3 supersampling so the edges stay smooth
const FEATHERS: [number, number][][] = [
  [
    [20.4, 66.9],
    [10.8, 55.5],
    [63.1, 21.3],
  ],
  [
    [35.0, 74.4],
    [26.6, 64.4],
    [67.6, 38.5],
  ],
  [
    [49.4, 81.8],
    [42.4, 73.4],
    [71.9, 55.7],
  ],
];
const side = (px: number, py: number, [ax, ay]: [number, number], [bx, by]: [number, number]) =>
  (bx - ax) * (py - ay) - (by - ay) * (px - ax);
function inTriangle(px: number, py: number, tri: [number, number][]): boolean {
  const [a, b, c] = tri;
  const s1 = side(px, py, a, b);
  const s2 = side(px, py, b, c);
  const s3 = side(px, py, c, a);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}
for (const size of [192, 512]) {
  const u = size / 100; // icon coordinates to the mark's 100-unit box
  const icon = png(size, (x, y) => {
    let hit = 0;
    for (let sx = 0; sx < 3; sx++)
      for (let sy = 0; sy < 3; sy++) {
        const px = (x + (sx + 0.5) / 3) / u;
        const py = (y + (sy + 0.5) / 3) / u;
        if (FEATHERS.some((f) => inTriangle(px, py, f))) hit++;
      }
    const k = hit / 9;
    return [
      Math.round(BG[0] + (COPPER[0] - BG[0]) * k),
      Math.round(BG[1] + (COPPER[1] - BG[1]) * k),
      Math.round(BG[2] + (COPPER[2] - BG[2]) * k),
    ];
  });
  writeFileSync(`web/public/icons/icon-${size}.png`, icon);
  console.log(`icon-${size}.png: ${icon.length} bytes`);
}
