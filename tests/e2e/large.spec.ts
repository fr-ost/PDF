import { PDFDocument } from '@cantoo/pdf-lib';
import { addFiles, downloadResult, expect, expectNoErrors, openTool, pdfFile, runPrimary, test, waitForPages } from './fixtures';
import { makeJpeg, makeTextPdf } from '../helpers/fixtures';
import { pageInfo } from '../helpers/pdfjs';

test.describe('large documents', () => {
  test('a 300-page document renders thumbnails lazily and processes fully', async ({ app, errors }) => {
    await openTool(app, 'reorder');
    await addFiles(app, [pdfFile('big.pdf', await makeTextPdf({ pages: 300 }))]);
    await waitForPages(app, 300);
    await app.waitForTimeout(1500);
    const rendered = await app.locator('[data-testid=page-card] img').count();
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(120); // only pages near the viewport are rendered
    // The interface stays responsive while thumbnails render.
    const frame = await app.evaluate(() => new Promise<number>((r) => { const t = performance.now(); requestAnimationFrame(() => r(performance.now() - t)); }));
    expect(frame).toBeLessThan(500);
    await app.getByRole('button', { name: 'Reverse order' }).click();
    await runPrimary(app);
    const out = await downloadResult(app);
    expect((await pageInfo(out.bytes)).length).toBe(300);
    expectNoErrors(errors);
  });

  test('a ~30 MB image-heavy PDF can be split', async ({ app, errors }) => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 10; i++) {
      const jpg = await doc.embedJpg(makeJpeg(1800, 2400, 97));
      doc.addPage([595, 842]).drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 });
    }
    const bytes = await doc.save();
    expect(bytes.length).toBeGreaterThan(20 * 1024 * 1024);
    await openTool(app, 'split');
    await addFiles(app, [pdfFile('heavy.pdf', bytes)]);
    await waitForPages(app, 10);
    await app.getByText('Equal parts', { exact: true }).click();
    await app.getByLabel('Pages per file').fill('5');
    await app.getByLabel('Pages per file').blur();
    await runPrimary(app);
    await expect(app.getByRole('list', { name: 'Output files' }).getByRole('listitem')).toHaveCount(2, { timeout: 90_000 });
    expectNoErrors(errors);
  });
});
