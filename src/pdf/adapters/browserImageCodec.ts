/**
 * Image decoding/encoding using browser primitives that are available inside
 * Web Workers (createImageBitmap + OffscreenCanvas). Colour values are passed
 * through untouched (`colorSpaceConversion: 'none'`) so recompressed images
 * keep the colour space declared in the PDF.
 */
import type { CodecInput, ImageCodec } from '../engines/compress';

function toRgba(data: Uint8Array, width: number, height: number, components: 1 | 3): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, s = 0, d = 0; p < width * height; p++, d += 4) {
    if (components === 3) {
      out[d] = data[s]!;
      out[d + 1] = data[s + 1]!;
      out[d + 2] = data[s + 2]!;
      s += 3;
    } else {
      const v = data[s++]!;
      out[d] = v;
      out[d + 1] = v;
      out[d + 2] = v;
    }
    out[d + 3] = 255;
  }
  return out;
}

export async function encodeCanvas(canvas: OffscreenCanvas, type: 'image/jpeg' | 'image/png', quality?: number): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob(quality === undefined ? { type } : { type, quality });
  return new Uint8Array(await blob.arrayBuffer());
}

export const browserImageCodec: ImageCodec = {
  async toJpeg(input: CodecInput, width: number, height: number, quality: number): Promise<Uint8Array | null> {
    let bitmap: ImageBitmap;
    const options: ImageBitmapOptions = { colorSpaceConversion: 'none', premultiplyAlpha: 'none', resizeWidth: width, resizeHeight: height, resizeQuality: 'high' };
    try {
      if (input.kind === 'jpeg') {
        bitmap = await createImageBitmap(new Blob([input.bytes as BlobPart], { type: 'image/jpeg' }), options);
      } else {
        const imageData = new ImageData(toRgba(input.data, input.width, input.height, input.components), input.width, input.height);
        bitmap = await createImageBitmap(imageData, options);
      }
    } catch {
      return null;
    }
    try {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      return await encodeCanvas(canvas, 'image/jpeg', quality);
    } finally {
      bitmap.close();
    }
  },
};
