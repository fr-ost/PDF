/**
 * Regression tests for privacy, correctness and performance fixes in the
 * processing engines (form fields on redacted/extracted pages, structure-tree
 * leaks, bookmarks, PDF/A inputs, encrypted strings, compression predictors,
 * metadata, page ranges, cross-item search, vertical text).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { inflateSync, zlibSync } from 'fflate';
import { createCanvas } from '@napi-rs/canvas';
import { redactPdf } from '../../src/pdf/engines/redact';
import { assembleInPlace, assembleNew, splitDocument } from '../../src/pdf/engines/assemble';
import { protectPdf, unlockPdf } from '../../src/pdf/engines/security';
import { writeMetadata } from '../../src/pdf/engines/metadata';
import { compressPdf } from '../../src/pdf/engines/compress';
import { stripExifSegments, readJpegHeader } from '../../src/pdf/engines/imageFormats';
import { parsePageRanges } from '../../src/pdf/pageRanges';
import { findTextBoxes, pageTextContains, partitionTextItems, textItemGeometry, type TextItemLike } from '../../src/pdf/redaction';
import { nodeImageCodec } from '../helpers/nodeCodec';
import { makeJpeg, withExifOrientation } from '../helpers/fixtures';
import { openWithPdfjs, pageInfo } from '../helpers/pdfjs';

/** True if any object (including decompressed streams) of the file contains the text. */
async function fileContains(bytes: Uint8Array, needle: string): Promise<boolean> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    let text = obj.toString();
    if (obj instanceof PDFRawStream) {
      try {
        text += Buffer.from(inflateSync(obj.contents)).toString('latin1');
      } catch {
        text += Buffer.from(obj.contents).toString('latin1');
      }
    }
    if (text.includes(needle)) return true;
  }
  return false;
}

function blackJpeg(size = 300): Uint8Array {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  return new Uint8Array(canvas.toBuffer('image/jpeg'));
}

const redactPage = (pageIndex: number) => ({ pageIndex, image: { kind: 'jpeg' as const, bytes: blackJpeg() }, width: 300, height: 300, textItems: [] });

async function twoPages(): Promise<{ doc: PDFDocument; p1: ReturnType<PDFDocument['addPage']>; p2: ReturnType<PDFDocument['addPage']> }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([300, 300]);
  p1.drawText('Public page', { x: 20, y: 200, size: 14, font });
  const p2 = doc.addPage([300, 300]);
  p2.drawText('Private page', { x: 20, y: 200, size: 14, font });
  return { doc, p1, p2 };
}

