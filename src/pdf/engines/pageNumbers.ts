/** Page numbering ("Page 3 of 10", custom prefixes, positions). */
import { PdfToolError } from '../errors';
import { FONT_ASCENT, FONT_DESCENT, toWinAnsi, type FontFamily } from '../winAnsi';
import type { ProgressFn } from './assemble';
import { FontCache, clamp, parseHexColor, withDisplaySpace } from './drawing';
import { loadPdf, savePdf, type PdfSource } from './load';

export type NumberPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type NumberFormat = 'n' | 'page-n' | 'n-of-total' | 'page-n-of-total';

export interface PageNumberOptions {
  position: NumberPosition;
  margin: number;
  startNumber: number;
  format: NumberFormat;
  prefix: string;
  suffix: string;
  font: FontFamily;
  bold: boolean;
  fontSize: number;
  color: string;
  /** 0-based indices of pages that receive a number, in document order. */
  pages: number[];
}

export function formatPageNumber(n: number, total: number, options: Pick<PageNumberOptions, 'format' | 'prefix' | 'suffix'>): string {
  const core =
    options.format === 'page-n' ? `Page ${n}` : options.format === 'n-of-total' ? `${n} of ${total}` : options.format === 'page-n-of-total' ? `Page ${n} of ${total}` : `${n}`;
  return `${options.prefix}${core}${options.suffix}`;
}

export async function addPageNumbers(source: PdfSource, options: PageNumberOptions, progress: ProgressFn = () => undefined): Promise<Uint8Array> {
  const { doc } = await loadPdf(source);
  const pages = doc.getPages();
  const targets = [...new Set(options.pages)].filter((i) => i >= 0 && i < pages.length).sort((a, b) => a - b);
  if (targets.length === 0) throw new PdfToolError('INVALID_INPUT', 'Select at least one page to number.');
  if (!Number.isInteger(options.startNumber) || options.startNumber < 0 || options.startNumber > 1_000_000) {
    throw new PdfToolError('INVALID_INPUT', 'The starting number must be a whole number between 0 and 1,000,000.');
  }
  const fonts = new FontCache(doc);
  const font = await fonts.get(options.font, options.bold, false);
  const color = parseHexColor(options.color);
  const size = clamp(options.fontSize, 4, 96);
  const margin = clamp(options.margin, 0, 200);
  const total = options.startNumber + targets.length - 1;
  const [vertical, horizontal] = options.position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];

  targets.forEach((index, n) => {
    const label = toWinAnsi(formatPageNumber(options.startNumber + n, total, options));
    const page = pages[index]!;
    withDisplaySpace(page, (g) => {
      const width = font.widthOfTextAtSize(label, size);
      const x = horizontal === 'left' ? margin : horizontal === 'right' ? g.width - margin - width : (g.width - width) / 2;
      const y = vertical === 'top' ? g.height - margin - size * FONT_ASCENT[options.font] : margin + size * FONT_DESCENT[options.font];
      page.drawText(label, { x, y, size, font, color });
    });
    progress((n + 1) / targets.length);
  });
  return savePdf(doc);
}
