// The app's icons, drawn by code so the repo needs no image tools: the guide palette's dark ground with the accent
// ring (a kestrel's eye). Run once: node scripts/make-icons.ts. The PNGs are committed.
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

const BG: [number, number, number] = [0x0e, 0x13, 0x18];
const RING: [number, number, number] = [0x78, 0xbd, 0xe0];
for (const size of [192, 512]) {
  const c = size / 2;
  const r1 = size * 0.3;
  const r2 = size * 0.19;
  const icon = png(size, (x, y) => {
    const d = Math.hypot(x - c, y - c);
    return d < r1 && d > r2 ? RING : BG;
  });
  writeFileSync(`web/public/icons/icon-${size}.png`, icon);
  console.log(`icon-${size}.png: ${icon.length} bytes`);
}