describe('redaction removes everything attached to a redacted page', () => {
  async function formWithXfa() {
    const { doc, p2 } = await twoPages();
    const ctx = doc.context;
    const ap = ctx.register(ctx.stream('/Tx BMC BT /Helv 10 Tf 2 5 Td (SSN 123-45-6789) Tj ET EMC', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 150, 20] }));
    const widget = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Tx', T: PDFString.of('ssn'), V: PDFString.of('SSN 123-45-6789'), Rect: [20, 200, 170, 220], P: p2.ref, AP: { N: ap } }));
    p2.node.set(PDFName.of('Annots'), ctx.obj([widget]));
    const xfa = ctx.register(ctx.stream('<xfa:datasets><xfa:data><ssn>XFA-SSN-987</ssn></xfa:data></xfa:datasets>'));
    doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [widget], XFA: ['datasets', xfa] }));
    return doc.save({ useObjectStreams: false });
  }

  for (const sanitize of [false, true]) {
    it(`drops form fields, values and XFA data (remove hidden information: ${sanitize})`, async () => {
      const out = await redactPdf({ bytes: await formWithXfa(), name: 'f.pdf' }, [redactPage(1)], { removeHiddenInformation: sanitize });
      expect(await fileContains(out, '123-45-6789')).toBe(false);
      expect(await fileContains(out, 'XFA-SSN-987')).toBe(false);
      const pdf = await openWithPdfjs(out);
      expect(await pdf.getFieldObjects()).toBeNull();
    });
  }

  it('keeps links and bookmarks working (they lead to the flattened page)', async () => {
    const { doc, p1, p2 } = await twoPages();
    const ctx = doc.context;
    p1.node.set(PDFName.of('Annots'), ctx.obj([ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 60, 30], Dest: [p2.ref, 'Fit'] }))]));
    const outlines = ctx.nextRef();
    const item = ctx.register(ctx.obj({ Title: PDFString.of('Chapter 2'), Parent: outlines, Dest: [p2.ref, 'Fit'] }));
    ctx.assign(outlines, ctx.obj({ Type: 'Outlines', First: item, Last: item, Count: 1 }));
    doc.catalog.set(PDFName.of('Outlines'), outlines);
    const out = await redactPdf({ bytes: await doc.save(), name: 'f.pdf' }, [redactPage(1)], { removeHiddenInformation: false });
    const result = await PDFDocument.load(out);
    const page2 = result.getPage(1).ref;
    const link = (result.getPage(0).node.lookup(PDFName.of('Annots')) as PDFArray).lookup(0) as PDFDict;
    expect((link.lookup(PDFName.of('Dest')) as PDFArray).get(0)).toBe(page2);
    const first = (result.catalog.lookup(PDFName.of('Outlines')) as PDFDict).lookup(PDFName.of('First')) as PDFDict;
    expect((first.lookup(PDFName.of('Dest')) as PDFArray).get(0)).toBe(page2);
  });

  it('does not inherit rotation or crop box from the page tree', async () => {
    const { doc } = await twoPages();
    (doc.catalog.lookup(PDFName.of('Pages')) as PDFDict).set(PDFName.of('Rotate'), PDFNumber.of(90));
    const out = await redactPdf({ bytes: await doc.save(), name: 'f.pdf' }, [redactPage(0)], { removeHiddenInformation: false });
    const info = await pageInfo(out);
    expect(info[0]).toMatchObject({ width: 300, height: 300, rotation: 0 });
    expect(info[1]!.rotation).toBe(90);
  });
});

