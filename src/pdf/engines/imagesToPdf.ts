/**
 * Images → PDF.
 *
 * JPEG and PNG files are embedded directly (JPEG data is not re-encoded, so
 * there is no generational quality loss). Other formats are converted to PNG
 * or JPEG by the caller before reaching this engine. EXIF orientation is
 * applied losslessly through the placement matrix.
 */
import {
  PDFDocument,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFImage,
} from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { PAPER_SIZES, type Matrix, type PaperSize } from './geometry';
import { orientationSwapsAxes } from './imageFormats';
import { savePdf } from './load';
import type { ProgressFn } from './assemble';

export interface EmbeddableImage {
  name: string;
  kind: 'jpeg' | 'png';
  bytes: Uint8Array;
  /** Stored pixel dimensions (before EXIF orientation). */
  width: number;
  height: number;
  orientation: number;
}

export interface ImagesToPdfOptions {
  pageSize: PaperSize | 'fit' | 'custom';
  /** Custom page size in points (portrait values). */
  customWidth?: number;
  customHeight?: number;
  orientation: 'auto' | 'portrait' | 'landscape';
  /** Margin on every side, in points. */
  margin: number;
  /** contain = scale to fit the page; original = 96 DPI size, shrunk only if needed. */
  fit: 'contain' | 'original';
}

export interface Placement {
  pageWidth: number;
  pageHeight: number;
  /** Displayed image rectangle (bottom-left origin). */
  x: number;
  y: number;
  width: number;
  height: number;
}

const PX_TO_PT = 0.75; // 96 DPI screen pixels to points
const MAX_PAGE_PT = 14400; // PDF implementation limit (200 inches)

export function computePlacement(image: { width: number; height: number; orientation: number }, options: ImagesToPdfOptions): Placement {
  const swap = orientationSwapsAxes(image.orientation);
  const dw = swap ? image.height : image.width;
  const dh = swap ? image.width : image.height;
  if (!(dw > 0 && dh > 0)) throw new PdfToolError('INVALID_INPUT', 'Image has invalid dimensions.');
  const margin = Math.max(0, options.margin);

  let pageWidth: number;
  let pageHeight: number;
  if (options.pageSize === 'fit') {
    let w = dw * PX_TO_PT;
    let h = dh * PX_TO_PT;
    const maxContent = MAX_PAGE_PT - 2 * margin;
    const shrink = Math.min(1, maxContent / w, maxContent / h);
    w *= shrink;
    h *= shrink;
    pageWidth = w + 2 * margin;
    pageHeight = h + 2 * margin;
  } else {
    const base =
      options.pageSize === 'custom'
        ? { width: options.customWidth ?? 595.28, height: options.customHeight ?? 841.89 }
        : PAPER_SIZES[options.pageSize];
    // Normalise to portrait, then rotate the sheet if landscape is wanted.
    let w = Math.min(base.width, base.height);
    let h = Math.max(base.width, base.height);
    const landscape = options.orientation === 'landscape' || (options.orientation === 'auto' && dw > dh);
    if (landscape) [w, h] = [h, w];
    pageWidth = w;
    pageHeight = h;
  }
  if (pageWidth < 3 || pageHeight < 3 || pageWidth > MAX_PAGE_PT || pageHeight > MAX_PAGE_PT) {
    throw new PdfToolError('INVALID_INPUT', 'The page size must be between 3 and 14,400 points.');
  }

  const boxW = pageWidth - 2 * margin;
  const boxH = pageHeight - 2 * margin;
  if (boxW <= 1 || boxH <= 1) throw new PdfToolError('INVALID_INPUT', 'The margins are larger than the page.');
  let scale = Math.min(boxW / dw, boxH / dh);
  if (options.fit === 'original') scale = Math.min(scale, PX_TO_PT);
  const width = dw * scale;
  const height = dh * scale;
  return { pageWidth, pageHeight, width, height, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2 };
}

/**
 * Matrix that maps the image's unit square to the target rectangle while
 * applying the EXIF orientation (values 1–8). Derived from the EXIF spec's
 * definition of where row 0 / column 0 of the stored image are displayed.
 */
export function orientationMatrix(orientation: number, x: number, y: number, w: number, h: number): Matrix {
  switch (orientation) {
    case 2:
      return [-w, 0, 0, h, x + w, y];
    case 3:
      return [-w, 0, 0, -h, x + w, y + h];
    case 4:
      return [w, 0, 0, -h, x, y + h];
    case 5:
      return [0, -h, -w, 0, x + w, y + h];
    case 6:
      return [0, -h, w, 0, x, y + h];
    case 7:
      return [0, h, w, 0, x, y];
    case 8:
      return [0, h, -w, 0, x + w, y];
    default:
      return [w, 0, 0, h, x, y];
  }
}

export async function imagesToPdf(images: EmbeddableImage[], options: ImagesToPdfOptions, progress: ProgressFn = () => undefined): Promise<Uint8Array> {
  if (images.length === 0) throw new PdfToolError('INVALID_INPUT', 'Add at least one image.');
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    progress(i / images.length, `Adding ${img.name}`);
    let embedded: PDFImage;
    try {
      embedded = img.kind === 'jpeg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes);
    } catch (err) {
      throw new PdfToolError('INVALID_INPUT', `This image could not be embedded (${err instanceof Error ? err.message : 'unknown error'}).`, img.name);
    }
    const placement = computePlacement({ width: embedded.width, height: embedded.height, orientation: img.orientation }, options);
    const page = doc.addPage([placement.pageWidth, placement.pageHeight]);
    const name = page.node.newXObject('Im', embedded.ref);
    const m = orientationMatrix(img.orientation, placement.x, placement.y, placement.width, placement.height);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m), drawObject(name), popGraphicsState());
  }
  progress(0.95, 'Saving');
  return savePdf(doc);
}

/** Builds a PDF where each page is a single full-bleed raster image. */
export interface RasterPage {
  kind: 'jpeg' | 'png';
  bytes: Uint8Array;
  /** Page size in points. */
  width: number;
  height: number;
}

export async function rasterPagesToPdf(pages: RasterPage[], progress: ProgressFn = () => undefined): Promise<Uint8Array> {
  if (pages.length === 0) throw new PdfToolError('INVALID_INPUT', 'No pages to write.');
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    const image = p.kind === 'jpeg' ? await doc.embedJpg(p.bytes) : await doc.embedPng(p.bytes);
    const page = doc.addPage([p.width, p.height]);
    page.drawImage(image, { x: 0, y: 0, width: p.width, height: p.height });
    progress((i + 1) / pages.length, `Page ${i + 1} of ${pages.length}`);
  }
  return savePdf(doc);
}
