// Draws the Stay In Touch mark and writes the PNG sizes the manifest needs.
// No native dependencies. Run with `node scripts/pwa-icons.mjs`.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "web/public");

const BLUE = [11, 92, 171, 255];
const WHITE = [255, 255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, sum]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inHeart(nx, ny) {
  const x = nx;
  const y = -ny * 0.95 + 0.15;
  return (x * x + y * y - 1) ** 3 - x * x * y * y * y <= 0;
}

function draw(size, { padding, background, opaque }) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size * (0.5 - padding);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5 - size / 2) / scale;
      const ny = (y + 0.5 - size / 2) / scale;
      const heart = inHeart(nx, ny);
      const color = heart ? WHITE : background;
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = heart || opaque ? 255 : 0;
    }
  }
  return png(size, size, pixels);
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Stay In Touch">
  <rect width="64" height="64" rx="14" fill="#0b5cab"/>
  <path fill="#ffffff" d="M32 50s-14-8.8-14-18a8 8 0 0 1 14-5 8 8 0 0 1 14 5c0 9.2-14 18-14 18z"/>
</svg>
`;

writeFileSync(path.join(outDir, "icon.svg"), svg);
writeFileSync(path.join(outDir, "pwa-192.png"), draw(192, { padding: 0.12, background: BLUE, opaque: true }));
writeFileSync(path.join(outDir, "pwa-512.png"), draw(512, { padding: 0.12, background: BLUE, opaque: true }));
writeFileSync(
  path.join(outDir, "maskable-512.png"),
  draw(512, { padding: 0.28, background: BLUE, opaque: true }),
);
writeFileSync(
  path.join(outDir, "apple-touch-icon.png"),
  draw(180, { padding: 0.14, background: BLUE, opaque: true }),
);
writeFileSync(
  path.join(outDir, "badge-96.png"),
  draw(96, { padding: 0.08, background: [0, 0, 0, 0], opaque: false }),
);
console.log("wrote PWA icons to web/public");