describe('new documents and deleted pages do not carry hidden data', () => {
  async function hierarchicalForm() {
    const { doc, p1, p2 } = await twoPages();
    const ctx = doc.context;
    const parent = ctx.nextRef();
    const ap = (text: string) => ctx.register(ctx.stream(`BT /Helv 10 Tf 2 5 Td (${text}) Tj ET`, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 20] }));
    const name = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Tx', T: PDFString.of('name'), V: PDFString.of('Alice'), Rect: [10, 10, 110, 30], P: p1.ref, Parent: parent, AP: { N: ap('Alice') } }));
    const ssn = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Tx', T: PDFString.of('ssn'), V: PDFString.of('SECRET-SSN-555'), Rect: [10, 10, 110, 30], P: p2.ref, Parent: parent, AP: { N: ap('SECRET-SSN-555') } }));
    ctx.assign(parent, ctx.obj({ T: PDFString.of('form'), Kids: [name, ssn] }));
    p1.node.set(PDFName.of('Annots'), ctx.obj([name]));
    p2.node.set(PDFName.of('Annots'), ctx.obj([ssn]));
    doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [parent] }));
    return doc.save({ useObjectStreams: false });
  }

  it('extract, split and delete leave out field values of other pages', async () => {
    const bytes = await hierarchicalForm();
    expect(await fileContains(await assembleNew([{ bytes: bytes.slice(), name: 'f.pdf' }], [{ source: 0, page: 0 }]), 'SECRET-SSN')).toBe(false);
    expect(await fileContains((await splitDocument({ bytes: bytes.slice(), name: 'f.pdf' }, [[0], [1]], ['a.pdf', 'b.pdf']))[0]!.bytes, 'SECRET-SSN')).toBe(false);
    expect(await fileContains(await assembleInPlace([{ bytes: bytes.slice(), name: 'f.pdf' }], [{ source: 0, page: 0 }]), 'SECRET-SSN')).toBe(false);
  });

  it('deleting a page removes its annotations, alt text and bookmarks reached from elsewhere', async () => {
    const { doc, p1, p2 } = await twoPages();
    const ctx = doc.context;
    const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 100, 30], A: { S: 'URI', URI: PDFString.of('https://intranet.example/SECRET-URI') }, P: p2.ref, StructParent: 1 }));
    const note = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 40, 30, 60], Contents: PDFString.of('SECRET-COMMENT'), P: p2.ref }));
    p2.node.set(PDFName.of('Annots'), ctx.obj([link, note]));
    p1.node.set(PDFName.of('Annots'), ctx.obj([ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 40, 30, 60], Contents: PDFString.of('reply'), IRT: note, P: p1.ref }))]));
    const fig = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Figure', Alt: PDFString.of('SECRET-ALT'), Pg: p2.ref, K: 0 }));
    const lnk = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Link', Pg: p2.ref, K: [{ Type: 'OBJR', Obj: link, Pg: p2.ref }] }));
    doc.catalog.set(PDFName.of('StructTreeRoot'), ctx.register(ctx.obj({ Type: 'StructTreeRoot', K: ctx.register(ctx.obj({ Type: 'StructElem', S: 'Document', K: [fig, lnk] })), ParentTree: { Nums: [1, lnk] } })));
    const outlines = ctx.nextRef();
    const keep = ctx.nextRef();
    const drop = ctx.register(ctx.obj({ Title: PDFString.of('SECRET-CHAPTER'), Parent: outlines, Prev: keep, Dest: [p2.ref, 'Fit'] }));
    ctx.assign(keep, ctx.obj({ Title: PDFString.of('Introduction'), Parent: outlines, Next: drop, Dest: [p1.ref, 'Fit'] }));
    ctx.assign(outlines, ctx.obj({ Type: 'Outlines', First: keep, Last: drop, Count: 2 }));
    doc.catalog.set(PDFName.of('Outlines'), outlines);

    const out = await assembleInPlace([{ bytes: await doc.save({ useObjectStreams: false }), name: 'a.pdf' }], [{ source: 0, page: 0 }]);
    for (const secret of ['SECRET-URI', 'SECRET-COMMENT', 'SECRET-ALT', 'SECRET-CHAPTER']) expect(await fileContains(out, secret)).toBe(false);
    const result = await PDFDocument.load(out);
    const root = result.catalog.lookup(PDFName.of('Outlines')) as PDFDict;
    const first = root.lookup(PDFName.of('First')) as PDFDict;
    expect(first.lookup(PDFName.of('Title'))?.toString()).toContain('Introduction');
    expect(first.has(PDFName.of('Next'))).toBe(false);
    expect(root.lookup(PDFName.of('Count'))?.toString()).toBe('1');
  });

  it('split keeps links within a part, drops links to other parts, and stays fast', async () => {
    const doc = await PDFDocument.create();
    const pages = Array.from({ length: 120 }, () => doc.addPage([200, 200]));
    const ctx = doc.context;
    const toc = pages[0]!;
    toc.node.set(PDFName.of('Annots'), ctx.obj(pages.slice(1).map((p) => ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], Dest: [p.ref, 'Fit'] })))));
    for (const p of pages.slice(1)) p.node.set(PDFName.of('Annots'), ctx.obj([ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], Dest: [toc.ref, 'Fit'] }))]));
    const bytes = await doc.save();
    const started = performance.now();
    const parts = await splitDocument({ bytes, name: 'a.pdf' }, [[0, 1], ...pages.slice(2).map((_, i) => [i + 2])], []);
    expect(performance.now() - started).toBeLessThan(4000);
    const first = await PDFDocument.load(parts[0]!.bytes);
    const tocLinks = first.getPage(0).node.lookup(PDFName.of('Annots')) as PDFArray;
    expect(tocLinks.size()).toBe(1); // only the link to page 2 (in this part) remains
    expect(((tocLinks.lookup(0) as PDFDict).lookup(PDFName.of('Dest')) as PDFArray).get(0)).toBe(first.getPage(1).ref);
    const back = (first.getPage(1).node.lookup(PDFName.of('Annots')) as PDFArray).lookup(0) as PDFDict;
    expect((back.lookup(PDFName.of('Dest')) as PDFArray).get(0)).toBe(first.getPage(0).ref);
    const lone = await PDFDocument.load(parts[5]!.bytes);
    expect((lone.getPage(0).node.lookup(PDFName.of('Annots')) as PDFArray).size()).toBe(0);
    expect(lone.getPageCount()).toBe(1);
  });
});

