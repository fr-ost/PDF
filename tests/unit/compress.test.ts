import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';
import { compressPdf, dedupeStreams, looksLikeGraphic, undoPredictor } from '../../src/pdf/engines/compress';
import { makeImagePdf, makeJpeg, makePhotoPixels, makeTextPdf, source } from '../helpers/fixtures';
import { nodeImageCodec } from '../helpers/nodeCodec';
import { extractText } from '../helpers/pdfjs';

describe('compressPdf', () => {
  it('shrinks oversized photos while keeping text searchable', async () => {
    const input = await makeImagePdf();
    const { bytes, report } = await compressPdf(source(input), { level: 'balanced', removeMetadata: false }, nodeImageCodec);
    expect(report.imagesFound).toBe(1);
    expect(report.imagesRecompressed).toBe(1);
    expect(bytes.length).toBeLessThan(input.length * 0.6);
    expect(report.outputSize).toBe(bytes.length);
    const text = await extractText(bytes);
    expect(text[0]).toContain('Searchable caption');
    expect(text[1]).toContain('Second page text');
    // Image was downsampled to ~150 DPI for an A4 page (11.69in × 150 ≈ 1754px).
    const doc = await PDFDocument.load(bytes);
    const image = doc.context.enumerateIndirectObjects().map(([, o]) => o).find((o) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) as PDFRawStream;
    const height = Number(image.dict.get(PDFName.of('Height'))!.toString());
    expect(height).toBeLessThanOrEqual(1760);
    expect(height).toBeGreaterThan(1600);
  });

  it('applies stronger settings for the high level', async () => {
    const input = await makeImagePdf();
    const balanced = await compressPdf(source(input), { level: 'balanced', removeMetadata: false }, nodeImageCodec);
    const high = await compressPdf(source(input), { level: 'high', removeMetadata: false }, nodeImageCodec);
    expect(high.bytes.length).toBeLessThan(balanced.bytes.length);
  });

  it('leaves images alone at the low level when they are within 300 DPI', async () => {
    const doc = await PDFDocument.create();
    const jpg = await doc.embedJpg(makeJpeg(600, 800, 90));
    doc.addPage([595, 842]).drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 });
    const input = await doc.save();
    const { report } = await compressPdf(source(input), { level: 'low', removeMetadata: false }, nodeImageCodec);
    expect(report.imagesRecompressed).toBe(0);
  });

  it('recompresses raw Flate photos with PNG predictors', async () => {
    const w = 900;
    const h = 900;
    const pixels = makePhotoPixels(w, h);
    // Encode with PNG "Sub" predictor (filter type 1) on every row.
    const rows = new Uint8Array(h * (w * 3 + 1));
    for (let y = 0; y < h; y++) {
      rows[y * (w * 3 + 1)] = 1;
      for (let i = 0; i < w * 3; i++) {
        const cur = pixels[y * w * 3 + i]!;
        const left = i >= 3 ? pixels[y * w * 3 + i - 3]! : 0;
        rows[y * (w * 3 + 1) + 1 + i] = (cur - left) & 0xff;
      }
    }
    const doc = await PDFDocument.create();
    const stream = doc.context.stream(zlibSync(rows), {
      Type: 'XObject', Subtype: 'Image', Width: w, Height: h, BitsPerComponent: 8, ColorSpace: 'DeviceRGB', Filter: 'FlateDecode',
      DecodeParms: { Predictor: 12, Colors: 3, Columns: w, BitsPerComponent: 8 },
    });
    const ref = doc.context.register(stream);
    const page = doc.addPage([300, 300]);
    const name = page.node.newXObject('Im', ref);
    const { pushGraphicsState, concatTransformationMatrix, drawObject, popGraphicsState } = await import('@cantoo/pdf-lib');
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(300, 0, 0, 300, 0, 0), drawObject(name), popGraphicsState());
    const input = await doc.save();
    const { bytes, report } = await compressPdf(source(input), { level: 'balanced', removeMetadata: false }, nodeImageCodec);
    expect(report.imagesRecompressed).toBe(1);
    expect(bytes.length).toBeLessThan(input.length * 0.5);
  });

  it('removes metadata when requested', async () => {
    const input = await makeTextPdf({ pages: 1, label: 'Private Title' });
    const { bytes } = await compressPdf(source(input), { level: 'low', removeMetadata: true }, nodeImageCodec);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getTitle()).toBeUndefined();
    expect(doc.getProducer()).toBeUndefined();
  });

  it('deduplicates identical streams', async () => {
    const doc = await PDFDocument.create();
    const data = makeJpeg(300, 300, 90);
    const a = await doc.embedJpg(data);
    const b = await doc.embedJpg(data);
    doc.addPage().drawImage(a, { x: 0, y: 0, width: 100, height: 100 });
    doc.addPage().drawImage(b, { x: 0, y: 0, width: 100, height: 100 });
    const loaded = await PDFDocument.load(await doc.save());
    expect(dedupeStreams(loaded)).toBe(1);
    const input = await doc.save();
    const { bytes, report } = await compressPdf(source(input), { level: 'low', removeMetadata: false }, nodeImageCodec);
    expect(report.duplicateStreamsRemoved).toBe(1);
    expect(bytes.length).toBeLessThan(input.length * 0.65);
  });

  it('never breaks plain text documents', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    for (let i = 0; i < 5; i++) doc.addPage().drawText(`Line ${i} `.repeat(30), { x: 20, y: 400, size: 8, font });
    const input = await doc.save({ useObjectStreams: false });
    const { bytes } = await compressPdf(source(input), { level: 'high', removeMetadata: false }, nodeImageCodec);
    expect((await extractText(bytes))[4]).toContain('Line 4');
  });
});

describe('compression helpers', () => {
  it('undoes PNG Up and Paeth predictors', () => {
    const encoded = new Uint8Array([2, 10, 20, 2, 5, 5, 4, 1, 1]);
    // Row 0 "Up" with no previous row = raw; row 1 "Up" adds previous; row 2 Paeth.
    const out = undoPredictor(encoded, 12, 1, 2)!;
    expect(Array.from(out)).toEqual([10, 20, 15, 25, 16, 26]);
  });
  it('detects flat-colour graphics vs photos', () => {
    const flat = new Uint8Array(100 * 100 * 3).fill(200);
    expect(looksLikeGraphic(flat, 3, 10000)).toBe(true);
    expect(looksLikeGraphic(makePhotoPixels(100, 100), 3, 10000)).toBe(false);
  });
});
