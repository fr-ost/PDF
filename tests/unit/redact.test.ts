import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { redactPdf } from '../../src/pdf/engines/redact';
import { findTextBoxes, partitionTextItems, type TextItemLike } from '../../src/pdf/redaction';
import { source } from '../helpers/fixtures';
import { extractText, openWithPdfjs } from '../helpers/pdfjs';

async function makeConfidentialPdf(rotate = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('Public introduction text', { x: 50, y: 760, size: 16, font });
  page.drawText('Account number: 9876-5432-1000', { x: 50, y: 600, size: 16, font });
  page.drawText('Closing public remarks', { x: 50, y: 300, size: 16, font });
  if (rotate) page.setRotation((await import('@cantoo/pdf-lib')).degrees(rotate));
  doc.addPage([595, 842]).drawText('Second page also mentions 9876-5432-1000', { x: 50, y: 700, size: 12, font });
  doc.setTitle('Account 9876-5432-1000 statement');
  doc.setAuthor('Jane Customer');
  return doc.save();
}

/** Mimics the UI: render with PDF.js, paint boxes, partition text, call the engine. */
async function redactLikeTheApp(bytes: Uint8Array, query: string, pages: number[], removeHiddenInformation = true) {
  const pdf = await openWithPdfjs(bytes);
  const inputs = [];
  for (const pageIndex of pages) {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((i): i is TextItemLike & typeof i => 'str' in i) as unknown as TextItemLike[];
    const boxes = findTextBoxes(items, query, viewport.transform, { caseSensitive: false, wholeWord: false });
    const scale = 2;
    const render = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(render.width), Math.ceil(render.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport: render }).promise;
    ctx.fillStyle = '#000';
    for (const b of boxes) ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
    const { keep, removed } = partitionTextItems(items, boxes, viewport.transform, viewport.height);
    inputs.push({ pageIndex, image: { kind: 'png' as const, bytes: new Uint8Array(canvas.encodeSync('png')) }, width: viewport.width, height: viewport.height, textItems: keep, boxes, removed });
  }
  await pdf.loadingTask.destroy();
  const out = await redactPdf(source(bytes), inputs, { removeHiddenInformation });
  return { out, inputs };
}

describe('secure redaction', () => {
  it('removes redacted text from the file while keeping other text searchable', async () => {
    const input = await makeConfidentialPdf();
    const { out, inputs } = await redactLikeTheApp(input, '9876-5432-1000', [0]);
    expect(inputs[0]!.boxes).toHaveLength(1);
    expect(inputs[0]!.removed).toBe(1);
    const text = await extractText(out);
    expect(text[0]).not.toContain('9876');
    expect(text[0]).toContain('Public introduction text');
    expect(text[0]).toContain('Closing public remarks');
    // Unredacted page 2 is untouched.
    expect(text[1]).toContain('9876-5432-1000');
    // Metadata that repeated the secret is gone.
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getTitle()).toBeUndefined();
    expect(doc.getAuthor()).toBeUndefined();
  });

  it('leaves no trace of the redacted page content in the raw bytes', async () => {
    const input = await makeConfidentialPdf();
    const { out } = await redactLikeTheApp(input, '9876-5432-1000', [0, 1]);
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    // Inspect every decoded stream and object for the secret.
    const dump = doc.context
      .enumerateIndirectObjects()
      .map(([, o]) => {
        let decoded = '';
        if (o instanceof PDFRawStream) {
          try {
            decoded = Buffer.from(decodePDFRawStream(o).decode()).toString('latin1');
          } catch {
            decoded = Buffer.from(o.contents).toString('latin1');
          }
        }
        return o.toString() + decoded;
      })
      .join('\n')
      // pdf-lib writes text as hex strings: decode them so the search is meaningful.
      .replace(/<([0-9A-Fa-f\s]{2,})>/g, (_, hex: string) => Buffer.from(hex.replace(/\s/g, ''), 'hex').toString('latin1'));
    expect(dump.length).toBeGreaterThan(1000); // streams were really decoded
    expect(dump).toContain('Public introduction'); // invisible text layer kept outside the boxes
    expect(dump).not.toContain('9876');
    expect(dump).not.toContain('Account number');
    expect((await extractText(out)).join(' ')).not.toContain('9876');
  });

  it('works on rotated pages', async () => {
    const input = await makeConfidentialPdf(90);
    const { out, inputs } = await redactLikeTheApp(input, 'Account number', [0]);
    expect(inputs[0]!.width).toBe(842);
    const text = await extractText(out);
    expect(text[0]).not.toContain('Account number');
    expect(text[0]).not.toContain('9876'); // same text item as the match
    expect(text[0]).toContain('Public introduction text');
  });

  it('keeps metadata when hidden-information removal is off', async () => {
    const { out } = await redactLikeTheApp(await makeConfidentialPdf(), 'Account', [0], false);
    expect((await PDFDocument.load(out, { updateMetadata: false })).getAuthor()).toBe('Jane Customer');
  });

  it('rejects empty or invalid redaction lists', async () => {
    const input = await makeConfidentialPdf();
    await expect(redactPdf(source(input), [], { removeHiddenInformation: true })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('finds whole words and respects case sensitivity', () => {
    const item: TextItemLike = { str: 'Secret secretary SECRET', transform: [10, 0, 0, 10, 0, 100], width: 120, height: 10 };
    const identity = [1, 0, 0, -1, 0, 200];
    expect(findTextBoxes([item], 'secret', identity, { caseSensitive: false, wholeWord: true })).toHaveLength(2);
    expect(findTextBoxes([item], 'secret', identity, { caseSensitive: true, wholeWord: false })).toHaveLength(1);
    expect(findTextBoxes([item], 'secret', identity, { caseSensitive: false, wholeWord: false })).toHaveLength(3);
  });
});