describe('PDF/A inputs, encryption and metadata', () => {
  async function pdfa(part: number) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([300, 300]).drawText('Archived', { x: 20, y: 200, size: 14, font });
    doc.addPage([300, 300]);
    const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>${part}</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(doc.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' })));
    return doc.save({ useObjectStreams: false });
  }

  it('edits PDF/A-1 files in place and protects PDF/A files', async () => {
    const one = await pdfa(1);
    const rotated = await assembleInPlace([{ bytes: one.slice(), name: 'a.pdf' }], [{ source: 0, page: 0, rotate: 90 }, { source: 0, page: 1 }]);
    expect((await pageInfo(rotated))[0]!.rotation).toBe(90);
    for (const part of [1, 2]) {
      const protectedBytes = await protectPdf({ bytes: await pdfa(part), name: 'a.pdf' }, { userPassword: 'open sesame', permissions: { printing: 'high', copying: true, modifying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true } });
      await expect(openWithPdfjs(protectedBytes)).rejects.toThrow();
      expect((await openWithPdfjs(protectedBytes, 'open sesame')).numPages).toBe(2);
    }
  });

  it('keeps the author’s restrictions of owner-password-only files; Unlock with the owner password lifts them', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    doc.addPage([200, 200]);
    doc.encrypt({ userPassword: '', ownerPassword: 'owner-pw', permissions: { printing: 'highResolution', copying: false, modifying: false, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true }, algorithm: 'AES-256' });
    const restricted = await doc.save();
    const COPY = 16;
    const rotated = await assembleInPlace([{ bytes: restricted.slice(), name: 'r.pdf' }], [{ source: 0, page: 0, rotate: 90 }, { source: 0, page: 1 }]);
    const permissions = await (await openWithPdfjs(rotated)).getPermissions();
    expect(permissions).not.toBeNull();
    expect(permissions).not.toContain(COPY);
    const unlocked = await unlockPdf({ bytes: restricted.slice(), name: 'r.pdf', password: 'owner-pw' });
    expect(await (await openWithPdfjs(unlocked)).getPermissions()).toBeNull();
  });

  it('protect keeps page labels and language readable (not left in plain text)', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage([200, 200]);
    doc.catalog.set(PDFName.of('PageLabels'), doc.context.obj({ Nums: [0, { S: 'D', P: PDFString.of('Cover-') }] }));
    doc.catalog.set(PDFName.of('Lang'), PDFString.of('en-US'));
    const out = await protectPdf({ bytes: await doc.save(), name: 'a.pdf' }, { userPassword: 'pw-1234', permissions: { printing: 'high', copying: true, modifying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true } });
    expect(Buffer.from(out).toString('latin1')).not.toContain('Cover-');
    const pdf = await openWithPdfjs(out, 'pw-1234');
    expect(await pdf.getPageLabels()).toEqual(['Cover-1', 'Cover-2', 'Cover-3']);
  });

  it('“Remove all metadata” also removes XMP attached to images', async () => {
    const doc = await PDFDocument.create();
    const ctx = doc.context;
    const xmp = ctx.register(ctx.stream('<x:xmpmeta>/Users/john.doe/Clients/Secret</x:xmpmeta>', { Type: 'Metadata', Subtype: 'XML' }));
    const image = await doc.embedJpg(makeJpeg(64, 64));
    doc.addPage([200, 200]).drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
    await doc.flush(); // images are written into the document lazily
    (ctx.lookup(image.ref) as PDFRawStream).dict.set(PDFName.of('Metadata'), xmp);
    doc.setAuthor('John Doe');
    const { bytes } = await writeMetadata({ bytes: await doc.save(), name: 'a.pdf' }, null);
    expect(await fileContains(bytes, 'john.doe')).toBe(false);
    expect(await fileContains(bytes, 'John Doe')).toBe(false);
  });
});

