/** Text and image watermarks, positioned in display space. */
import { degrees, type PDFImage, type PDFPage } from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { FONT_ASCENT, toWinAnsi, type FontFamily } from '../winAnsi';
import type { ProgressFn } from './assemble';
import { FontCache, clamp, parseHexColor, sendNewContentToBack, withDisplaySpace } from './drawing';
import { loadPdf, savePdf, type PdfSource } from './load';
import { anchorCenters, originForCenter, type Anchor, type Size } from '../placement';
export { anchorCenters, originForCenter, rotatedHalfExtents, type Anchor } from '../placement';

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
