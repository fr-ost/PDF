/**
 * Donate page and the store-review prompt. A store install is simulated by
 * adding `update_url` to the manifest the page sees (stores add it on install;
 * the unpacked test build has none).
 */
import type { Page } from '@playwright/test';
import { addFiles, expect, expectNoErrors, openTool, pdfFile, settled, test } from './fixtures';
import { makeTextPdf } from '../helpers/fixtures';

const ADDRESSES = {
  evm: '0x257F291514AaAa1533832cC2C8981Cc14063ED17',
  sol: 'GwwZWYxzms9ebEWQNCAJrPSQdsN6SVPGbpMwCYomWqWa',
  btc: 'bc1qg6clyevlmfekg3rkyhlk5ggeh3g6dnt5sdje4j',
};

async function actAsStoreInstall(app: Page): Promise<void> {
  await app.addInitScript(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.getManifest) return;
    const real = chrome.runtime.getManifest.bind(chrome.runtime);
    chrome.runtime.getManifest = () => ({ ...real(), update_url: 'https://clients2.google.com/service/update2/crx' });
  });
}

const setReviewState = (app: Page, state: object) => app.evaluate((s) => chrome.storage.local.set({ reviewPrompt: s }), state);
const reviewState = (app: Page) => app.evaluate(async () => (await chrome.storage.local.get('reviewPrompt')).reviewPrompt as { tasks: number; nextAskAt: number; asked: number; done: boolean });

/** Rotates a one-page PDF and saves it: one finished task. */
async function finishTask(app: Page): Promise<void> {
  await openTool(app, 'rotate');
  await addFiles(app, [pdfFile('one.pdf', await makeTextPdf({ pages: 1 }))]);
  await expect(app.getByTestId('page-card')).toHaveCount(1);
  await app.getByRole('button', { name: 'Rotate 180°' }).click();
  await app.getByTestId('primary-action').click();
  await expect(app.getByTestId('result-panel')).toBeVisible();
}

test.describe('support', () => {
  test.afterEach(async ({ app }) => {
    // The extension profile is shared by the worker's tests.
    if (!app.isClosed()) await app.evaluate(() => chrome.storage.local.remove('reviewPrompt')).catch(() => undefined);
  });

  test('the Donate page lists the wallets with QR codes and copyable addresses', async ({ app, errors }) => {
    await app.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Donate' }).click();
    await expect(app.locator('h1')).toHaveText('Keep Unique PDF free for everyone');
    const wallets = app.getByTestId('wallet');
    await expect(wallets).toHaveCount(3);
    for (const [id, address] of Object.entries(ADDRESSES)) {
      const card = app.locator(`[data-testid=wallet][data-wallet=${id}]`);
      await expect(card.getByTestId('wallet-address')).toHaveText(address);
      const qrLoaded = await card.getByRole('img', { name: /QR code/ }).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
      expect(qrLoaded).toBe(true);
    }
    await app.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async (text: string) => {
          (window as unknown as { __copied: string }).__copied = text;
        },
      });
    });
    const solana = app.locator('[data-testid=wallet][data-wallet=sol]');
    await solana.getByRole('button', { name: /Copy address/ }).click();
    await expect(solana.getByRole('button', { name: /Copied/ })).toBeVisible();
    await expect(app.getByText('Solana address copied')).toBeVisible();
    expect(await app.evaluate(() => (window as unknown as { __copied: string }).__copied)).toBe(ADDRESSES.sol);
    // Links that leave the extension open in a new tab, without referrer.
    for (const link of await app.locator('main a[href^="https://"]').all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
    await expect(app.getByTestId('help-bug')).toHaveAttribute('href', 'https://t.me/igfrostt');
    // Without a store install there is no review link.
    await expect(app.getByTestId('help-rate')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('Donate is reachable from the command palette, the footer and the popup', async ({ app, extContext, extensionId, errors }) => {
    await app.keyboard.press('Control+K');
    await app.getByTestId('command-input').fill('donate');
    await app.keyboard.press('Enter');
    await expect(app.locator('h1')).toHaveText('Keep Unique PDF free for everyone');
    await settled(app);
    await app.evaluate(() => (location.hash = '#/'));
    await settled(app);
    await app.locator('footer').getByRole('link', { name: 'Donate' }).click();
    await expect(app).toHaveURL(/#\/donate$/);
    const popup = await extContext.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const opened = extContext.waitForEvent('page', { predicate: (p) => p.url().includes('app.html') }).catch(() => undefined);
    await popup.getByTestId('popup-donate').click();
    // The background focuses the open app tab (or opens one) at the Donate page.
    const tab = (await Promise.race([opened, new Promise<undefined>((r) => setTimeout(r, 3000))])) ?? app;
    await expect(tab).toHaveURL(/app\.html#\/donate/);
    if (tab !== app) await tab.close();
    expectNoErrors(errors);
  });

  test('store installs are asked for a 5-star review after a few finished tasks', async ({ app, extensionId, errors }) => {
    await actAsStoreInstall(app);
    await setReviewState(app, { tasks: 2, nextAskAt: 3, asked: 0, done: false });
    await app.reload();
    await expect(app.getByTestId('sidebar-rate')).toHaveAttribute('href', `https://chromewebstore.google.com/detail/${extensionId}/reviews`);
    await expect(app.getByTestId('review-prompt')).toHaveCount(0);
    await finishTask(app);
    const prompt = app.getByTestId('review-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('Enjoying Unique PDF?');
    await expect(prompt).toContainText('rate it 5 stars on the Chrome Web Store');
    const rate = prompt.getByTestId('review-rate');
    await expect(rate).toHaveAttribute('href', `https://chromewebstore.google.com/detail/${extensionId}/reviews`);
    await expect(rate).toHaveAttribute('target', '_blank');
    // "Maybe later" asks again only after many more tasks.
    await prompt.getByRole('button', { name: 'Maybe later' }).click();
    await expect(prompt).toBeHidden();
    expect(await reviewState(app)).toEqual({ tasks: 3, nextAskAt: 15, asked: 1, done: false });
    await app.reload();
    await app.waitForTimeout(1800);
    await expect(app.getByTestId('review-prompt')).toHaveCount(0);
    // "Don't ask again" is final.
    await setReviewState(app, { tasks: 15, nextAskAt: 15, asked: 1, done: false });
    await expect(app.getByTestId('review-prompt')).toBeVisible();
    await app.getByTestId('review-prompt').getByRole('button', { name: 'Don’t ask again' }).click();
    await expect(app.getByTestId('review-prompt')).toBeHidden();
    expect((await reviewState(app)).done).toBe(true);
    // The Donate page offers the review too.
    await app.evaluate(() => (location.hash = '#/donate'));
    await expect(app.getByTestId('help-rate')).toHaveAttribute('href', `https://chromewebstore.google.com/detail/${extensionId}/reviews`);
    expectNoErrors(errors);
  });

  test('unpacked copies never show the review prompt', async ({ app, errors }) => {
    await setReviewState(app, { tasks: 2, nextAskAt: 3, asked: 0, done: false });
    await finishTask(app);
    await app.waitForTimeout(2000);
    await expect(app.getByTestId('review-prompt')).toHaveCount(0);
    await expect(app.getByTestId('sidebar-rate')).toHaveCount(0);
    expect((await reviewState(app)).tasks).toBe(3);
    expectNoErrors(errors);
  });
});