describe('compression', () => {
  it('undoes PNG predictors when /DecodeParms is an array', async () => {
    const w = 400;
    const h = 400;
    const raw = new Uint8Array(w * h * 3);
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const n = (rand() * 40) | 0;
      raw[i] = ((x * 255) / w + n) & 255;
      raw[i + 1] = ((y * 255) / h + n) & 255;
      raw[i + 2] = 128 + (n >> 1);
    }
    const rowLen = w * 3;
    const predicted = new Uint8Array(h * (rowLen + 1));
    for (let y = 0; y < h; y++) {
      predicted[y * (rowLen + 1)] = 2; // PNG "Up"
      for (let i = 0; i < rowLen; i++) predicted[y * (rowLen + 1) + 1 + i] = (raw[y * rowLen + i]! - (y > 0 ? raw[(y - 1) * rowLen + i]! : 0)) & 255;
    }
    const sample = async (asArray: boolean) => {
      const doc = await PDFDocument.create();
      const ctx = doc.context;
      const parms = { Predictor: 15, Colors: 3, Columns: w, BitsPerComponent: 8 };
      const dict = ctx.obj({ Type: 'XObject', Subtype: 'Image', Width: w, Height: h, BitsPerComponent: 8, ColorSpace: 'DeviceRGB', Filter: asArray ? ['FlateDecode'] : 'FlateDecode', DecodeParms: asArray ? [parms] : parms });
      const ref = ctx.register(PDFRawStream.of(dict as PDFDict, zlibSync(predicted)));
      const page = doc.addPage([144, 144]);
      page.node.newXObject('Im0', ref);
      page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream('q 144 0 0 144 0 0 cm /Im0 Do Q')));
      const { bytes, report } = await compressPdf({ bytes: await doc.save(), name: 'a.pdf' }, { level: 'balanced', removeMetadata: false }, nodeImageCodec);
      return { report, bytes };
    };
    const dictForm = await sample(false);
    const arrayForm = await sample(true);
    expect(arrayForm.report.imagesRecompressed).toBe(1);
    expect(dictForm.report.imagesRecompressed).toBe(1);
    expect(Math.abs(arrayForm.bytes.length - dictForm.bytes.length)).toBeLessThan(200);
  });

  it('strips EXIF so decoders don’t rotate images the PDF already rotates', () => {
    const jpeg = withExifOrientation(makeJpeg(40, 20), 6);
    expect(readJpegHeader(jpeg)!.orientation).toBe(6);
    const stripped = stripExifSegments(jpeg);
    expect(readJpegHeader(stripped)!.orientation).toBe(1);
    expect(stripped.length).toBeLessThan(jpeg.length);
    expect(stripExifSegments(makeJpeg(40, 20)).length).toBe(makeJpeg(40, 20).length);
  });
});

