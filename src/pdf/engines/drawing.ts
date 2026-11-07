/** Shared drawing helpers for tools that add content to existing pages. */
import {
  PDFArray,
  PDFName,
  PDFRef,
  StandardFonts,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  type RGB,
} from '@cantoo/pdf-lib';
import type { FontFamily } from '../winAnsi';
import { displayToUserMatrix, getPageGeometry, type PageGeometry } from './geometry';

/** Runs `draw` with the page's coordinate system set to y-up display space. */
export function withDisplaySpace(page: PDFPage, draw: (g: PageGeometry) => void): void {
  const g = getPageGeometry(page);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...displayToUserMatrix(g)));
  draw(g);
  page.pushOperators(popGraphicsState());
}

const FONT_VARIANTS: Record<FontFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

export class FontCache {
  private readonly cache = new Map<string, Promise<PDFFont>>();
  constructor(private readonly doc: PDFDocument) {}

  get(family: FontFamily, bold = false, italic = false): Promise<PDFFont> {
    const variants = FONT_VARIANTS[family] ?? FONT_VARIANTS.Helvetica;
    const name: StandardFonts = variants[(bold ? 1 : 0) + (italic ? 2 : 0)] ?? StandardFonts.Helvetica;
    let font = this.cache.get(name);
    if (!font) {
      font = this.doc.embedFont(name);
      this.cache.set(name, font);
    }
    return font;
  }
}

export function parseHexColor(hex: string, fallback: RGB = rgb(0, 0, 0)): RGB {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Moves the content stream that pdf-lib created for this page to the start
 * of /Contents so that newly drawn content sits *behind* existing content.
 */
export function sendNewContentToBack(page: PDFPage): void {
  const internal = page as unknown as { contentStreamRef?: PDFRef };
  const ref = internal.contentStreamRef;
  if (!(ref instanceof PDFRef)) return;
  const contents = page.node.normalizedEntries().Contents;
  if (!(contents instanceof PDFArray)) return;
  for (let i = contents.size() - 1; i >= 0; i--) {
    const item = contents.get(i);
    if (item instanceof PDFRef && item.objectNumber === ref.objectNumber && item.generationNumber === ref.generationNumber) {
      contents.remove(i);
      contents.insert(0, ref);
      page.node.set(PDFName.of('Contents'), contents);
      return;
    }
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
