/** ImageCodec implementation for Node tests, using @napi-rs/canvas. */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { CodecInput, ImageCodec } from '../../src/pdf/engines/compress';

export const nodeImageCodec: ImageCodec = {
  async toJpeg(input: CodecInput, width: number, height: number, quality: number) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (input.kind === 'jpeg') {
      const img = await loadImage(Buffer.from(input.bytes));
      ctx.drawImage(img, 0, 0, width, height);
    } else {
      const src = createCanvas(input.width, input.height);
      const sctx = src.getContext('2d');
      const data = sctx.createImageData(input.width, input.height);
      for (let p = 0; p < input.width * input.height; p++) {
        const v = input.components === 3 ? [input.data[p * 3]!, input.data[p * 3 + 1]!, input.data[p * 3 + 2]!] : [input.data[p]!, input.data[p]!, input.data[p]!];
        data.data.set([...v, 255], p * 4);
      }
      sctx.putImageData(data, 0, 0);
      ctx.drawImage(src, 0, 0, width, height);
    }
    return new Uint8Array(canvas.encodeSync('jpeg', Math.round(quality * 100)));
  },
};
