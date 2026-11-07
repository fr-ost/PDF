// Generates the extension's toolbar/store icons. The artwork is a neutral
// product glyph (a document on a blue tile), deliberately NOT a company logo:
// the official Unique Labs identity can replace public/icons/* later.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size / 128;
  // Tile
  roundRect(ctx, 4 * s, 4 * s, 120 * s, 120 * s, 28 * s);
  ctx.fillStyle = '#2563EB';
  ctx.fill();
  // Document with folded corner
  const x = 34 * s, y = 22 * s, w = 60 * s, h = 84 * s, fold = 18 * s;
  ctx.beginPath();
  ctx.moveTo(x + 6 * s, y);
  ctx.lineTo(x + w - fold, y);
  ctx.lineTo(x + w, y + fold);
  ctx.lineTo(x + w, y + h - 6 * s);
  ctx.quadraticCurveTo(x + w, y + h, x + w - 6 * s, y + h);
  ctx.lineTo(x + 6 * s, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - 6 * s);
  ctx.lineTo(x, y + 6 * s);
  ctx.quadraticCurveTo(x, y, x + 6 * s, y);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  // Fold
  ctx.beginPath();
  ctx.moveTo(x + w - fold, y);
  ctx.lineTo(x + w - fold, y + fold - 4 * s);
  ctx.quadraticCurveTo(x + w - fold, y + fold, x + w - fold + 4 * s, y + fold);
  ctx.lineTo(x + w, y + fold);
  ctx.closePath();
  ctx.fillStyle = '#BFDBFE';
  ctx.fill();
  // Text lines (omitted at 16px where they would blur)
  if (size >= 32) {
    ctx.fillStyle = '#2563EB';
    const lw = Math.max(1, 6 * s);
    const lines = [[x + 12 * s, y + 38 * s, 36 * s], [x + 12 * s, y + 52 * s, 36 * s], [x + 12 * s, y + 66 * s, 24 * s]];
    for (const [lx, ly, len] of lines) {
      roundRect(ctx, lx, ly, len, lw, lw / 2);
      ctx.fill();
    }
  }
  return canvas.toBuffer('image/png');
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `icon-${size}.png`), draw(size));
}
// Store listing tile source (not part of the extension bundle).
mkdirSync(join(root, 'store-assets'), { recursive: true });
writeFileSync(join(root, 'store-assets', 'icon-512.png'), draw(512));
console.log('Icons written to public/icons');