describe('page ranges and search', () => {
  it('treats spaces between numbers as separators', () => {
    const pages = (q: string) => {
      const r = parsePageRanges(q, 40);
      return r.ok ? r.pages.map((p) => p + 1) : r.error;
    };
    expect(pages('1 5')).toEqual([1, 5]);
    expect(pages('1-3 5')).toEqual([1, 2, 3, 5]);
    expect(pages('2 - 4, 7')).toEqual([2, 3, 4, 7]);
  });

  const identity = [1, 0, 0, -1, 0, 300];
  const item = (str: string, x: number, y: number, extra: Partial<TextItemLike> = {}): TextItemLike => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10, ...extra });

  it('finds words split across text items and line breaks', () => {
    const items = [item('Patient ', 20, 250), item('John', 60, 250), item(' ', 80, 250), item('Smith was seen.', 85, 250, { hasEOL: true }), item('Referred to John', 20, 230, { hasEOL: true }), item('Smith for review.', 20, 215)];
    const boxes = findTextBoxes(items, 'John Smith', identity, { caseSensitive: false, wholeWord: true });
    // Two occurrences: "John"+" "+"Smith…" (three items, one of them the space) and "…John"⏎"Smith…".
    expect(boxes.length).toBe(5);
    expect(pageTextContains(items, 'john smith', identity, { caseSensitive: false, wholeWord: false })).toBe(true);
    expect(pageTextContains(items, 'Jane', identity, { caseSensitive: false, wholeWord: false })).toBe(false);
  });

  it('measures vertical text down the column', () => {
    const column: TextItemLike = { str: 'ABCDEFGHIJ', transform: [20, 0, 0, 20, 150, 380], width: 20, height: 200, vertical: true };
    const viewport = [1, 0, 0, -1, 0, 400];
    const g = textItemGeometry(column, viewport);
    expect(g.bbox[1]).toBeCloseTo(20, 0);
    expect(g.bbox[3]).toBeCloseTo(220, 0);
    const { keep, removed } = partitionTextItems([column], [{ x: 140, y: 80, w: 40, h: 100 }], viewport, 400);
    expect(removed).toBe(1);
    expect(keep).toEqual([]);
    const [box] = findTextBoxes([column], 'EFG', viewport, { caseSensitive: true, wholeWord: false });
    expect(box!.y).toBeLessThan(110);
    expect(box!.y + box!.h).toBeGreaterThan(150);
  });
});

it('uses objects, not degrees, for rotation checks', () => {
  // Guard against accidental API drift in the helpers used above.
  expect(degrees(90).angle).toBe(90);
  expect(PDFRef.of(1, 0).objectNumber).toBe(1);
});

