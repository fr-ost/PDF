/**
 * Prepares user images for embedding in a PDF (runs in the worker).
 * JPEG/PNG are embedded as-is; WebP, GIF, BMP and AVIF are decoded by the
 * browser and re-encoded (PNG when transparency is present, otherwise
 * high-quality JPEG).
 */
import { PdfToolError } from '../errors';
import { readJpegHeader, readPngHeader, sniffImageFormat } from '../engines/imageFormats';
import type { EmbeddableImage } from '../engines/imagesToPdf';
import { encodeCanvas } from './browserImageCodec';

export const MAX_IMAGE_SIDE = 20000;
export const MAX_IMAGE_PIXELS = 150_000_000;

export interface RawImageInput {
  name: string;
  bytes: Uint8Array;
}

function checkDimensions(name: string, width: number, height: number): void {
  if (!(width > 0 && height > 0)) throw new PdfToolError('INVALID_INPUT', 'The image has no valid dimensions.', name);
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    throw new PdfToolError('TOO_LARGE', `The image is ${width}×${height} pixels; the maximum is ${MAX_IMAGE_SIDE} pixels per side and 150 megapixels.`, name);
  }
}

export async function reencodeImage(input: RawImageInput, mime: string): Promise<EmbeddableImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([input.bytes as BlobPart], { type: mime }), { imageOrientation: 'from-image' });
  } catch {
    throw new PdfToolError('INVALID_INPUT', 'This image could not be decoded. It may be damaged or use an unsupported format.', input.name);
  }
  try {
    checkDimensions(input.name, bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new PdfToolError('UNKNOWN', 'Canvas is not available.');
    ctx.drawImage(bitmap, 0, 0);
    let hasAlpha = false;
    const rowsPerChunk = Math.max(1, Math.floor(4_000_000 / bitmap.width));
    for (let y = 0; y < bitmap.height && !hasAlpha; y += rowsPerChunk) {
      const data = ctx.getImageData(0, y, bitmap.width, Math.min(rowsPerChunk, bitmap.height - y)).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i]! < 255) {
          hasAlpha = true;
          break;
        }
      }
    }
    const kind = hasAlpha ? 'png' : 'jpeg';
    const bytes = await encodeCanvas(canvas, hasAlpha ? 'image/png' : 'image/jpeg', hasAlpha ? undefined : 0.92);
    return { name: input.name, kind, bytes, width: bitmap.width, height: bitmap.height, orientation: 1 };
  } finally {
    bitmap.close();
  }
}

export async function prepareImage(input: RawImageInput): Promise<EmbeddableImage> {
  const format = sniffImageFormat(input.bytes);
  if (!format) throw new PdfToolError('INVALID_INPUT', 'This file is not a supported image (JPEG, PNG, WebP, GIF, BMP or AVIF).', input.name);
  if (format === 'jpeg') {
    const header = readJpegHeader(input.bytes);
    if (!header) throw new PdfToolError('INVALID_INPUT', 'This JPEG file appears to be damaged.', input.name);
    checkDimensions(input.name, header.width, header.height);
    return { name: input.name, kind: 'jpeg', bytes: input.bytes, ...header };
  }
  if (format === 'png') {
    const header = readPngHeader(input.bytes);
    if (!header) throw new PdfToolError('INVALID_INPUT', 'This PNG file appears to be damaged.', input.name);
    checkDimensions(input.name, header.width, header.height);
    return { name: input.name, kind: 'png', bytes: input.bytes, ...header };
  }
  const mime = { webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif' }[format];
  return reencodeImage(input, mime);
}
