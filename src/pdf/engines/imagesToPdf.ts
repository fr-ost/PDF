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

import { computePlacement, orientationMatrix, type ImagesToPdfOptions } from '../imageLayout';
export { computePlacement, orientationMatrix, type ImagesToPdfOptions, type Placement } from '../imageLayout';

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
