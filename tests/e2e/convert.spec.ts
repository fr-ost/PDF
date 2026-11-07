import { unzipSync } from 'fflate';
import { PDFDocument } from '@cantoo/pdf-lib';
import { addFiles, downloadResult, expect, expectNoErrors, openTool, pdfFile, runPrimary, test, waitForPages } from './fixtures';
import { makeImagePdf, makeJpeg, makePng, makeTextPdf, withExifOrientation } from '../helpers/fixtures';
import { extractText, pageInfo } from '../helpers/pdfjs';

test.describe('convert tools', () => {
  test('compress reduces an image-heavy PDF and keeps text', async ({ app, errors }) => {
    const input = await makeImagePdf();
    await openTool(app, 'compress');
    await addFiles(app, [pdfFile('photos.pdf', input)]);
    await runPrimary(app);
    await expect(app.getByTestId('compression-stats')).toBeVisible({ timeout: 90_000 });
    const out = await downloadResult(app);
    expect(out.name).toBe('photos-compressed.pdf');
    expect(out.bytes.length).toBeLessThan(input.length * 0.6);
    expect((await extractText(out.bytes))[0]).toContain('Searchable caption');
    await expect(app.getByRole('heading', { name: /Reduced by/ })).toBeVisible();
    expectNoErrors(errors);
  });

  test('maximum compression rasterises pages with a clear warning', async ({ app, errors }) => {
    await openTool(app, 'compress');
    await addFiles(app, [pdfFile('scan.pdf', await makeImagePdf())]);
    await app.getByRole('switch', { name: 'Maximum compression' }).click();
    await expect(app.getByText('Text will no longer be selectable or searchable', { exact: false })).toBeVisible();
    await runPrimary(app);
    const out = await downloadResult(app);
    expect((await pageInfo(out.bytes)).length).toBe(2);
    expect((await extractText(out.bytes)).join('').trim()).toBe('');
    expectNoErrors(errors);
  });

  test('images to PDF supports JPEG (with EXIF), PNG and WebP', async ({ app, errors }) => {
    await openTool(app, 'images-to-pdf');
    const webp = await app.evaluate(async () => {
      const c = new OffscreenCanvas(60, 40);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(0, 0, 60, 40);
      const blob = await c.convertToBlob({ type: 'image/webp' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await addFiles(app, [
      { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(withExifOrientation(makeJpeg(300, 200), 6)) },
      { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(makePng(80, 80, (c) => { c.fillStyle = 'rgba(0,0,255,0.5)'; c.fillRect(0, 0, 80, 80); })) },
      { name: 'art.webp', mimeType: 'image/webp', buffer: Buffer.from(webp) },
    ]);
    await expect(app.getByTestId('file-tile')).toHaveCount(3);
    await expect(app.getByText('Layout preview')).toBeVisible();
    await app.getByLabel('Page size').selectOption('letter');
    await runPrimary(app);
    const out = await downloadResult(app);
    const info = await pageInfo(out.bytes);
    expect(info).toHaveLength(3);
    // The EXIF-rotated photo is portrait, so "auto" orientation keeps the sheet portrait.
    expect(info[0]).toMatchObject({ width: 612, height: 792 });
    expect(info[2]).toMatchObject({ width: 792, height: 612 });
    expectNoErrors(errors);
  });

  test('images to PDF rejects non-image files', async ({ app }) => {
    await openTool(app, 'images-to-pdf');
    await addFiles(app, [pdfFile('not-an-image.pdf', await makeTextPdf({ pages: 1 }))]);
    await expect(app.getByText('This tool needs an image file (JPEG, PNG, WebP, GIF, BMP or AVIF).')).toBeVisible();
  });

  test('PDF to images exports PNG and a ZIP for several pages', async ({ app, errors }) => {
    await openTool(app, 'pdf-to-images');
    await addFiles(app, [pdfFile('slides.pdf', await makeTextPdf({ pages: 3 }))]);
    await waitForPages(app, 3);
    await expect(app.locator('[data-testid=page-card][data-selected]')).toHaveCount(3);
    await app.getByLabel('Resolution').selectOption('72');
    await runPrimary(app);
    const zip = await downloadResult(app, 'download-all-button');
    const files = unzipSync(zip.bytes);
    expect(Object.keys(files).sort()).toEqual(['slides-page-1.png', 'slides-page-2.png', 'slides-page-3.png']);
    const png = files['slides-page-1.png']!;
    expect(Array.from(png.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
    // 72 DPI A4 → 595×842 pixels (IHDR width/height)
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(595);
    expectNoErrors(errors);
  });

  test('PDF to images exports a single JPEG', async ({ app, errors }) => {
    await openTool(app, 'pdf-to-images');
    await addFiles(app, [pdfFile('one.pdf', await makeTextPdf({ pages: 2 }))]);
    await waitForPages(app, 2);
    await app.getByRole('button', { name: 'None' }).click();
    await app.getByTestId('page-card').nth(1).click();
    await app.getByRole('radio', { name: 'JPEG' }).click();
    await runPrimary(app);
    const out = await downloadResult(app);
    expect(out.name).toBe('one-page-2.jpg');
    expect(Array.from(out.bytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    expectNoErrors(errors);
  });

  test('a large job can be cancelled and the tool stays usable', async ({ app, errors }) => {
    const doc = await PDFDocument.create();
    const jpg = await doc.embedJpg(makeJpeg(1200, 1600, 92));
    for (let i = 0; i < 40; i++) doc.addPage([595, 842]).drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 });
    await openTool(app, 'pdf-to-images');
    await addFiles(app, [pdfFile('long.pdf', await doc.save())]);
    await waitForPages(app, 40);
    await app.getByLabel('Resolution').selectOption('300');
    await runPrimary(app);
    await expect(app.getByTestId('task-progress')).toBeVisible();
    await app.getByTestId('task-progress').getByRole('button', { name: 'Cancel' }).click();
    await expect(app.getByTestId('task-progress')).toHaveCount(0);
    await expect(app.getByTestId('primary-action')).toBeEnabled();
    await expect(app.getByTestId('result-panel')).toHaveCount(0);
    expectNoErrors(errors);
  });
});
