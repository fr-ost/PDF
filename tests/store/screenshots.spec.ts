import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { addFiles, expect, openTool, pdfFile, test, waitForPages } from '../e2e/fixtures';
import { makeImagePdf } from '../helpers/fixtures';
/** Generates Chrome Web Store screenshots (1280×800) into store-assets/screenshots. Run: npm run screenshots */
const out = (n: string) => `store-assets/screenshots/${n}.png`;

async function richPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let p = 0; p < 3; p++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Quarterly Report — Section ${p + 1}`, { x: 60, y: 770, size: 22, font: bold });
    for (let i = 0; i < 28; i++) page.drawText(`Line ${i + 1}: Revenue grew steadily across all regions with strong customer retention.`, { x: 60, y: 720 - i * 22, size: 11, font });
  }
  return doc.save();
}

test('screens', async ({ app }) => {
  await app.setViewportSize({ width: 1280, height: 800 });
  await app.screenshot({ path: out('01-home') });
  await openTool(app, 'edit');
  await addFiles(app, [pdfFile('report.pdf', await richPdf())]);
  const overlay = app.getByTestId('editor-overlay');
  await expect(overlay).toBeVisible();
  await app.waitForTimeout(600);
  const b = (await overlay.boundingBox())!;
  await app.getByTestId('tool-highlight').click();
  await app.mouse.move(b.x + b.width * 0.09, b.y + b.height * 0.165);
  await app.mouse.down();
  await app.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.185, { steps: 4 });
  await app.mouse.up();
  await app.getByTestId('tool-text').click();
  await app.mouse.click(b.x + b.width * 0.55, b.y + b.height * 0.05);
  await app.getByTestId('text-editor').fill('Reviewed — approved');
  await app.getByTestId('text-editor').blur();
  await app.getByTestId('tool-ellipse').click();
  await app.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.4);
  await app.mouse.down();
  await app.mouse.move(b.x + b.width * 0.85, b.y + b.height * 0.48, { steps: 4 });
  await app.mouse.up();
  await app.screenshot({ path: out('02-editor') });
  await app.evaluate(() => (location.hash = '#/'));
  await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();

  await openTool(app, 'redact');
  await addFiles(app, [pdfFile('report.pdf', await richPdf())]);
  await expect(app.getByTestId('redact-overlay')).toBeVisible();
  await app.getByLabel('Find text to redact').fill('Revenue');
  await app.getByRole('button', { name: 'Search' }).click();
  await app.getByRole('button', { name: 'Mark all' }).click();
  await app.waitForTimeout(400);
  await app.screenshot({ path: out('03-redact') });
  await app.evaluate(() => (location.hash = '#/'));
  await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();

  await openTool(app, 'watermark');
  await addFiles(app, [pdfFile('report.pdf', await richPdf())]);
  await app.waitForTimeout(800);
  await app.screenshot({ path: out('04-watermark') });
  await app.evaluate(() => (location.hash = '#/'));
  await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();

  await openTool(app, 'organize');
  await addFiles(app, [pdfFile('a.pdf', await richPdf()), pdfFile('b.pdf', await makeImagePdf())]);
  await waitForPages(app, 5);
  await app.getByTestId('page-card').nth(1).click();
  await app.getByTestId('page-card').nth(3).click();
  await app.waitForTimeout(600);
  await app.screenshot({ path: out('05-organize') });
  await app.evaluate(() => (location.hash = '#/'));
  await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();

  await app.evaluate(() => (location.hash = '#/settings'));
  await app.getByRole('radio', { name: /Dark/ }).click();
  await app.evaluate(() => (location.hash = '#/'));
  await app.screenshot({ path: out('06-home-dark') });
  await openTool(app, 'compress');
  await addFiles(app, [pdfFile('photos.pdf', await makeImagePdf())]);
  await app.waitForTimeout(500);
  await app.screenshot({ path: out('07-compress-dark') });
  await app.getByTestId('primary-action').click();
  await expect(app.getByTestId('compression-stats')).toBeVisible();
  await app.screenshot({ path: out('08-compress-result-dark') });
  await app.evaluate(() => (location.hash = '#/settings'));
  await app.getByRole('radio', { name: /Light/ }).click();

});

test('popup', async ({ extContext, extensionId }) => {
  const p = await extContext.newPage();
  await p.setViewportSize({ width: 360, height: 600 });
  await p.goto(`chrome-extension://${extensionId}/popup.html`);
  await p.waitForTimeout(400);
  await p.screenshot({ path: out('09-popup') });
});
