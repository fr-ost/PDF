import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { hasPdfHeader, loadPdf } from '../../src/pdf/engines/load';
import { assembleNew } from '../../src/pdf/engines/assemble';
import { describeError, PdfToolError, serializeError } from '../../src/pdf/errors';
import { createZip, uniqueNames } from '../../src/services/zip-service/zip';
import { unzipSync } from 'fflate';
import { makeTextPdf, source } from '../helpers/fixtures';
import { extractText } from '../helpers/pdfjs';

describe('malformed and hostile input', () => {
  it('rejects empty files and non-PDF data', async () => {
    await expect(loadPdf(source(new Uint8Array(), 'empty.pdf'))).rejects.toMatchObject({ code: 'CORRUPT' });
    await expect(loadPdf(source(new TextEncoder().encode('<html><script>alert(1)</script></html>'), 'page.pdf'))).rejects.toMatchObject({ code: 'NOT_PDF' });
    await expect(loadPdf(source(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6]), 'image.pdf'))).rejects.toMatchObject({ code: 'NOT_PDF' });
  });

  it('accepts a PDF header after leading junk (as viewers do)', () => {
    const bytes = new TextEncoder().encode('JUNK\n%PDF-1.4\n');
    expect(hasPdfHeader(bytes)).toBe(true);
  });

  it('rejects random bytes behind a PDF header', async () => {
    const junk = new Uint8Array(4096);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 7919) % 251;
    junk.set(new TextEncoder().encode('%PDF-1.7\n'), 0);
    await expect(loadPdf(source(junk, 'junk.pdf'))).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('recovers or fails cleanly on truncated files', async () => {
    const full = await makeTextPdf({ pages: 3 });
    for (const fraction of [0.95, 0.7, 0.4, 0.1]) {
      const truncated = full.slice(0, Math.floor(full.length * fraction));
      try {
        const { doc } = await loadPdf(source(truncated, 'cut.pdf'));
        expect(doc.getPageCount()).toBeGreaterThan(0);
      } catch (err) {
        expect(err).toBeInstanceOf(PdfToolError);
        expect(['CORRUPT', 'NOT_PDF']).toContain((err as PdfToolError).code);
      }
    }
  });

  it('never executes or preserves document JavaScript when building new files', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const js = doc.context.obj({ S: 'JavaScript', JS: 'app.alert("pwned")' });
    doc.catalog.set((await import('@cantoo/pdf-lib')).PDFName.of('OpenAction'), doc.context.register(js));
    const out = await assembleNew([source(await doc.save())], [{ source: 0, page: 0 }]);
    expect(Buffer.from(out).toString('latin1')).not.toContain('pwned');
  });

  it('handles unusual page sizes', async () => {
    const pdf = await makeTextPdf({ sizes: [[50, 2000], [3000, 200], [14400, 14400]] });
    const out = await assembleNew([source(pdf)], [{ source: 0, page: 2 }, { source: 0, page: 0 }]);
    expect((await extractText(out)).length).toBe(2);
  });

  it('handles documents with many pages', async () => {
    const pdf = await makeTextPdf({ pages: 400 });
    const plan = Array.from({ length: 400 }, (_, i) => ({ source: 0, page: 399 - i }));
    const out = await assembleNew([source(pdf)], plan);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(400);
  });
});

describe('errors', () => {
  it('serialises and describes errors for the UI', () => {
    expect(serializeError(new PdfToolError('WRONG_PASSWORD', 'bad', 'a.pdf'))).toEqual({ code: 'WRONG_PASSWORD', message: 'bad', fileName: 'a.pdf' });
    expect(serializeError(new RangeError('Array buffer allocation failed')).code).toBe('OUT_OF_MEMORY');
    expect(describeError(new PdfToolError('NOT_PDF', 'x', 'cat.jpg')).message).toContain('cat.jpg');
    expect(describeError(new Error('boom')).title).toBe('Something went wrong');
  });
});

describe('zip service', () => {
  it('creates archives with unique, path-safe names', () => {
    expect(uniqueNames(['a.pdf', 'A.pdf', 'a.pdf', 'b'])).toEqual(['a.pdf', 'A (2).pdf', 'a (3).pdf', 'b']);
    const zip = createZip([
      { name: 'x.pdf', bytes: new Uint8Array([1, 2, 3]) },
      { name: 'x.pdf', bytes: new Uint8Array([4]) },
      { name: '../evil/../path.pdf', bytes: new Uint8Array([5]) },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['.._evil_.._path.pdf', 'x (2).pdf', 'x.pdf']);
    expect(Array.from(files['x.pdf']!)).toEqual([1, 2, 3]);
  });
});
