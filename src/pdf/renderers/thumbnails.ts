/**
 * Thumbnail rendering with an LRU cache of JPEG object URLs and a small
 * concurrency limit, so large documents render progressively without
 * blocking the interface.
 */
import type { PDFDocumentProxy } from './pdfjs';
import { canvasToBlob, releaseCanvas, renderPageToCanvas } from './render';

const MAX_ENTRIES = 600;
const MAX_CONCURRENT = 3;
const cache = new Map<string, string>(); // insertion order = LRU order
const pending = new Map<string, Promise<string>>();
let active = 0;
const queue: (() => void)[] = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(() => {
    active++;
    resolve();
  }));
}

function release(): void {
  active--;
  queue.shift()?.();
}

function remember(key: string, url: string): void {
  cache.set(key, url);
  while (cache.size > MAX_ENTRIES) {
    const [oldKey, oldUrl] = cache.entries().next().value as [string, string];
    cache.delete(oldKey);
    URL.revokeObjectURL(oldUrl);
  }
}

export function getCachedThumbnail(docId: string, pageIndex: number, width: number): string | undefined {
  const key = `${docId}:${pageIndex}:${width}`;
  const url = cache.get(key);
  if (url) {
    cache.delete(key);
    cache.set(key, url);
  }
  return url;
}

export function renderThumbnail(docId: string, doc: PDFDocumentProxy, pageIndex: number, width: number): Promise<string> {
  const key = `${docId}:${pageIndex}:${width}`;
  const cached = getCachedThumbnail(docId, pageIndex, width);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const job = (async () => {
    await acquire();
    try {
      const page = await doc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = (width * Math.min(2, globalThis.devicePixelRatio || 1)) / base.width;
      const { canvas } = await renderPageToCanvas(page, scale);
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
      releaseCanvas(canvas);
      page.cleanup();
      const url = URL.createObjectURL(blob);
      remember(key, url);
      return url;
    } finally {
      release();
      pending.delete(key);
    }
  })();
  pending.set(key, job);
  return job;
}

export function evictThumbnails(docId: string): void {
  for (const [key, url] of [...cache]) {
    if (key.startsWith(`${docId}:`)) {
      cache.delete(key);
      URL.revokeObjectURL(url);
    }
  }
}
