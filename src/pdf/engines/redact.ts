/**
 * Secure redaction.
 *
 * Drawing a black box over text does NOT remove the text: it can still be
 * selected, copied or extracted. This engine therefore replaces every page
 * that contains a redaction with a flattened image of that page in which the
 * redacted areas have already been painted over (the image is produced by
 * the UI with PDF.js). The original page objects — text, fonts, vector
 * graphics, images and annotations — are removed from the file entirely by
 * the pruning pass.
 *
 * Optionally an invisible text layer is rebuilt from the page's original text
 * for text that lies completely OUTSIDE every redaction box, so the rest of
 * the page remains searchable. Text touching a redaction box is never kept.
 *
 * "Remove hidden information" additionally strips metadata, XMP, document
 * JavaScript, attachments, bookmarks, the structure tree (which can contain
 * alternate text) and application data, since any of these can repeat the
 * redacted content.
 */
import {
  PDFArray,
  PDFName,
  PDFNumber,
  PDFRef,
  TextRenderingMode,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  StandardFonts,
  popGraphicsState,
  pushGraphicsState,
  PDFDict,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { toWinAnsi } from '../winAnsi';
import type { ProgressFn } from './assemble';
import { stripMetadata } from './compress';
import { loadPdf, savePdf, type PdfSource } from './load';
import { pruneDocument } from './prune';

export interface RedactionTextItem {
  text: string;
  /** Baseline origin in y-up display space (points). */
  x: number;
  y: number;
  width: number;
  /** Font size (points). */
  height: number;
  /** Counter-clockwise angle in radians. */
  angle: number;
}

export interface RedactedPageInput {
  pageIndex: number;
  image: { kind: 'jpeg' | 'png'; bytes: Uint8Array };
  /** Displayed page size in points. */
  width: number;
  height: number;
  /** Text to keep searchable (already filtered to lie outside all boxes). */
  textItems: RedactionTextItem[];
}

export interface RedactOptions {
  removeHiddenInformation: boolean;
}

export function sanitizeDocument(doc: PDFDocument): void {
  stripMetadata(doc);
  const catalog = doc.catalog;
  for (const key of ['OpenAction', 'AA', 'Outlines', 'StructTreeRoot', 'MarkInfo', 'PieceInfo', 'Perms', 'SpiderInfo', 'Threads', 'Collection']) {
    catalog.delete(PDFName.of(key));
  }
  const pageMode = catalog.lookup(PDFName.of('PageMode'));
  if (pageMode === PDFName.of('UseOutlines') || pageMode === PDFName.of('UseAttachments')) catalog.delete(PDFName.of('PageMode'));
  const names = catalog.lookup(PDFName.of('Names'));
  if (names instanceof PDFDict) {
    names.delete(PDFName.of('JavaScript'));
    names.delete(PDFName.of('EmbeddedFiles'));
  }
  for (const page of doc.getPages()) {
    for (const key of ['AA', 'PieceInfo', 'Metadata', 'StructParents', 'Thumb']) page.node.delete(PDFName.of(key));
  }
}

function drawInvisibleText(page: PDFPage, font: PDFFont, fontKey: PDFName, items: RedactionTextItem[]): void {
  for (const item of items) {
    const text = toWinAnsi(item.text).replace(/\n/g, ' ');
    if (!text.trim() || !(item.height > 0) || !(item.width > 0)) continue;
    let natural: number;
    try {
      natural = font.widthOfTextAtSize(text, item.height);
    } catch {
      continue;
    }
    if (!(natural > 0)) continue;
    const k = Math.min(20, Math.max(0.05, item.width / natural));
    const c = Math.cos(item.angle);
    const s = Math.sin(item.angle);
    page.pushOperators(
      pushGraphicsState(),
      beginText(),
      setFontAndSize(fontKey, item.height),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setTextMatrix(c * k, s * k, -s, c, item.x, item.y),
      showText(font.encodeText(text)),
      endText(),
      popGraphicsState(),
    );
  }
}

export async function redactPdf(source: PdfSource, pages: RedactedPageInput[], options: RedactOptions, progress: ProgressFn = () => undefined): Promise<Uint8Array> {
  if (pages.length === 0) throw new PdfToolError('INVALID_INPUT', 'Mark at least one area to redact.');
  const { doc } = await loadPdf(source);
  const originalPages = doc.getPages().map((p) => p.ref);
  const pageCount = originalPages.length;
  const seen = new Set<number>();
  const removedAnnots: PDFRef[] = [];
  const remapPages: [PDFRef, PDFRef][] = [];
  let font: PDFFont | undefined;

  const sorted = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);
  for (let i = 0; i < sorted.length; i++) {
    const input = sorted[i]!;
    if (input.pageIndex < 0 || input.pageIndex >= pageCount || seen.has(input.pageIndex)) {
      throw new PdfToolError('INVALID_INPUT', `Invalid page ${input.pageIndex + 1} in redaction list.`);
    }
    seen.add(input.pageIndex);
    progress(i / sorted.length, `Flattening page ${input.pageIndex + 1}`);

    const image = input.image.kind === 'png' ? await doc.embedPng(input.image.bytes) : await doc.embedJpg(input.image.bytes);
    // Everything attached to the original page goes with it (form widgets with
    // their values, links, comments); the pruner is told explicitly because the
    // page object is deleted right away.
    const oldPage = doc.getPage(input.pageIndex);
    const annots = oldPage.node.lookup(PDFName.of('Annots'));
    if (annots instanceof PDFArray) {
      for (let k = 0; k < annots.size(); k++) {
        const a = annots.get(k);
        if (a instanceof PDFRef) removedAnnots.push(a);
      }
    }
    const newPage = doc.insertPage(input.pageIndex, [input.width, input.height]);
    // Don't inherit /Rotate or /CropBox from the page tree: the image already shows the page as displayed.
    newPage.node.set(PDFName.of('Rotate'), PDFNumber.of(0));
    newPage.node.set(PDFName.of('CropBox'), doc.context.obj([0, 0, input.width, input.height]));
    remapPages.push([oldPage.ref, newPage.ref]);
    doc.removePage(input.pageIndex + 1);
    newPage.drawImage(image, { x: 0, y: 0, width: input.width, height: input.height });
    if (input.textItems.length > 0) {
      font ??= await doc.embedFont(StandardFonts.Helvetica);
      const key = newPage.node.newFontDictionary('F', font.ref);
      drawInvisibleText(newPage, font, key, input.textItems);
    }
  }

  // XFA form data repeats every field value (including fields on redacted pages).
  const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
  if (acroForm instanceof PDFDict) acroForm.delete(PDFName.of('XFA'));
  doc.catalog.delete(PDFName.of('NeedsRendering'));
  if (options.removeHiddenInformation) sanitizeDocument(doc);
  // Links to a redacted page now lead to its flattened replacement; its old
  // structure elements (alt text, actual text) are dropped.
  pruneDocument(doc, { originalPages, removedAnnots, remapPages, replacedPagesAreGone: true });
  progress(0.95, 'Saving');
  return savePdf(doc, { stamp: !options.removeHiddenInformation });
}
