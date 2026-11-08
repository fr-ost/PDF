/**
 * Accessibility checks with axe-core (WCAG 2.0/2.1/2.2 A and AA, plus axe's
 * best-practice rules) across the app's pages, tool workspaces, results,
 * errors, dialogs, the phone layout and the toolbar popup, in light and dark
 * themes. axe is injected with page.evaluate, which the extension's CSP does
 * not apply to; nothing is loaded from the network.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { addFiles, expect, openTool, pdfFile, runPrimary, settled, test } from './fixtures';
import { installFakeLanguageModel, installFakeSummarizer } from './fakeAi';
import { makeImagePdf, makeProsePdf, makeTextPdf } from '../helpers/fixtures';
import { ALL_PERMISSIONS, protectPdf } from '../../src/pdf/engines/security';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const RULE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const THEMES = ['Light theme', 'Dark theme'] as const;
const ownerOnly = () => new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures', 'pypdf-owner-only.pdf')));

interface Violation {
  rule: string;
  impact: string | null;
  help: string;
  nodes: { target: string; why: string }[];
}

/** Runs axe on the page as it is now and records any violation (soft, so one run reports every failing state). */
async function expectAccessible(page: Page, state: string): Promise<void> {
  // Let entrance animations and colour transitions finish first: axe would read a
  // half-faded element as low contrast. Looping animations are left running.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
      new Promise((done) => setTimeout(done, 3_000)),
    ]),
  );
  await page.evaluate(AXE);
  const found = await page.evaluate(async (tags) => {
    type Result = { violations: { id: string; impact: string | null; help: string; nodes: { target: string[]; failureSummary?: string }[] }[] };
    const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<Result> } }).axe;
    const result = await axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: tags } });
    return result.violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(' '), why: (n.failureSummary ?? '').split('\n').slice(0, 2).join(' ') })),
    }));
  }, RULE_TAGS);
  expect.soft(found as Violation[], `accessibility violations in "${state}"`).toEqual([]);
}

async function setTheme(page: Page, theme: (typeof THEMES)[number] | 'Match system theme', timeout?: number): Promise<void> {
  await page.getByRole('radiogroup', { name: 'Theme' }).first().getByRole('radio', { name: theme }).click({ timeout });
  await settled(page);
  await page.waitForTimeout(350); // colour transitions
}

/** Runs `check` once per theme. The theme is stored in the extension profile, which a worker's tests share, so it is always reset. */
async function inEachTheme(page: Page, check: (theme: string) => Promise<void>): Promise<void> {
  try {
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await check(theme);
    }
  } finally {
    if (!page.isClosed()) {
      await goHome(page).catch(() => undefined);
      await setTheme(page, 'Match system theme', 5_000).catch(() => undefined);
    }
  }
}

async function go(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => (location.hash = h), hash);
  await settled(page);
  await page.waitForTimeout(250);
}

/** Goes to the home page, confirming the “Leave” dialog when a tool still holds files. */
async function goHome(page: Page): Promise<void> {
  if (!page.url().includes('/app.html')) return;
  await page.evaluate(() => (location.hash = '#/'));
  const leave = page.getByRole('dialog').getByRole('button', { name: 'Leave' });
  const home = page.locator('h1', { hasText: 'Everything you need to work with PDFs.' });
  await expect(leave.or(home)).toBeVisible();
  if (await leave.isVisible()) await leave.click();
  await expect(home).toBeVisible();
  await settled(page);
}

