/**
 * Synthetic test fixtures. Every PDF and image used by the tests is generated
 * here, so no third-party or private documents are needed.
 */
import { PDFDocument, PDFName, PDFNumber, StandardFonts, degrees, rgb, type PDFPage } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import type { PdfSource } from '../../src/pdf/engines/load';

export async function makeTextPdf(options: { pages?: number; sizes?: [number, number][]; label?: string; rotate?: number[] } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const count = options.sizes?.length ?? options.pages ?? 3;
  for (let i = 0; i < count; i++) {
    const size = options.sizes?.[i] ?? [595.28, 841.89];
    const page = doc.addPage(size);
    page.drawText(`${options.label ?? 'Page'} ${i + 1}`, { x: 50, y: size[1] - 80, size: 24, font });
    page.drawText(`Marker-${i + 1}`, { x: 50, y: 50, size: 12, font });
    if (options.rotate?.[i]) page.setRotation(degrees(options.rotate[i]!));
  }
  doc.setTitle(options.label ?? 'Fixture');
  return doc.save();
}

export function source(bytes: Uint8Array, name = 'fixture.pdf', password?: string): PdfSource {
  return password === undefined ? { bytes: bytes.slice(), name } : { bytes: bytes.slice(), name, password };
}

/** Noisy photographic-like image so JPEG/flat-colour heuristics behave realistically. */
export function makePhotoPixels(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 3);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      data[i] = Math.min(255, (x / width) * 200 + rand() * 55);
      data[i + 1] = Math.min(255, (y / height) * 200 + rand() * 55);
      data[i + 2] = Math.min(255, ((x + y) / (width + height)) * 200 + rand() * 55);
    }
  }
  return data;
}

export function makeJpeg(width: number, height: number, quality = 95, paint?: (ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>) => void): Uint8Array {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (paint) paint(ctx);
  else {
    const img = ctx.createImageData(width, height);
    const px = makePhotoPixels(width, height);
    for (let p = 0; p < width * height; p++) {
      img.data[p * 4] = px[p * 3]!;
      img.data[p * 4 + 1] = px[p * 3 + 1]!;
      img.data[p * 4 + 2] = px[p * 3 + 2]!;
      img.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  return new Uint8Array(canvas.encodeSync('jpeg', quality));
}

export function makePng(width: number, height: number, paint: (ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>) => void): Uint8Array {
  const canvas = createCanvas(width, height);
  paint(canvas.getContext('2d'));
  return new Uint8Array(canvas.encodeSync('png'));
}

/** Inserts an EXIF orientation tag into a JPEG (APP1 segment after SOI). */
export function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = payload.length + 2;
  const app1 = [0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload];
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(app1, 2);
  out.set(jpeg.subarray(2), 2 + app1.length);
  return out;
}

/** A PDF with a large high-resolution photo on page 1 and text on page 2. */
export async function makeImagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const jpg = await doc.embedJpg(makeJpeg(2400, 3200, 97));
  const p1 = doc.addPage([595.28, 841.89]);
  p1.drawImage(jpg, { x: 0, y: 0, width: 595.28, height: 841.89 });
  p1.drawText('Searchable caption', { x: 40, y: 40, size: 18, font, color: rgb(1, 1, 1) });
  const p2 = doc.addPage([595.28, 841.89]);
  p2.drawText('Second page text', { x: 40, y: 700, size: 18, font });
  return doc.save();
}

/** Rebuilds a flat page tree into a two-level tree with inherited MediaBox/Rotate. */
export async function makeNestedTreePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages: PDFPage[] = [];
  for (let i = 0; i < 4; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Nested ${i + 1}`, { x: 20, y: 350, size: 20, font });
    pages.push(page);
  }
  const ctx = doc.context;
  const rootRef = doc.catalog.get(PDFName.of('Pages'))!;
  const root = doc.catalog.Pages();
  const makeNode = (kids: PDFPage[]) => {
    const node = ctx.obj({ Type: 'Pages', Kids: kids.map((p) => p.ref), Count: kids.length, Parent: rootRef, MediaBox: [0, 0, 300, 400], Rotate: 90 });
    const ref = ctx.register(node);
    for (const p of kids) {
      p.node.set(PDFName.of('Parent'), ref);
      p.node.delete(PDFName.of('MediaBox'));
    }
    return ref;
  };
  const a = makeNode(pages.slice(0, 2));
  const b = makeNode(pages.slice(2));
  root.set(PDFName.of('Kids'), ctx.obj([a, b]));
  root.set(PDFName.of('Count'), PDFNumber.of(4));
  return doc.save({ useObjectStreams: false });
}
