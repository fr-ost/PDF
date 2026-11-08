import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { addFiles, expect, expectNoErrors, openTool, pdfFile, test } from './fixtures';
import { installFakeLanguageModel, lmCalls } from './fakeAi';
import { makeProsePdf, makeTextPdf } from '../helpers/fixtures';

/**
 * Chat with PDF runs on Chrome's Prompt API. Headless Chromium has no model,
 * so these tests install a deterministic stand-in with the same API shape
 * (see fakeAi.ts) and drive the real interface against it.
 */
async function openChat(app: Page, availability: Parameters<typeof installFakeLanguageModel>[1]) {
  await installFakeLanguageModel(app, availability);
  await app.reload();
  await openTool(app, 'ai-chat');
}

async function ask(app: Page, question: string) {
  const input = app.getByTestId('chat-input');
  await expect(input).toBeEnabled();
  await input.fill(question);
  await input.press('Enter');
}

const lastAnswer = (app: Page) => app.getByTestId('chat-assistant-message').last();

test.describe('Chat with PDF', () => {
  test('answers with clickable page citations, follows up, copies, exports and resets', async ({ app, errors }) => {
    await openChat(app, 'available');
    await addFiles(app, [pdfFile('annual-report.pdf', await makeProsePdf())]);
    await expect(app.getByTestId('chat-welcome')).toContainText('annual-report.pdf');
    await expect(app.getByTestId('chat-status-line')).toHaveText(/Ready/);
    await expect(app.getByTestId('chat-suggestion').first()).toBeEnabled();

    await ask(app, 'How many warehouses were merged?');
    await expect(app.getByTestId('chat-user-message')).toHaveText('How many warehouses were merged?');
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'done');
    await expect(lastAnswer(app).getByTestId('chat-answer')).toContainText('Two regional warehouses were merged');
    const citation = lastAnswer(app).getByTestId('citation').first();
    await expect(citation).toHaveAttribute('data-page', '2');
    await expect(lastAnswer(app).getByTestId('chat-sources')).toContainText('Page 2');

    // The citation brings the page into view in the page rail.
    await citation.click();
    await expect(app.locator('[data-rail-page="2"]')).toHaveAttribute('data-active', 'true');
    await expect(app.locator('[data-rail-page="2"]')).toBeInViewport();

    // What the model received: the question and page-labelled excerpts.
    let prompt = (await lmCalls(app)).at(-1)!;
    expect(prompt).toContain('Question: How many warehouses were merged?');
    expect(prompt).toMatch(/^\[p\. 2\] [^\n]*Operating costs fell/m);

    // Follow-ups carry the conversation.
    await ask(app, 'And what are the main risks?');
    await expect(app.getByTestId('chat-assistant-message')).toHaveCount(2);
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'done');
    await expect(lastAnswer(app)).toContainText('main risks are supplier concentration');
    await expect(lastAnswer(app).getByTestId('citation').first()).toHaveAttribute('data-page', '3');
    prompt = (await lmCalls(app)).at(-1)!;
    expect(prompt).toContain('User: How many warehouses were merged?');

    // Copy gives plain text with the page reference.
    await app.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async (text: string) => {
          (window as unknown as { __copied: string }).__copied = text;
        },
      });
    });
    await lastAnswer(app).getByTestId('chat-copy').click();
    await expect(lastAnswer(app).getByTestId('chat-copy')).toHaveText(/Copied/);
    const copied = await app.evaluate(() => (window as unknown as { __copied: string }).__copied);
    expect(copied).toContain('main risks are supplier concentration');
    expect(copied).toContain('[p. 3]');
    expect(copied).not.toContain('**');

    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('chat-export').click()]);
    expect(download.suggestedFilename()).toBe('annual-report-chat.md');
    const markdown = readFileSync(await download.path(), 'utf8');
    expect(markdown).toContain('# Chat about annual-report.pdf');
    expect(markdown).toContain('**You:** How many warehouses were merged?');
    expect(markdown).toContain('**Unique AI:** According to the document');

    await app.getByTestId('chat-new').click();
    await expect(app.getByTestId('chat-welcome')).toBeVisible();
    await expect(app.getByTestId('chat-assistant-message')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('suggested questions, stopping an answer and regenerating', async ({ app, errors }) => {
    await openChat(app, 'available');
    await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
    const suggestion = app.getByTestId('chat-suggestion').first();
    await expect(suggestion).toBeEnabled();
    const text = (await suggestion.textContent())!.trim();
    await suggestion.click();
    await expect(app.getByTestId('chat-user-message')).toHaveText(text);
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'done');

    await ask(app, 'SLOW: tell me everything');
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'streaming');
    await app.getByTestId('chat-stop').click();
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'stopped');
    await expect(lastAnswer(app)).toContainText('Stopped');
    await expect(app.getByTestId('chat-send')).toBeVisible();

    await lastAnswer(app).getByTestId('chat-regenerate').click();
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'streaming');
    await app.getByTestId('chat-input').press('Escape');
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'stopped');
    await expect(app.getByTestId('chat-assistant-message')).toHaveCount(2);
    expectNoErrors(errors);
  });

  test('sets up Unique AI on the first question, with progress', async ({ app, errors }) => {
    await openChat(app, 'downloadable');
    await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
    await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'downloadable');
    await expect(app.getByText('One-time setup')).toBeVisible();
    await expect(app.getByTestId('chat-status-line')).toHaveText(/first question/);
    await ask(app, 'What did the board approve?');
    await expect(app.getByTestId('chat-thinking')).toContainText('Setting up Unique AI');
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'done', { timeout: 15_000 });
    await expect(lastAnswer(app)).toContainText('share buyback');
    await expect(app.getByTestId('chat-status-line')).toHaveText(/Ready/);
    expectNoErrors(errors);
  });

  test('finds the right pages in long documents', async ({ app, errors }) => {
    await openChat(app, 'available');
    await addFiles(app, [pdfFile('long-report.pdf', await makeProsePdf({ repeat: 14 }))]);
    await expect(app.getByTestId('chat-indexing')).toBeHidden({ timeout: 20_000 });
    await ask(app, 'What share buyback did the board approve?');
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'done', { timeout: 15_000 });
    await expect(lastAnswer(app)).toContainText('share buyback of 40 million');
    const page = Number(await lastAnswer(app).getByTestId('citation').first().getAttribute('data-page'));
    expect(page % 3).toBe(0); // buyback sentences are on every third page
    const prompt = (await lmCalls(app)).at(-1)!;
    expect(prompt).toContain('the passages most relevant to the question');
    expect(prompt.length / 4).toBeLessThanOrEqual(6000 * 0.62);
    expect(prompt.match(/^\[p\. \d+\]/gm)!.length).toBeLessThan(42);
    expectNoErrors(errors);
  });

  test('searches the document without AI where Unique AI is unavailable', async ({ app, errors }) => {
    await openChat(app, 'unavailable');
    await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
    await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'unavailable');
    await expect(app.getByTestId('chat-status-line')).toHaveText('Search mode');
    await expect(app.getByTestId('chat-input')).toHaveAttribute('placeholder', 'Search this document…');
    await ask(app, 'warehouse consolidation');
    await expect(lastAnswer(app)).toContainText('Best matches · not AI');
    await expect(lastAnswer(app).getByTestId('chat-results')).toContainText('warehouse consolidation');
    await expect(lastAnswer(app).getByTestId('citation').first()).toHaveAttribute('data-page', '2');
    await expect(lastAnswer(app).locator('mark').first()).toBeVisible();
    expect(await lmCalls(app)).toEqual([]);
    expectNoErrors(errors);
  });

  test('without the API, chat works as search; scanned PDFs are explained', async ({ app, errors }) => {
    await openChat(app, 'none');
    await addFiles(app, [pdfFile('scan.pdf', await makeTextPdf({ pages: 2 }))]);
    await expect(app.getByText('No selectable text found')).toBeVisible();
    await expect(app.getByTestId('chat-input')).toBeDisabled();
    expectNoErrors(errors);
  });

  test('a reply language this device lacks falls back, and the picker keeps focus', async ({ app, errors }) => {
    await installFakeLanguageModel(app, 'available', { unavailableLanguages: ['ja'] });
    await app.reload();
    await openTool(app, 'ai-chat');
    await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
    const picker = app.getByRole('combobox', { name: 'Reply language' });
    await expect(picker).toBeVisible();
    await picker.focus();
    await picker.selectOption('es');
    await expect(app.getByTestId('chat-status-line')).toHaveText('Ready');
    await expect(picker).toHaveValue('es');
    await expect(picker).toBeFocused();
    await picker.selectOption('ja');
    await expect(app.getByText('Unique AI can’t reply in 日本語 on this device yet.')).toBeVisible();
    await expect(picker).toHaveValue('es');
    await expect(app.getByTestId('chat-status-line')).toHaveText('Ready');
    await expect(picker).toBeFocused();
    await ask(app, 'How many warehouses were merged?');
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'done');
    expect((await lmCalls(app)).length).toBeGreaterThan(0);
    expectNoErrors(errors);
  });

  test('on small screens a citation opens the page preview', async ({ app, errors }) => {
    await app.setViewportSize({ width: 390, height: 844 });
    await openChat(app, 'available');
    await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
    await expect(app.getByTestId('document-rail')).toBeHidden();
    await ask(app, 'How many warehouses were merged?');
    await expect(lastAnswer(app)).toHaveAttribute('data-status', 'done');
    await lastAnswer(app).getByTestId('citation').first().click();
    const dialog = app.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Page 2' })).toBeVisible();
    await expect(dialog.getByTestId('page-preview')).toContainText('warehouses were merged');
    // The page image is shown, at a real size.
    const image = dialog.getByTestId('page-preview').locator('img');
    await expect(image).toBeVisible();
    expect((await image.boundingBox())!.width).toBeGreaterThan(150);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    expectNoErrors(errors);
  });
});
