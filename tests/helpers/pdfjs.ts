/** PDF.js (Node build) helpers used to verify engine output independently of pdf-lib. */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../node_modules/pdfjs-dist');

export async function openWithPdfjs(bytes: Uint8Array, password?: string) {
  return pdfjs.getDocument({
    data: bytes.slice(),
    password,
    standardFontDataUrl: `${root}/standard_fonts/`,
    cMapUrl: `${root}/cmaps/`,
    wasmUrl: `${root}/wasm/`,
    verbosity: 0,
  }).promise;
}

export async function extractText(bytes: Uint8Array, password?: string): Promise<string[]> {
  const doc = await openWithPdfjs(bytes, password);
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  await doc.loadingTask.destroy();
  return out;
}

export async function pageInfo(bytes: Uint8Array): Promise<{ width: number; height: number; rotation: number }[]> {
  const doc = await openWithPdfjs(bytes);
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    out.push({ width: Math.round(vp.width), height: Math.round(vp.height), rotation: page.rotate });
  }
  await doc.loadingTask.destroy();
  return out;
}

/** Renders a page and returns a pixel sampler (display coordinates, y-down, points). */
export async function renderPage(bytes: Uint8Array, pageNumber = 1, scale = 1) {
  const doc = await openWithPdfjs(bytes);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  await doc.loadingTask.destroy();
  return {
    width: canvas.width,
    height: canvas.height,
    pixel(x: number, y: number): [number, number, number] {
      const px = Math.min(canvas.width - 1, Math.max(0, Math.round(x * scale)));
      const py = Math.min(canvas.height - 1, Math.max(0, Math.round(y * scale)));
      const i = (py * canvas.width + px) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    },
  };
}
