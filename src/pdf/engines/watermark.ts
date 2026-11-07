/** Text and image watermarks, positioned in display space. */
import { degrees, type PDFImage, type PDFPage } from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { FONT_ASCENT, toWinAnsi, type FontFamily } from '../winAnsi';
import type { ProgressFn } from './assemble';
import { FontCache, clamp, parseHexColor, sendNewContentToBack, withDisplaySpace } from './drawing';
import { loadPdf, savePdf, type PdfSource } from './load';

export type Anchor = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface WatermarkOptions {
  type: 'text' | 'image';
  text: string;
  font: FontFamily;
  bold: boolean;
  italic: boolean;
  fontSize: number;
  color: string;
  image?: { kind: 'png' | 'jpeg'; bytes: Uint8Array };
  /** Image width as a fraction of the page width. */
  imageScale: number;
  opacity: number;
  /** Counter-clockwise rotation in degrees. */
  rotation: number;
  position: Anchor | 'tile';
  layer: 'over' | 'under';
  /** Distance from the page edges, in points. */
  margin: number;
  /** 0-based page indices to watermark. */
  pages: number[];
}

interface Size {
  w: number;
  h: number;
}

export function rotatedHalfExtents({ w, h }: Size, rotationDeg: number): { ex: number; ey: number } {
  const t = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return { ex: (w / 2) * c + (h / 2) * s, ey: (w / 2) * s + (h / 2) * c };
}

export function anchorCenters(anchor: Anchor | 'tile', page: Size, item: Size, rotation: number, margin: number): [number, number][] {
  const { ex, ey } = rotatedHalfExtents(item, rotation);
  if (anchor === 'tile') {
    const gap = Math.max(36, Math.min(item.w, item.h) * 0.8);
    const sx = 2 * ex + gap;
    const sy = 2 * ey + gap;
    const centers: [number, number][] = [];
    let row = 0;
    for (let y = sy / 2; y < page.h + sy; y += sy, row++) {
      const offset = row % 2 === 0 ? 0 : sx / 2;
      for (let x = sx / 2 - offset; x < page.w + sx; x += sx) centers.push([x, y]);
      if (centers.length > 400) break;
    }
    return centers;
  }
  const [v, hz] = anchor === 'center' ? ['middle', 'center'] : (anchor.split('-') as [string, string]);
  const x = hz === 'left' ? margin + ex : hz === 'right' ? page.w - margin - ex : page.w / 2;
  const y = v === 'top' ? page.h - margin - ey : v === 'bottom' ? margin + ey : page.h / 2;
  return [[x, y]];
}

/** Origin (bottom-left of the unrotated box) so the box is centred on (cx, cy). */
export function originForCenter(cx: number, cy: number, { w, h }: Size, rotationDeg: number): [number, number] {
  const t = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [cx - ((w / 2) * c - (h / 2) * s), cy - ((w / 2) * s + (h / 2) * c)];
}

export async function addWatermark(source: PdfSource, options: WatermarkOptions, progress: ProgressFn = () => undefined): Promise<Uint8Array> {
  const { doc } = await loadPdf(source);
  const pages = doc.getPages();
  const targets = [...new Set(options.pages)].filter((i) => i >= 0 && i < pages.length);
  if (targets.length === 0) throw new PdfToolError('INVALID_INPUT', 'Select at least one page to watermark.');
  const opacity = clamp(options.opacity, 0.02, 1);

  const fonts = new FontCache(doc);
  let image: PDFImage | undefined;
  const text = toWinAnsi(options.text.replace(/\s*\n\s*/g, ' ')).trim();
  if (options.type === 'text') {
    if (!text) throw new PdfToolError('INVALID_INPUT', 'Enter the watermark text.');
  } else {
    if (!options.image) throw new PdfToolError('INVALID_INPUT', 'Choose an image for the watermark.');
    image = options.image.kind === 'png' ? await doc.embedPng(options.image.bytes) : await doc.embedJpg(options.image.bytes);
  }
  const font = await fonts.get(options.font, options.bold, options.italic);
  const color = parseHexColor(options.color);
  const size = clamp(options.fontSize, 4, 500);

  targets.forEach((index, n) => {
    const page: PDFPage = pages[index]!;
    withDisplaySpace(page, (g) => {
      let item: Size;
      if (image) {
        const w = g.width * clamp(options.imageScale, 0.02, 1);
        item = { w, h: (w * image.height) / image.width };
      } else {
        item = { w: font.widthOfTextAtSize(text, size), h: size * FONT_ASCENT[options.font] };
      }
      for (const [cx, cy] of anchorCenters(options.position, { w: g.width, h: g.height }, item, options.rotation, options.margin)) {
        const [x, y] = originForCenter(cx, cy, item, options.rotation);
        if (image) {
          page.drawImage(image, { x, y, width: item.w, height: item.h, rotate: degrees(options.rotation), opacity });
        } else {
          page.drawText(text, { x, y, size, font, color, opacity, rotate: degrees(options.rotation) });
        }
      }
    });
    if (options.layer === 'under') sendNewContentToBack(page);
    progress((n + 1) / targets.length, `Page ${n + 1} of ${targets.length}`);
  });
  return savePdf(doc);
}
