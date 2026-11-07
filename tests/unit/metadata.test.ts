import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { buildXmp, readMetadata, writeMetadata } from '../../src/pdf/engines/metadata';
import { makeTextPdf, source } from '../helpers/fixtures';

const blank = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '', creationDate: null, modificationDate: null };

describe('metadata', () => {
  it('reads the Info dictionary', async () => {
    const meta = await readMetadata(source(await makeTextPdf({ pages: 2, label: 'Quarterly Report' })));
    expect(meta).toMatchObject({ title: 'Quarterly Report', pageCount: 2, hasXmp: false, wasEncrypted: false });
    expect(meta.pdfVersion).toMatch(/^\d\.\d$/);
  });

  it('updates fields and removes cleared ones', async () => {
    const input = await makeTextPdf({ pages: 1, label: 'Old' });
    const { metadata, bytes } = await writeMetadata(source(input), {
      ...blank,
      title: 'New Title',
      author: 'Ada Lovelace',
      keywords: 'alpha beta',
      creationDate: '2024-01-02T03:04:05.000Z',
    });
    expect(metadata).toMatchObject({ title: 'New Title', author: 'Ada Lovelace', keywords: 'alpha beta', subject: '', producer: '' });
    expect(metadata.creationDate).toBe('2024-01-02T03:04:05.000Z');
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getSubject()).toBeUndefined();
  });

  it('rewrites existing XMP so viewers do not show stale values', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const oldXmp = '<x:xmpmeta><pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance><dc:title>Stale</dc:title></x:xmpmeta>';
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(doc.context.stream(oldXmp, { Type: 'Metadata', Subtype: 'XML' })));
    const { bytes } = await writeMetadata(source(await doc.save()), { ...blank, title: 'Fresh <&> "quoted"' });
    const out = await PDFDocument.load(bytes, { updateMetadata: false });
    const ref = out.catalog.get(PDFName.of('Metadata'));
    const xmp = new TextDecoder().decode((out.context.lookup(ref!) as PDFRawStream).contents);
    expect(xmp).toContain('Fresh &lt;&amp;&gt; &quot;quoted&quot;');
    expect(xmp).not.toContain('Stale');
    expect(xmp).toContain('<pdfaid:part>2</pdfaid:part>');
  });

  it('removes all metadata', async () => {
    const input = await makeTextPdf({ pages: 1, label: 'Secret Title' });
    const { metadata, bytes } = await writeMetadata(source(input), null);
    expect(metadata).toMatchObject({ title: '', producer: '', creationDate: null, hasXmp: false });
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('Secret Title');
  });

  it('sanitises control characters and caps the length of hostile metadata', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setTitle(`<script>alert(1)</script>\u0000\u0007${'A'.repeat(5000)}`);
    const meta = await readMetadata(source(await doc.save()));
    expect(meta.title.startsWith('<script>alert(1)</script>A')).toBe(true); // rendered as text by React
    expect(meta.title.length).toBe(2000);
    expect(meta.title).not.toMatch(/[\u0000\u0007]/);
  });

  it('rejects overlong values', async () => {
    await expect(writeMetadata(source(await makeTextPdf({ pages: 1 })), { ...blank, title: 'x'.repeat(2001) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('builds escaped XMP', () => {
    expect(buildXmp({ ...blank, author: 'A & B' }, '')).toContain('<rdf:li>A &amp; B</rdf:li>');
  });
});
