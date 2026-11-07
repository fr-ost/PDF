import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from '@cantoo/pdf-lib';
import { assembleInPlace, assembleNew, splitDocument } from '../../src/pdf/engines/assemble';
import { makeNestedTreePdf, makeTextPdf, source } from '../helpers/fixtures';
import { extractText, pageInfo } from '../helpers/pdfjs';

describe('merge (assembleNew)', () => {
  it('merges documents preserving order, sizes and content', async () => {
    const a = await makeTextPdf({ pages: 2, label: 'Alpha' });
    const b = await makeTextPdf({ sizes: [[300, 500]], label: 'Beta' });
    const out = await assembleNew([source(a, 'a.pdf'), source(b, 'b.pdf')], [
      { source: 0, page: 0 },
      { source: 0, page: 1 },
      { source: 1, page: 0 },
    ]);
    const text = await extractText(out);
    expect(text).toHaveLength(3);
    expect(text[0]).toContain('Alpha 1');
    expect(text[1]).toContain('Alpha 2');
    expect(text[2]).toContain('Beta 1');
    const info = await pageInfo(out);
    expect(info[2]).toMatchObject({ width: 300, height: 500 });
  });

  it('can merge the same file twice', async () => {
    const a = await makeTextPdf({ pages: 1, label: 'Same' });
    const out = await assembleNew([source(a), source(a)], [{ source: 0, page: 0 }, { source: 1, page: 0 }]);
    expect((await extractText(out)).length).toBe(2);
  });

  it('rejects empty plans and invalid pages', async () => {
    const a = await makeTextPdf({ pages: 1 });
    await expect(assembleNew([source(a)], [])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(assembleNew([source(a)], [{ source: 0, page: 5 }])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('in-place operations', () => {
  it('reorders pages', async () => {
    const a = await makeTextPdf({ pages: 3 });
    const out = await assembleInPlace([source(a)], [{ source: 0, page: 2 }, { source: 0, page: 0 }, { source: 0, page: 1 }]);
    const text = await extractText(out);
    expect(text.map((t) => /Page (\d)/.exec(t)?.[1])).toEqual(['3', '1', '2']);
  });

  it('deletes pages and removes their content from the file', async () => {
    const a = await makeTextPdf({ pages: 3, label: 'Keep' });
    // Put a unique secret on page 2 using a distinct font so its objects are page-specific.
    const doc = await PDFDocument.load(a);
    const courier = await doc.embedFont(StandardFonts.Courier);
    doc.getPage(1).drawText('TOPSECRET-DELETED', { x: 50, y: 400, size: 14, font: courier });
    const withSecret = await doc.save({ useObjectStreams: false });
    const out = await assembleInPlace([source(withSecret)], [{ source: 0, page: 0 }, { source: 0, page: 2 }]);
    const text = await extractText(out);
    expect(text).toHaveLength(2);
    expect(text.join(' ')).not.toContain('TOPSECRET');
    // The deleted page's content stream and Courier font must not survive in the output bytes.
    const reloaded = await PDFDocument.load(out);
    const objects = reloaded.context.enumerateIndirectObjects().map(([, o]) => o.toString()).join('\n');
    expect(objects).not.toContain('Courier');
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('drops links that point to deleted pages and keeps bookmarks dead-safe', async () => {
    const a = await makeTextPdf({ pages: 3 });
    const doc = await PDFDocument.load(a);
    const target = doc.getPage(2);
    const link = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 100, 100], Dest: [target.ref, 'Fit'] });
    doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(link)]));
    const out = await assembleInPlace([source(await doc.save())], [{ source: 0, page: 0 }, { source: 0, page: 1 }]);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(2);
    const annots = reloaded.getPage(0).node.lookup(PDFName.of('Annots'));
    expect(annots?.toString() ?? '[]').not.toContain('Link');
  });

  it('rotates pages by a delta, normalising angles', async () => {
    const a = await makeTextPdf({ pages: 3, rotate: [0, 90, 0] });
    const out = await assembleInPlace([source(a)], [
      { source: 0, page: 0, rotate: 90 },
      { source: 0, page: 1, rotate: 270 },
      { source: 0, page: 2, rotate: -90 },
    ]);
    const info = await pageInfo(out);
    expect(info.map((p) => p.rotation)).toEqual([90, 0, 270]);
  });

  it('preserves inherited attributes when flattening a nested page tree', async () => {
    const nested = await makeNestedTreePdf();
    const before = await pageInfo(nested);
    expect(before[0]).toMatchObject({ width: 400, height: 300, rotation: 90 });
    const out = await assembleInPlace([source(nested)], [{ source: 0, page: 3 }, { source: 0, page: 0 }]);
    const info = await pageInfo(out);
    expect(info).toEqual([
      { width: 400, height: 300, rotation: 90 },
      { width: 400, height: 300, rotation: 90 },
    ]);
    const text = await extractText(out);
    expect(text[0]).toContain('Nested 4');
    expect(text[1]).toContain('Nested 1');
  });

  it('combines pages from multiple files keeping the first as base', async () => {
    const a = await makeTextPdf({ pages: 2, label: 'Base' });
    const b = await makeTextPdf({ pages: 2, label: 'Other' });
    const out = await assembleInPlace([source(a), source(b)], [
      { source: 0, page: 1 },
      { source: 1, page: 0 },
      { source: 0, page: 0 },
    ]);
    const text = await extractText(out);
    expect(text[0]).toContain('Base 2');
    expect(text[1]).toContain('Other 1');
    expect(text[2]).toContain('Base 1');
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getTitle()).toBe('Base');
  });

  it('supports duplicating a page of the base document', async () => {
    const a = await makeTextPdf({ pages: 1, label: 'Dup' });
    const out = await assembleInPlace([source(a)], [{ source: 0, page: 0 }, { source: 0, page: 0 }]);
    expect(await extractText(out)).toEqual([expect.stringContaining('Dup 1'), expect.stringContaining('Dup 1')]);
  });
});

describe('split / extract', () => {
  it('splits into parts loading the source once', async () => {
    const a = await makeTextPdf({ pages: 5 });
    const parts = await splitDocument(source(a, 'doc.pdf'), [[0, 1], [2], [3, 4]], ['p1.pdf', 'p2.pdf', 'p3.pdf']);
    expect(parts.map((p) => p.name)).toEqual(['p1.pdf', 'p2.pdf', 'p3.pdf']);
    expect(parts.map((p) => p.pageCount)).toEqual([2, 1, 2]);
    const t3 = await extractText(parts[2]!.bytes);
    expect(t3[0]).toContain('Page 4');
    expect(t3[1]).toContain('Page 5');
  });

  it('extracts pages into a new document without the source outline', async () => {
    const a = await makeTextPdf({ pages: 4 });
    const out = await assembleNew([source(a)], [{ source: 0, page: 3 }, { source: 0, page: 1 }]);
    const text = await extractText(out);
    expect(text[0]).toContain('Page 4');
    expect(text[1]).toContain('Page 2');
  });
});
