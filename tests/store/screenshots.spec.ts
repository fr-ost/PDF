import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import type { Page } from '@playwright/test';
import { addFiles, expect, openTool, pdfFile, settled, test, waitForPages } from '../e2e/fixtures';
import { installFakeLanguageModel, installFakeSummarizer } from '../e2e/fakeAi';
import { makeImagePdf, makeProsePdf } from '../helpers/fixtures';
/**
 * Generates Chrome Web Store screenshots (1280×800) into store-assets/screenshots.
 * Run: npm run screenshots. The AI Summary shots use the same deterministic
 * stand-in for Chrome's on-device model as the E2E tests (headless Chromium
 * has no model); the UI shown is the real extension UI.
 */
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

async function leave(app: Page) {
  await app.evaluate(() => (location.hash = '#/'));
  await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await expect(app.locator('h1')).toHaveText('Everything you need to work with PDFs.');
  await settled(app);
}

async function theme(app: Page, name: 'Light theme' | 'Dark theme') {
  await app.getByRole('radiogroup', { name: 'Theme' }).first().getByRole('radio', { name }).click();
  await settled(app);
  await app.waitForTimeout(300); // let colour transitions finish
}

async function aiChat(app: Page) {
  await openTool(app, 'ai-chat');
  await addFiles(app, [pdfFile('annual-report-2026.pdf', await makeProsePdf())]);
  const input = app.getByTestId('chat-input');
  await expect(input).toBeEnabled();
  for (const question of ['How many warehouses were merged?', 'What are the main risks?']) {
    await input.fill(question);
    await input.press('Enter');
    await expect(app.getByTestId('chat-assistant-message').last()).toHaveAttribute('data-status', 'done');
  }
  await app.getByTestId('citation').last().click();
  await app.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
  await app.mouse.move(0, 0);
  await app.waitForTimeout(800);
}

async function aiSummary(app: Page) {
  await openTool(app, 'ai-summary');
  await addFiles(app, [pdfFile('annual-report-2026.pdf', await makeProsePdf())]);
  await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'available');
  await app.getByTestId('primary-action').click();
  await expect(app.getByTestId('copy-summary')).toBeVisible();
  await app.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
  await app.mouse.move(0, 0);
  await app.waitForTimeout(500);
}

test('screens', async ({ app }) => {
  test.setTimeout(180_000);
  await installFakeSummarizer(app, 'available');
  await installFakeLanguageModel(app, 'available');
  await app.reload();
  await app.setViewportSize({ width: 1280, height: 800 });
  await app.waitForTimeout(900);
  await app.screenshot({ path: out('01-home') });

  await aiChat(app);
  await app.screenshot({ path: out('02-ai-chat') });
  await leave(app);

  await aiSummary(app);
  await app.screenshot({ path: out('03-ai-summary') });
  await leave(app);

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
  await app.screenshot({ path: out('04-editor') });
  await leave(app);

  await openTool(app, 'redact');
  await addFiles(app, [pdfFile('report.pdf', await richPdf())]);
  await expect(app.getByTestId('redact-overlay')).toBeVisible();
  await app.getByLabel('Find text to redact').fill('Revenue');
  await app.getByRole('button', { name: 'Search', exact: true }).click();
  await app.getByRole('button', { name: 'Mark all' }).click();
  await app.waitForTimeout(400);
  await app.screenshot({ path: out('05-redact') });
  await leave(app);

  await openTool(app, 'organize');
  await addFiles(app, [pdfFile('a.pdf', await richPdf()), pdfFile('b.pdf', await makeImagePdf())]);
  await waitForPages(app, 5);
  await app.getByTestId('page-card').nth(1).click();
  await app.getByTestId('page-card').nth(3).click();
  await app.mouse.move(0, 0);
  await app.waitForTimeout(600);
  await app.screenshot({ path: out('06-organize') });
  await leave(app);

  await openTool(app, 'watermark');
  await addFiles(app, [pdfFile('report.pdf', await richPdf())]);
  await app.waitForTimeout(800);
  await app.screenshot({ path: out('10-watermark') });
  await leave(app);

  await theme(app, 'Dark theme');
  await app.screenshot({ path: out('07-home-dark') });
  await aiChat(app);
  await app.screenshot({ path: out('08-ai-chat-dark') });
  await leave(app);
  await openTool(app, 'compress');
  await addFiles(app, [pdfFile('photos.pdf', await makeImagePdf())]);
  await app.getByTestId('primary-action').click();
  await expect(app.getByTestId('compression-stats')).toBeVisible();
  await app.mouse.move(0, 0);
  await app.waitForTimeout(500);
  await app.screenshot({ path: out('09-compress-result-dark') });
  await theme(app, 'Light theme');
});

test('popup', async ({ extContext, extensionId }) => {
  const p = await extContext.newPage();
  await p.setViewportSize({ width: 380, height: 560 });
  await p.goto(`chrome-extension://${extensionId}/popup.html`);
  await p.waitForTimeout(600);
  await p.screenshot({ path: out('11-popup') });
  await p.close();
});