describe('encrypted output, replies, restrictions, structure tree and bookmarks', () => {
  const fixture = (name: string) => new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures', name)));
  const ALL = { printing: 'high' as const, copying: true, modifying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true };

  it('keeps catalog strings readable when an author’s restrictions are written back', async () => {
    // Made by pypdf: owner password only, with page labels and a document language.
    const input = fixture('pypdf-owner-only-labels.pdf');
    const out = await assembleInPlace([{ bytes: input.slice(), name: 'r.pdf' }], [{ source: 0, page: 0, rotate: 90 }, { source: 0, page: 1 }, { source: 0, page: 2 }]);
    const pdf = await openWithPdfjs(out);
    expect(await pdf.getPageLabels()).toEqual(['Cover-1', 'Cover-2', 'Cover-3']);
    expect(((await pdf.getMetadata()).info as { Language?: string }).Language).toBe('en-US');
    expect(await pdf.getPermissions()).not.toBeNull();
  });

  it('protect encrypts strings of objects the writer keeps out of object streams (generation ≠ 0)', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const ref = PDFRef.of(doc.context.largestObjectNumber + 5, 1);
    doc.context.assign(ref, doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30], Contents: PDFString.of('CONFIDENTIAL-COMMENT') }));
    page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
    const out = await protectPdf({ bytes: await doc.save({ useObjectStreams: false }), name: 'a.pdf' }, { userPassword: 'pw-1234', permissions: ALL });
    expect(Buffer.from(out).toString('latin1')).not.toContain('CONFIDENTIAL-COMMENT');
    const annots = await (await (await openWithPdfjs(out, 'pw-1234')).getPage(1)).getAnnotations();
    expect(annots[0]?.contentsObj?.str).toBe('CONFIDENTIAL-COMMENT');
  });

  it('replies stay attached to their comment after extract and split', async () => {
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([300, 300]);
    doc.addPage([300, 300]);
    const ctx = doc.context;
    const note = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30], Contents: PDFString.of('Please fix this'), P: p1.ref }));
    const reply = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30], Contents: PDFString.of('Done'), P: p1.ref, IRT: note, RT: 'R' }));
    p1.node.set(PDFName.of('Annots'), ctx.obj([note, reply]));
    const bytes = await doc.save();
    const outputs = [
      await assembleNew([{ bytes: bytes.slice(), name: 'a.pdf' }], [{ source: 0, page: 0 }]),
      (await splitDocument({ bytes: bytes.slice(), name: 'a.pdf' }, [[0], [1]], ['a.pdf', 'b.pdf']))[0]!.bytes,
    ];
    for (const out of outputs) {
      const res = await PDFDocument.load(out);
      const annots = res.getPage(0).node.lookup(PDFName.of('Annots')) as PDFArray;
      expect((annots.lookup(1) as PDFDict).get(PDFName.of('IRT'))).toBe(annots.get(0));
    }
  });

  it('new documents keep the restrictions of the files their pages come from', async () => {
    const restricted = fixture('pypdf-owner-only.pdf');
    const plain = await PDFDocument.create();
    plain.addPage([200, 200]);
    const plainBytes = await plain.save();
    const extracted = await assembleNew([{ bytes: restricted.slice(), name: 'r.pdf' }], [{ source: 0, page: 0 }]);
    expect(await (await openWithPdfjs(extracted)).getPermissions()).not.toBeNull();
    const merged = await assembleNew([{ bytes: plainBytes, name: 'p.pdf' }, { bytes: restricted.slice(), name: 'r.pdf' }], [{ source: 0, page: 0 }, { source: 1, page: 0 }]);
    expect(await (await openWithPdfjs(merged)).getPermissions()).not.toBeNull();
    const organized = await assembleInPlace([{ bytes: plainBytes, name: 'p.pdf' }, { bytes: restricted.slice(), name: 'r.pdf' }], [{ source: 0, page: 0 }, { source: 1, page: 0 }]);
    expect(await (await openWithPdfjs(organized)).getPermissions()).not.toBeNull();
    const parts = await splitDocument({ bytes: restricted.slice(), name: 'r.pdf' }, [[0]], ['a.pdf']);
    expect(await (await openWithPdfjs(parts[0]!.bytes)).getPermissions()).not.toBeNull();
  });

  it('structure elements: content on kept pages survives, content of deleted pages goes', async () => {
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([300, 300]);
    const p2 = doc.addPage([300, 300]);
    const p3 = doc.addPage([300, 300]);
    const ctx = doc.context;
    // A table that starts on page 1 and continues on page 2 (the table's own /Pg is page 1).
    const row1 = ctx.register(ctx.obj({ Type: 'StructElem', S: 'TR', Pg: p1.ref, K: 0, Alt: PDFString.of('ROW-ON-PAGE-1') }));
    const row2 = ctx.register(ctx.obj({ Type: 'StructElem', S: 'TR', Pg: p2.ref, K: 0, Alt: PDFString.of('ROW-ON-PAGE-2') }));
    const table = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Table', Pg: p1.ref, K: [row1, row2] }));
    // A figure whose page is only given on its marked-content reference.
    const figure = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Figure', Alt: PDFString.of('FIGURE-ON-PAGE-3'), K: { Type: 'MCR', Pg: p3.ref, MCID: 0 } }));
    const root = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Document', K: [table, figure] }));
    doc.catalog.set(PDFName.of('StructTreeRoot'), ctx.register(ctx.obj({ Type: 'StructTreeRoot', K: root })));
    const out = await assembleInPlace([{ bytes: await doc.save(), name: 'a.pdf' }], [{ source: 0, page: 1 }]);
    expect(await fileContains(out, 'ROW-ON-PAGE-2')).toBe(true);
    expect(await fileContains(out, 'ROW-ON-PAGE-1')).toBe(false);
    expect(await fileContains(out, 'FIGURE-ON-PAGE-3')).toBe(false);
    const res = await PDFDocument.load(out);
    const documentElement = (res.catalog.lookup(PDFName.of('StructTreeRoot')) as PDFDict).lookup(PDFName.of('K')) as PDFDict;
    const keptTable = documentElement.lookup(PDFName.of('K')) as PDFDict;
    expect(keptTable.get(PDFName.of('S'))).toBe(PDFName.of('Table'));
    expect(keptTable.has(PDFName.of('Pg'))).toBe(false);
    expect((keptTable.lookup(PDFName.of('K')) as PDFDict).get(PDFName.of('Pg'))).toBe(res.getPage(0).ref);
  });

  it('bookmark counts stay as they are unless entries were removed, then follow the spec', async () => {
    const doc = await PDFDocument.create();
    const [p1, p2, p3] = [doc.addPage([200, 200]), doc.addPage([200, 200]), doc.addPage([200, 200])];
    const ctx = doc.context;
    const [root, a, a1, a1x, a2, b] = [ctx.nextRef(), ctx.nextRef(), ctx.nextRef(), ctx.nextRef(), ctx.nextRef(), ctx.nextRef()];
    ctx.assign(a1x, ctx.obj({ Title: PDFString.of('A1x'), Parent: a1, Dest: [p2.ref, 'Fit'] }));
    ctx.assign(a1, ctx.obj({ Title: PDFString.of('A1'), Parent: a, Next: a2, First: a1x, Last: a1x, Count: 1, Dest: [p2.ref, 'Fit'] }));
    ctx.assign(a2, ctx.obj({ Title: PDFString.of('A2'), Parent: a, Prev: a1, Dest: [p3.ref, 'Fit'] }));
    // Closed chapter: three entries show when it is opened (A1, A1x, A2).
    ctx.assign(a, ctx.obj({ Title: PDFString.of('A'), Parent: root, Next: b, First: a1, Last: a2, Count: -3, Dest: [p1.ref, 'Fit'] }));
    ctx.assign(b, ctx.obj({ Title: PDFString.of('B'), Parent: root, Prev: a, Dest: [p3.ref, 'Fit'] }));
    ctx.assign(root, ctx.obj({ Type: 'Outlines', First: a, Last: b, Count: 2 }));
    doc.catalog.set(PDFName.of('Outlines'), root);
    const bytes = await doc.save();
    const countOfA = async (out: Uint8Array) => ((await openWithPdfjs(out)).getOutline() as Promise<{ title: string; count?: number }[]>).then((o) => o.find((i) => i.title === 'A')?.count);
    const rotated = await assembleInPlace([{ bytes: bytes.slice(), name: 'a.pdf' }], [{ source: 0, page: 0 }, { source: 0, page: 1 }, { source: 0, page: 2, rotate: 90 }]);
    expect(await countOfA(rotated)).toBe(-3);
    // Deleting page 3 removes A2 (and B): A1 with its open child remains, so two entries show when A opens.
    const trimmed = await assembleInPlace([{ bytes: bytes.slice(), name: 'a.pdf' }], [{ source: 0, page: 0 }, { source: 0, page: 1 }]);
    expect(await countOfA(trimmed)).toBe(-2);
  });
});
