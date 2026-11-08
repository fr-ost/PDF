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
/** Callers still waiting for each key (thumbnails that are mounted). */
const interest = new Map<string, number>();
let active = 0;

interface Waiter {
  start: () => void;
  drop: () => void;
  wanted: () => boolean;
}
const queue: Waiter[] = [];

function acquire(wanted: () => boolean): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) =>
    queue.push({
      start: () => {
        active++;
        resolve();
      },
      drop: () => reject(new DOMException('Thumbnail no longer needed', 'AbortError')),
      wanted,
    }),
  );
}

function release(): void {
  active--;
  // Newest requests first: after fast scrolling they are the ones on screen.
  // Requests nobody waits for any more are dropped.
  while (queue.length) {
    const next = queue.pop()!;
    if (next.wanted()) return next.start();
    next.drop();
  }
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

export function renderThumbnail(docId: string, doc: PDFDocumentProxy, pageIndex: number, width: number, signal?: AbortSignal): Promise<string> {
  const key = `${docId}:${pageIndex}:${width}`;
  const cached = getCachedThumbnail(docId, pageIndex, width);
  if (cached) return Promise.resolve(cached);
  if (signal) {
    if (signal.aborted) return Promise.reject(new DOMException('Thumbnail no longer needed', 'AbortError'));
    interest.set(key, (interest.get(key) ?? 0) + 1);
    signal.addEventListener('abort', () => interest.set(key, (interest.get(key) ?? 1) - 1), { once: true });
  } else {
    interest.set(key, Number.POSITIVE_INFINITY); // no way to cancel: always wanted
  }
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const job = (async () => {
    try {
      await acquire(() => (interest.get(key) ?? 0) > 0);
    } catch (err) {
      // Dropped before it started: forget it so a later request starts afresh.
      pending.delete(key);
      interest.delete(key);
      throw err;
    }
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
      interest.delete(key);
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
