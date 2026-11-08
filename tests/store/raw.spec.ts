/**
 * Raw 2x captures of the real extension UI for the store kit
 * (store-assets/source/render.mjs and video.mjs compose them into the store
 * graphics and the showcase video). Run: npm run store:capture
 *
 * Unique AI answers and summaries come from the same deterministic stand-ins
 * for Chrome's built-in AI as the E2E tests (headless Chromium has no model);
 * everything else is the real interface working on sample documents.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { addFiles, openTool, pdfFile, settled } from '../e2e/fixtures';
import { installFakeLanguageModel, installFakeSummarizer } from '../e2e/fakeAi';
import { makeImagePdf, makeProsePdf } from '../helpers/fixtures';

const DIST = resolve(import.meta.dirname, '../../dist');
const RAW = resolve(import.meta.dirname, '../../store-assets/source/raw');
const out = (name: string) => join(RAW, `${name}.png`);

async function reportPdf() {
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

async function launch(): Promise<{ context: BrowserContext; id: string; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'unique-pdf-store-'));
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  // Close the welcome tab opened on install (it would take over later navigation).
  const isApp = (p: Page) => p.url().includes('/app.html');
  const welcome = context.pages().find(isApp) ?? (await context.waitForEvent('page', { predicate: isApp, timeout: 10_000 }).catch(() => undefined));
  await welcome?.close();
  return { context, id: new URL(sw.url()).host, dir };
}

async function home(app: Page) {
  await app.evaluate(() => (location.hash = '#/'));
  const leave = app.getByRole('dialog').getByRole('button', { name: 'Leave' });
  await leave.waitFor({ timeout: 2500 }).then(() => leave.click()).catch(() => undefined);
  await expect(app.locator('h1')).toHaveText('Everything you need to work with PDFs.');
  await settled(app);
  await app.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
}

async function theme(app: Page, name: 'Light theme' | 'Dark theme' | 'Match system theme') {
  await app.getByRole('radiogroup', { name: 'Theme' }).first().getByRole('radio', { name }).click();
  await settled(app);
  await app.waitForTimeout(400);
}

async function still(app: Page, name: string, wait = 700) {
  await app.mouse.move(0, 0);
  await app.waitForTimeout(wait);
  await app.screenshot({ path: out(name) });
}

async function chat(app: Page) {
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
}

test('raw captures', async () => {
  test.setTimeout(300_000);
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });
  const { context, id, dir } = await launch();
  try {
    const app = await context.newPage();
    await installFakeSummarizer(app, 'available');
    await installFakeLanguageModel(app, 'available');
    await app.goto(`chrome-extension://${id}/app.html#/`);
    await expect(app.locator('h1')).toHaveText('Everything you need to work with PDFs.');
    await theme(app, 'Light theme');
    await still(app, 'home-light', 1200);

    // The tool grid.
    await app.locator('section[aria-labelledby="cat-organize"]').scrollIntoViewIfNeeded();
    await app.evaluate(() => window.scrollBy({ top: -90, behavior: 'instant' as ScrollBehavior }));
    await still(app, 'tools-light');
    await home(app);

    await chat(app);
    await still(app, 'chat-light', 900);
    await home(app);

    await openTool(app, 'ai-summary');
    await addFiles(app, [pdfFile('annual-report-2026.pdf', await makeProsePdf())]);
    await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'available');
    await app.getByTestId('primary-action').click();
    await expect(app.getByTestId('copy-summary')).toBeVisible();
    await app.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
    await still(app, 'summary-light');
    await home(app);

    await openTool(app, 'edit');
    await addFiles(app, [pdfFile('report.pdf', await reportPdf())]);
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
    await still(app, 'editor-light');
    await home(app);

    await openTool(app, 'redact');
    await addFiles(app, [pdfFile('report.pdf', await reportPdf())]);
    await expect(app.getByTestId('redact-overlay')).toBeVisible();
    await app.getByLabel('Find text to redact').fill('Revenue');
    await app.getByRole('button', { name: 'Search', exact: true }).click();
    await app.getByRole('button', { name: 'Mark all' }).click();
    await still(app, 'redact-light');
    await home(app);

    await openTool(app, 'organize');
    await addFiles(app, [pdfFile('a.pdf', await reportPdf()), pdfFile('b.pdf', await makeImagePdf())]);
    await expect(app.getByTestId('page-card')).toHaveCount(5);
    await app.getByTestId('page-card').nth(1).click();
    await app.getByTestId('page-card').nth(3).click();
    await still(app, 'organize-light');
    await home(app);

    await theme(app, 'Dark theme');
    await still(app, 'home-dark', 900);
    await chat(app);
    await still(app, 'chat-dark', 900);
    await home(app);
    await openTool(app, 'compress');
    await addFiles(app, [pdfFile('photos.pdf', await makeImagePdf())]);
    await app.getByTestId('primary-action').click();
    await expect(app.getByTestId('compression-stats')).toBeVisible({ timeout: 90_000 });
    await still(app, 'compress-dark');
    await home(app);
    await theme(app, 'Match system theme');

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 380, height: 600 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByTestId('popup-open-app')).toBeVisible();
    await popup.waitForTimeout(600);
    await popup.screenshot({ path: out('popup-light') });
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
