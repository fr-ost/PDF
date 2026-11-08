/**
 * PDF.js configuration for the extension. All runtime assets (worker, CMaps,
 * fonts, WebAssembly decoders) are bundled locally — nothing is fetched from
 * the network. Document scripting (JavaScript in PDFs) is never enabled, and
 * XFA forms are not rendered.
 */
import '../../polyfills/modern'; // first: evaluated before pdf.js
import {
  AnnotationMode,
  GlobalWorkerOptions,
  PasswordResponses,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist';
import workerSrc from './pdfjs.worker.ts?worker&url';
import { PdfToolError } from '../errors';

GlobalWorkerOptions.workerSrc = workerSrc;

const assetUrl = (path: string) => new URL(`/vendor/pdfjs/${path}`, globalThis.location?.href ?? 'http://localhost/').href;

export type { PDFDocumentProxy, PDFPageProxy };
export { AnnotationMode };

export async function openPdfDocument(data: Uint8Array, password?: string, fileName?: string): Promise<PDFDocumentProxy> {
  const task = getDocument({
    data,
    ...(password ? { password } : {}),
    cMapUrl: assetUrl('cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('standard_fonts/'),
    wasmUrl: assetUrl('wasm/'),
    iccUrl: assetUrl('iccs/'),
    enableXfa: false,
    stopAtErrors: false,
    verbosity: 0,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
  });
  try {
    return await task.promise;
  } catch (err) {
    void task.destroy();
    const e = err as { name?: string; code?: number; message?: string };
    if (e?.name === 'PasswordException') {
      if (e.code === PasswordResponses.INCORRECT_PASSWORD) throw new PdfToolError('WRONG_PASSWORD', 'The password is incorrect.', fileName);
      throw new PdfToolError('ENCRYPTED', 'This document requires a password to open.', fileName);
    }
    if (e?.name === 'InvalidPDFException') throw new PdfToolError('CORRUPT', 'The file structure is invalid.', fileName);
    throw new PdfToolError('CORRUPT', e?.message || 'The document could not be opened.', fileName);
  }
}

export async function destroyPdfDocument(doc: PDFDocumentProxy): Promise<void> {
  try {
    await doc.loadingTask.destroy();
  } catch {
    /* already destroyed */
  }
}
