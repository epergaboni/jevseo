#!/usr/bin/env node
/**
 * Renders the app icon to PNG.
 *
 * Apple touch icons must be a raster format, so `apple-icon.svg` is ignored by
 * Next. Rather than depend on a converter that only exists on one platform
 * (sips is macOS, rsvg-convert needs a system package), this draws the shape
 * directly and writes the PNG with zlib, which ships with Node. Anyone can
 * regenerate it on any platform:
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const INK = [0x1f, 0x47, 0x88];
const PAPER = [0xfb, 0xfa, 0xf8];

/** Signed distance to a rounded rectangle; negative is inside. */
function roundedRectDistance(px, py, x, y, w, h, r) {
  const cx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const cy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const dx = Math.max(cx, 0);
  const dy = Math.max(cy, 0);
  return Math.min(Math.max(cx, cy), 0) + Math.hypot(dx, dy) - r;
}

/** 4x4 supersampling, so the rounded corners are not jagged. */
function coverage(px, py, shape) {
  const S = 4;
  let inside = 0;
  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      if (shape(px + (sx + 0.5) / S, py + (sy + 0.5) / S) < 0) inside++;
    }
  }
  return inside / (S * S);
}

function blend(dst, i, colour, alpha) {
  for (let c = 0; c < 3; c++) {
    dst[i + c] = Math.round(dst[i + c] * (1 - alpha) + colour[c] * alpha);
  }
  dst[i + 3] = Math.round(dst[i + 3] * (1 - alpha) + 255 * alpha);
}

function render(size, { padded }) {
  const rgba = new Uint8Array(size * size * 4);
  const u = size / 32;

  // The OS rounds an apple-touch-icon itself, so that variant is a full bleed
  // square; the browser favicon rounds its own corners.
  const background = padded
    ? (x, y) => roundedRectDistance(x, y, 0, 0, size, size, 0.001)
    : (x, y) => roundedRectDistance(x, y, 0, 0, size, size, 7 * u);

  const inset = padded ? 3 * u : 0;
  const bars = [
    { y: 8, w: 18, a: 1 },
    { y: 14, w: 12, a: 0.82 },
    { y: 20, w: 7, a: 0.64 },
  ];

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      const bg = coverage(px, py, background);
      if (bg > 0) blend(rgba, i, INK, bg);

      for (const bar of bars) {
        const w = bar.w * u - inset * 0.6;
        const h = 4 * u;
        const x = 7 * u + inset * 0.3;
        const y = bar.y * u + inset * 0.3;
        const cov = coverage(px, py, (sx, sy) =>
          roundedRectDistance(sx, sy, x, y, w, h, h / 2),
        );
        if (cov > 0) blend(rgba, i, PAPER, cov * bar.a);
      }
    }
  }
  return rgba;
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(rgba, size) {
  // Filter byte 0 (None) in front of every scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  { file: "src/app/apple-icon.png", size: 180, padded: true },
  { file: "public/icon-512.png", size: 512, padded: false },
];

for (const t of targets) {
  writeFileSync(t.file, toPng(render(t.size, { padded: t.padded }), t.size));
  console.log(`wrote ${t.file} (${t.size}x${t.size})`);
}
