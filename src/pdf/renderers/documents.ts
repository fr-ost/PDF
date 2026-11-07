/**
 * Registry of open PDF.js documents keyed by file id, so thumbnails and
 * previews share one parsed copy per file. Documents are destroyed when the
 * file is removed from the workspace to release memory.
 */
import { destroyPdfDocument, openPdfDocument, type PDFDocumentProxy } from './pdfjs';
import { evictThumbnails } from './thumbnails';

const registry = new Map<string, Promise<PDFDocumentProxy>>();

export function loadDocument(id: string, file: Blob, name: string, password?: string): Promise<PDFDocumentProxy> {
  const existing = registry.get(id);
  if (existing) {
    registry.delete(id);
    void existing.then(destroyPdfDocument, () => undefined);
  }
  const promise = file.arrayBuffer().then((buf) => openPdfDocument(new Uint8Array(buf), password, name));
  registry.set(id, promise);
  promise.catch(() => {
    if (registry.get(id) === promise) registry.delete(id);
  });
  return promise;
}

export function getDocumentProxy(id: string): Promise<PDFDocumentProxy> | undefined {
  return registry.get(id);
}

export function releaseDocument(id: string): void {
  const existing = registry.get(id);
  registry.delete(id);
  evictThumbnails(id);
  if (existing) void existing.then(destroyPdfDocument, () => undefined);
}
