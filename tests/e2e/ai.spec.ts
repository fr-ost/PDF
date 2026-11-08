import { readFileSync } from 'node:fs';
import { addFiles, expect, expectNoErrors, openTool, pdfFile, test } from './fixtures';
import { FAKE_SUMMARY, aiCalls, installFakeSummarizer } from './fakeAi';
import { makeProsePdf, makeTextPdf } from '../helpers/fixtures';
import type { Page } from '@playwright/test';

/**
 * AI Summary runs on Chrome's on-device Summarizer API. Headless Chromium has
 * no model, so these tests install a deterministic stand-in with the same API
 * shape (see fakeAi.ts) and drive the real UI against it.
 */
async function openAiSummary(app: Page, availability: Parameters<typeof installFakeSummarizer>[1]) {
  await installFakeSummarizer(app, availability);
  await app.reload();
  await openTool(app, 'ai-summary');
}

test.describe('AI Summary', () => {
  test('summarizes with on-device AI, streams the result, copies and downloads it', async ({ app, errors }) => {
    await openAiSummary(app, 'available');
    await addFiles(app, [pdfFile('annual-report.pdf', await makeProsePdf())]);
    await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'available');
    await expect(app.getByText(/3 pages · [\d,]+ words/)).toBeVisible();

    // Options reach the model: style, length and the reader's focus.
    const styles = app.getByRole('radiogroup', { name: 'Summary style' });
    await styles.getByRole('radio', { name: /TL;DR/ }).click();
    await expect(styles.getByRole('radio', { name: /TL;DR/ })).toHaveAttribute('aria-checked', 'true');
    await styles.getByRole('radio', { name: /TL;DR/ }).press('ArrowLeft');
    await expect(styles.getByRole('radio', { name: /Key points/ })).toHaveAttribute('aria-checked', 'true');
    await expect(styles.getByRole('radio', { name: /Key points/ })).toBeFocused();
    await app.getByRole('radiogroup', { name: 'Summary length' }).getByRole('radio', { name: 'Short' }).click();
    await app.getByLabel('Focus (optional)').fill('costs and risks');

    const primary = app.getByTestId('primary-action');
    await expect(primary).toHaveText(/Summarize with AI/);
    await primary.click();
    const output = app.getByTestId('summary-output');
    await expect(output).toContainText('Revenue grew 18%');
    await expect(output).toContainText('Key risks: supplier concentration and rising interest rates.');
    await expect(output.locator('li')).toHaveCount(4);
    await expect(output.locator('strong').first()).toHaveText('Revenue grew 18%');
    await expect(app.getByText('On-device AI', { exact: true })).toBeVisible();
    await expect(app.getByText(/AI can make mistakes/)).toBeVisible();

    const calls = await aiCalls(app);
    const create = JSON.parse(calls.find((c) => c.startsWith('create:'))!.slice('create:'.length)) as Record<string, string>;
    expect(create).toMatchObject({ type: 'key-points', length: 'short', format: 'markdown', outputLanguage: 'en' });
    expect(create.sharedContext).toContain('annual-report.pdf');
    expect(create.sharedContext).toContain('costs and risks');
    // A short document is summarized in a single streamed pass.
    expect(calls.filter((c) => c.startsWith('stream:'))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('summarize:'))).toHaveLength(0);

    // Copy puts plain text (no Markdown markers) on the clipboard.
    await app.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async (text: string) => {
          (window as unknown as { __copied: string }).__copied = text;
        },
      });
    });
    await app.getByTestId('copy-summary').click();
    await expect(app.getByText('Summary copied to the clipboard')).toBeVisible();
    const copied = await app.evaluate(() => (window as unknown as { __copied: string }).__copied);
    expect(copied).toContain('Revenue grew 18% year over year');
    expect(copied).not.toContain('**');

    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('download-summary').click()]);
    expect(download.suggestedFilename()).toBe('annual-report-summary.md');
    const markdown = readFileSync(await download.path(), 'utf8');
    expect(markdown.startsWith('# Summary of annual-report.pdf')).toBe(true);
    expect(markdown).toContain('Generated on-device');
    expect(markdown).toContain(FAKE_SUMMARY.split('\n')[0]!);

    // The task is recorded in history by name only.
    await app.evaluate(() => (location.hash = '#/recent'));
    await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
    await expect(app.getByRole('main').getByText('annual-report-summary.md')).toBeVisible();
    expectNoErrors(errors);
  });

  test('sets up the on-device model once, showing download progress', async ({ app, errors }) => {
    await openAiSummary(app, 'downloadable');
    await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
    await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'downloadable');
    await expect(app.getByText('One-time AI setup')).toBeVisible();
    const primary = app.getByTestId('primary-action');
    await expect(primary).toHaveText(/Set up AI & summarize/);
    await primary.click();
    await expect(app.getByTestId('task-progress')).toContainText('downloading its on-device AI model');
    await expect(app.getByTestId('summary-output')).toContainText('Revenue grew 18%');
    await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'available');
    await expect(primary).toHaveText(/Summarize with AI/);
    expectNoErrors(errors);
  });

  test('splits long documents into parts and combines them', async ({ app, errors }) => {
    await openAiSummary(app, 'available');
    await addFiles(app, [pdfFile('long-report.pdf', await makeProsePdf({ repeat: 14 }))]);
    await expect(app.getByText(/42 pages · [\d,]+ words/)).toBeVisible({ timeout: 20_000 });
    await app.getByTestId('primary-action').click();
    await expect(app.getByTestId('copy-summary')).toBeVisible({ timeout: 20_000 });
    const calls = await aiCalls(app);
    // Each part is summarized separately, then one streamed pass writes the final summary.
    expect(calls.filter((c) => c.startsWith('summarize:')).length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((c) => c.startsWith('stream:'))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('summarize:')).every((c) => Number(c.split(':')[1]) <= 6000 * 4)).toBe(true);
    await expect(app.getByTestId('summary-output').locator('li')).toHaveCount(4);
    expectNoErrors(errors);
  });

  test('offers a clearly labelled non-AI summary when the model is unavailable', async ({ app, errors }) => {
    await openAiSummary(app, 'unavailable');
    await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
    await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'unavailable');
    await expect(app.getByText('On-device AI isn’t available here')).toBeVisible();
    const primary = app.getByTestId('primary-action');
    await expect(primary).toHaveText(/Quick summary/);
    await expect(app.getByText('On-device AI isn’t available on this device.')).toBeVisible();
    await primary.click();
    const output = app.getByTestId('summary-output');
    await expect(output.locator('li').first()).toBeVisible();
    // Key sentences are copied verbatim from the document.
    await expect(output).toContainText('percent');
    await expect(app.getByText('Key sentences · not AI')).toBeVisible();
    await expect(app.getByText(/no AI was used/)).toBeVisible();
    await expect(app.getByRole('button', { name: 'Regenerate' })).toHaveCount(0);
    expect((await aiCalls(app)).some((c) => c.startsWith('stream:') || c.startsWith('summarize:'))).toBe(false);
    expectNoErrors(errors);
  });

  test('explains when the browser has no built-in AI and honours a page range', async ({ app, errors }) => {
    await openAiSummary(app, 'none');
    await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
    await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'no-api');
    await expect(app.getByText(/Chrome 138 or newer/)).toBeVisible();
    await app.getByRole('radiogroup', { name: 'Pages to summarize' }).getByRole('radio', { name: 'Range' }).click();
    await app.getByLabel('Pages', { exact: true }).fill('2');
    await expect(app.getByText(/summarizing 1 page/)).toBeVisible();
    await app.getByTestId('primary-action').click();
    const output = app.getByTestId('summary-output');
    await expect(output).toContainText('warehouse');
    await expect(output).not.toContainText('buyback');
    await expect(output).not.toContainText('Subscription renewals');
    expectNoErrors(errors);
  });

  test('warns when a PDF has no selectable text', async ({ app, errors }) => {
    await openAiSummary(app, 'available');
    await addFiles(app, [pdfFile('scan.pdf', await makeTextPdf({ pages: 2 }))]);
    await expect(app.getByText('No selectable text found')).toBeVisible();
    await expect(app.getByTestId('primary-action')).toBeDisabled();
    expectNoErrors(errors);
  });
});
