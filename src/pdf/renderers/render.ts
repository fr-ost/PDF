/** Page rendering helpers (main thread; PDF.js parses in its own worker). */
import { PdfToolError } from '../errors';
import { AnnotationMode, type PDFPageProxy } from './pdfjs';

/** Chrome's practical canvas limits. */
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_PIXELS = 100_000_000;

export interface RenderedCanvas {
  canvas: HTMLCanvasElement;
  scale: number;
  width: number;
  height: number;
}

/** Clamps a desired scale so the canvas stays within browser limits. */
export function safeScale(page: PDFPageProxy, desired: number): { scale: number; clamped: boolean } {
  const vp = page.getViewport({ scale: 1 });
  let scale = desired;
  const maxBySide = MAX_CANVAS_SIDE / Math.max(vp.width, vp.height);
  const maxByArea = Math.sqrt(MAX_CANVAS_PIXELS / (vp.width * vp.height));
  const limit = Math.min(maxBySide, maxByArea);
  const clamped = scale > limit;
  if (clamped) scale = limit;
  return { scale, clamped };
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  scale: number,
  options: { canvas?: HTMLCanvasElement; background?: string; signal?: AbortSignal; extraRotation?: number } = {},
): Promise<RenderedCanvas> {
  const viewport = page.getViewport({ scale, rotation: (page.rotate + (options.extraRotation ?? 0)) % 360 });
  const canvas = options.canvas ?? document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new PdfToolError('OUT_OF_MEMORY', 'Could not allocate a drawing surface for this page.');
  ctx.fillStyle = options.background ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas: null, canvasContext: ctx, viewport, annotationMode: AnnotationMode.ENABLE });
  const abort = () => task.cancel();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    await task.promise;
  } catch (err) {
    if ((err as { name?: string })?.name === 'RenderingCancelledException') throw new PdfToolError('CANCELLED', 'Rendering was cancelled.');
    throw err;
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
  return { canvas, scale, width: canvas.width, height: canvas.height };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PdfToolError('OUT_OF_MEMORY', 'The page image could not be encoded.'))), type, quality);
  });
}

/** Frees the canvas backing store immediately instead of waiting for GC. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
