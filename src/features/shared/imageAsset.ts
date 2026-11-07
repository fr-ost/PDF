/** Loads a user-chosen image as PNG/JPEG bytes suitable for embedding. */
import { readJpegHeader, sniffImageFormat } from '../../pdf/engines/imageFormats';
import { PdfToolError } from '../../pdf/errors';

export interface ImageAsset {
  kind: 'png' | 'jpeg';
  bytes: Uint8Array;
  width: number;
  height: number;
  url: string;
}

export async function loadImageAsset(file: File, maxSide = 4000): Promise<ImageAsset> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffImageFormat(bytes);
  if (!format) throw new PdfToolError('INVALID_INPUT', 'Choose a JPEG, PNG, WebP, GIF or BMP image.', file.name);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), { imageOrientation: 'from-image' });
  } catch {
    throw new PdfToolError('INVALID_INPUT', 'This image could not be decoded.', file.name);
  }
  try {
    const { width, height } = bitmap;
    const needsResize = Math.max(width, height) > maxSide;
    const jpegUpright = format === 'jpeg' && (readJpegHeader(bytes)?.orientation ?? 1) === 1;
    if (!needsResize && (format === 'png' || jpegUpright)) {
      // Embed the original bytes untouched (no quality loss).
      const kind = format === 'png' ? 'png' : 'jpeg';
      return { kind, bytes, width, height, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: `image/${kind}` })) };
    }
    // Re-encode (also normalises JPEG EXIF orientation and exotic formats) as PNG.
    const scale = needsResize ? maxSide / Math.max(width, height) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const keepJpeg = format === 'jpeg';
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, keepJpeg ? 'image/jpeg' : 'image/png', keepJpeg ? 0.92 : undefined));
    if (!blob) throw new PdfToolError('OUT_OF_MEMORY', 'The image could not be processed.');
    return { kind: keepJpeg ? 'jpeg' : 'png', bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height, url: URL.createObjectURL(blob) };
  } finally {
    bitmap.close();
  }
}