test.describe('accessibility', () => {
  test('app pages and the command palette, light and dark', async ({ app }) => {
    test.setTimeout(240_000);
    await inEachTheme(app, async (theme) => {
      for (const hash of ['#/', '#/organize', '#/convert', '#/edit', '#/security', '#/ai', '#/settings', '#/recent', '#/about', '#/privacy', '#/no-such-page']) {
        await go(app, hash);
        await expectAccessible(app, `${theme}: ${hash}`);
      }
      await go(app, '#/');
      await app.keyboard.press('Control+K');
      await app.getByTestId('command-input').fill('pdf');
      await expectAccessible(app, `${theme}: command palette`);
      await app.keyboard.press('Escape');
    });
  });

  test('tool workspaces, results, errors and dialogs, light and dark', async ({ app }) => {
    test.setTimeout(300_000);
    await inEachTheme(app, async (theme) => {
      await openTool(app, 'organize');
      await addFiles(app, [pdfFile('a.pdf', await makeTextPdf({ pages: 3 })), pdfFile('b.pdf', await makeImagePdf())]);
      await expect(app.getByTestId('page-card')).toHaveCount(5);
      await app.getByTestId('page-card').nth(1).click();
      await expectAccessible(app, `${theme}: organize with a selection`);
      await app.evaluate(() => (location.hash = '#/'));
      await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).waitFor();
      await expectAccessible(app, `${theme}: leave dialog`);
      await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
      await settled(app);

      await openTool(app, 'protect');
      await addFiles(app, [pdfFile('payroll.pdf', await makeTextPdf({ pages: 1 }))]);
      await app.getByTestId('password').fill('Corr3ct-Horse!');
      await app.getByTestId('password-confirm').fill('Corr3ct');
      await expect(app.getByText('Passwords don’t match.')).toBeVisible();
      await expectAccessible(app, `${theme}: protect with a validation message`);
      await goHome(app);

      await openTool(app, 'unlock');
      await addFiles(app, [pdfFile('restricted.pdf', ownerOnly())]);
      await app.getByLabel('Owner password').fill('wrong');
      await runPrimary(app);
      await expect(app.getByTestId('error-message')).toBeVisible();
      await expectAccessible(app, `${theme}: error panel`);
      await goHome(app);

      const locked = await protectPdf({ bytes: await makeTextPdf({ pages: 1 }), name: 'l.pdf' }, { userPassword: 'open-me', permissions: ALL_PERMISSIONS });
      await openTool(app, 'rotate');
      await addFiles(app, [pdfFile('locked.pdf', locked)]);
      const dialog = app.getByRole('dialog');
      await dialog.getByLabel('Password').fill('nope');
      await dialog.getByRole('button', { name: 'Open' }).click();
      await expect(dialog.getByText('Incorrect password. Try again.')).toBeVisible();
      await expectAccessible(app, `${theme}: password dialog with an error`);
      await dialog.getByRole('button', { name: 'Remove file' }).click();
      await goHome(app);

      await openTool(app, 'compress');
      await addFiles(app, [pdfFile('photos.pdf', await makeImagePdf())]);
      await app.getByTestId('primary-action').click();
      await expect(app.getByTestId('compression-stats')).toBeVisible({ timeout: 90_000 });
      await expectAccessible(app, `${theme}: compress result`);
      await goHome(app);
    });
  });

  test('Unique AI chat and summary, light and dark', async ({ app }) => {
    test.setTimeout(240_000);
    await installFakeLanguageModel(app, 'available');
    await installFakeSummarizer(app, 'available');
    await app.reload();
    await inEachTheme(app, async (theme) => {
      await openTool(app, 'ai-chat');
      await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
      const input = app.getByTestId('chat-input');
      await expect(input).toBeEnabled();
      await expectAccessible(app, `${theme}: chat welcome`);
      await input.fill('How many warehouses were merged?');
      await input.press('Enter');
      await expect(app.getByTestId('chat-assistant-message').last()).toHaveAttribute('data-status', 'done');
      await expectAccessible(app, `${theme}: chat answer with citations`);
      await goHome(app);

      await openTool(app, 'ai-summary');
      await addFiles(app, [pdfFile('report.pdf', await makeProsePdf())]);
      await expect(app.getByTestId('ai-status')).toHaveAttribute('data-status', 'available');
      await app.getByTestId('primary-action').click();
      await expect(app.getByTestId('copy-summary')).toBeVisible();
      await expectAccessible(app, `${theme}: summary result`);
      await goHome(app);
    });
  });

  test('phone layout, navigation drawer and floating action bar', async ({ app }) => {
    await app.setViewportSize({ width: 390, height: 844 });
    await go(app, '#/');
    await expectAccessible(app, 'phone: home');
    await app.getByRole('button', { name: 'Open navigation' }).click();
    await expect(app.getByRole('navigation', { name: 'Main (menu)' })).toBeVisible();
    await expectAccessible(app, 'phone: navigation drawer');
    await app.getByRole('button', { name: 'Close navigation' }).click();
    await openTool(app, 'rotate');
    await addFiles(app, [pdfFile('long.pdf', await makeTextPdf({ pages: 12 }))]);
    await expect(app.getByTestId('floating-action')).toBeVisible();
    await expectAccessible(app, 'phone: tool with the floating action bar');
  });

  test('toolbar popup, light and dark', async ({ extContext, extensionId }) => {
    const popup = await extContext.newPage();
    await popup.setViewportSize({ width: 380, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByTestId('popup-open-app')).toBeVisible();
    await inEachTheme(popup, (theme) => expectAccessible(popup, `popup: ${theme}`));
    await popup.close();
  });
});
