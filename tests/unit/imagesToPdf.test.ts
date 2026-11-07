import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { computePlacement, imagesToPdf, orientationMatrix } from '../../src/pdf/engines/imagesToPdf';
import { readJpegHeader, readPngHeader, sniffImageFormat } from '../../src/pdf/engines/imageFormats';
import { makeJpeg, makePng, withExifOrientation } from '../helpers/fixtures';
import { pageInfo, renderPage } from '../helpers/pdfjs';

/** 200×100 JPEG whose top-left quadrant is red and the rest blue. */
function markerJpeg(): Uint8Array {
  return makeJpeg(200, 100, 95, (ctx) => {
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, 200, 100);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 100, 50);
  });
}

describe('image format detection', () => {
  it('detects formats from bytes and reads headers', () => {
    const jpg = markerJpeg();
    const png = makePng(30, 20, (ctx) => ctx.fillRect(0, 0, 30, 20));
    expect(sniffImageFormat(jpg)).toBe('jpeg');
    expect(sniffImageFormat(png)).toBe('png');
    expect(sniffImageFormat(new TextEncoder().encode('%PDF-1.7 not an image'))).toBeNull();
    expect(readJpegHeader(jpg)).toEqual({ width: 200, height: 100, orientation: 1 });
    expect(readPngHeader(png)).toEqual({ width: 30, height: 20, orientation: 1 });
    expect(readJpegHeader(withExifOrientation(jpg, 6))?.orientation).toBe(6);
  });
});

describe('computePlacement', () => {
  const base = { margin: 0, fit: 'contain' as const, orientation: 'auto' as const };
  it('fits a landscape image on an automatically rotated A4 sheet', () => {
    const p = computePlacement({ width: 2000, height: 1000, orientation: 1 }, { ...base, pageSize: 'a4' });
    expect(p.pageWidth).toBeGreaterThan(p.pageHeight);
    expect(p.width / p.height).toBeCloseTo(2, 5);
    expect(p.width).toBeCloseTo(841.89, 1);
  });
  it('respects margins and centres the image', () => {
    const p = computePlacement({ width: 100, height: 100, orientation: 1 }, { ...base, pageSize: 'letter', orientation: 'portrait', margin: 36 });
    expect(p.width).toBeCloseTo(612 - 72, 5);
    expect(p.y).toBeCloseTo((792 - p.height) / 2, 5);
  });
  it('keeps small images at their natural size in "original" mode', () => {
    const p = computePlacement({ width: 96, height: 96, orientation: 1 }, { ...base, pageSize: 'a4', fit: 'original' });
    expect(p.width).toBeCloseTo(72, 5);
  });
  it('sizes the page to the image in "fit" mode and swaps axes for rotated EXIF', () => {
    const p = computePlacement({ width: 400, height: 200, orientation: 6 }, { ...base, pageSize: 'fit' });
    expect(p.pageWidth).toBeCloseTo(150, 5);
    expect(p.pageHeight).toBeCloseTo(300, 5);
  });
  it('rejects margins that leave no room', () => {
    expect(() => computePlacement({ width: 10, height: 10, orientation: 1 }, { ...base, pageSize: 'a5', margin: 400 })).toThrow();
  });
  it('produces unit-square matrices for all EXIF orientations', () => {
    for (let o = 1; o <= 8; o++) {
      const m = orientationMatrix(o, 10, 20, 100, 50);
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [m[0] * u! + m[2] * v! + m[4], m[1] * u! + m[3] * v! + m[5]]);
      const xs = corners.map((c) => c[0]!);
      const ys = corners.map((c) => c[1]!);
      expect(Math.min(...xs)).toBeCloseTo(10);
      expect(Math.max(...xs)).toBeCloseTo(110);
      expect(Math.min(...ys)).toBeCloseTo(20);
      expect(Math.max(...ys)).toBeCloseTo(70);
    }
  });
});

describe('imagesToPdf', () => {
  const options = { pageSize: 'fit' as const, orientation: 'auto' as const, margin: 0, fit: 'contain' as const };

  it('embeds JPEG data without re-encoding it', async () => {
    const jpg = markerJpeg();
    const out = await imagesToPdf([{ name: 'a.jpg', kind: 'jpeg', bytes: jpg, width: 200, height: 100, orientation: 1 }], options);
    const doc = await PDFDocument.load(out);
    const streams = doc.context.enumerateIndirectObjects().map(([, o]) => o).filter((o) => 'contents' in o) as unknown as { contents: Uint8Array }[];
    expect(streams.some((s) => s.contents.length === jpg.length)).toBe(true);
    expect(await pageInfo(out)).toEqual([{ width: 150, height: 75, rotation: 0 }]);
  });

  it('applies EXIF orientation 6 (rotate 90° clockwise) so red ends up top-right', async () => {
    const jpg = withExifOrientation(markerJpeg(), 6);
    const out = await imagesToPdf([{ name: 'r.jpg', kind: 'jpeg', bytes: jpg, width: 200, height: 100, orientation: 6 }], options);
    const page = await renderPage(out);
    expect(page.width).toBe(75);
    expect(page.height).toBe(150);
    const topRight = page.pixel(60, 20);
    const bottomLeft = page.pixel(15, 130);
    expect(topRight[0]).toBeGreaterThan(200);
    expect(topRight[2]).toBeLessThan(60);
    expect(bottomLeft[2]).toBeGreaterThan(200);
  });

  it('applies EXIF orientation 3 (180°) so red ends up bottom-right', async () => {
    const jpg = withExifOrientation(markerJpeg(), 3);
    const out = await imagesToPdf([{ name: 'r.jpg', kind: 'jpeg', bytes: jpg, width: 200, height: 100, orientation: 3 }], options);
    const page = await renderPage(out);
    expect(page.pixel(130, 60)[0]).toBeGreaterThan(200);
    expect(page.pixel(20, 15)[2]).toBeGreaterThan(200);
  });

  it('embeds PNG with transparency', async () => {
    const png = makePng(40, 40, (ctx) => {
      ctx.fillStyle = 'rgba(0,128,0,0.5)';
      ctx.fillRect(0, 0, 40, 40);
    });
    const out = await imagesToPdf([{ name: 'a.png', kind: 'png', bytes: png, width: 40, height: 40, orientation: 1 }], { ...options, pageSize: 'a4' });
    expect((await pageInfo(out))[0]!.width).toBe(595);
    const doc = await PDFDocument.load(out);
    const hasSMask = doc.context.enumerateIndirectObjects().some(([, o]) => o.toString().includes('/SMask'));
    expect(hasSMask).toBe(true);
  });

  it('creates one page per image in order', async () => {
    const a = markerJpeg();
    const out = await imagesToPdf(
      [
        { name: '1.jpg', kind: 'jpeg', bytes: a, width: 200, height: 100, orientation: 1 },
        { name: '2.png', kind: 'png', bytes: makePng(10, 30, (c) => c.fillRect(0, 0, 10, 30)), width: 10, height: 30, orientation: 1 },
      ],
      { ...options, pageSize: 'letter' },
    );
    const info = await pageInfo(out);
    expect(info).toHaveLength(2);
    expect(info[0]!.width).toBe(792);
    expect(info[1]!.width).toBe(612);
  });

  it('reports a clear error for corrupt image data', async () => {
    await expect(
      imagesToPdf([{ name: 'bad.jpg', kind: 'jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), width: 10, height: 10, orientation: 1 }], options),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', fileName: 'bad.jpg' });
    await expect(imagesToPdf([], options)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
