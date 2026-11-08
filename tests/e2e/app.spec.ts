import { addFiles, expect, expectNoErrors, openTool, pdfFile, settled, test } from './fixtures';
import { makeTextPdf } from '../helpers/fixtures';

test.describe('application shell', () => {
  test('home renders every tool and the privacy promise', async ({ app, errors }) => {
    await expect(app.locator('h1')).toHaveText('Everything you need to work with PDFs.');
    await expect(app.getByText('Powerful PDF tools. Completely free. Your files stay on your device.')).toBeVisible();
    await expect(app.locator('[data-testid^=tool-card-]')).toHaveCount(20);
    await app.getByLabel('Search tools').fill('jpg');
    await expect(app.getByTestId('tool-card-images-to-pdf')).toBeVisible();
    await expect(app.getByTestId('tool-card-merge')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('navigation reaches every section', async ({ app, errors }) => {
    for (const [label, heading] of [
      ['Organize PDF', 'Organize PDF'],
      ['Convert PDF', 'Convert PDF'],
      ['Edit PDF', 'Edit PDF'],
      ['Security', 'Security'],
      ['Unique AI', 'Unique AI'],
      ['Recent files', 'Recent files'],
      ['Settings', 'Settings'],
    ] as const) {
      await app.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }).click();
      await expect(app.locator('h1')).toHaveText(heading);
      await settled(app);
    }
    await app.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'About Unique PDF' }).click();
    await expect(app.getByText('Free PDF tools without subscriptions, watermarks or file uploads.')).toBeVisible();
    await app.evaluate(() => (location.hash = '#/privacy'));
    await expect(app.locator('h1')).toHaveText('Privacy');
    await app.evaluate(() => (location.hash = '#/does-not-exist'));
    await expect(app.getByText('Page not found')).toBeVisible();
    expectNoErrors(errors);
  });

  test('theme preference applies and persists', async ({ app, errors }) => {
    await app.evaluate(() => (location.hash = '#/settings'));
    const settings = app.getByRole('main');
    await settings.getByRole('radio', { name: 'Dark', exact: true }).click();
    await expect(app.locator('html')).toHaveClass(/dark/);
    await app.reload();
    await expect(app.locator('html')).toHaveClass(/dark/);
    await settings.getByRole('radio', { name: 'Light', exact: true }).click();
    await expect(app.locator('html')).not.toHaveClass(/dark/);
    expectNoErrors(errors);
  });

  test('sidebar theme switcher changes and stores the theme', async ({ app, errors }) => {
    const switcher = app.getByRole('radiogroup', { name: 'Theme' }).first();
    await switcher.getByRole('radio', { name: 'Dark theme' }).click();
    await expect(app.locator('html')).toHaveClass(/dark/);
    await expect(switcher.getByRole('radio', { name: 'Dark theme' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => app.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)))).toContain('"theme":"dark"');
    // No flash of the light theme: the dark class is set before the app's scripts have run.
    await app.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive') (window as unknown as { __darkEarly: boolean }).__darkEarly = document.documentElement.classList.contains('dark');
      });
    });
    await app.reload();
    expect(await app.evaluate(() => (window as unknown as { __darkEarly?: boolean }).__darkEarly)).toBe(true);
    await settled(app);
    await switcher.getByRole('radio', { name: 'Light theme' }).click();
    await expect(app.locator('html')).not.toHaveClass(/dark/);
    expectNoErrors(errors);
  });

  test('command palette finds and opens tools from the keyboard', async ({ app, errors }) => {
    await app.keyboard.press('Control+K');
    const input = app.getByTestId('command-input');
    await expect(input).toBeFocused();
    await input.fill('compress');
    await expect(app.getByRole('option').first()).toContainText('Compress PDF');
    await app.keyboard.press('Enter');
    await expect(app.locator('h1')).toHaveText('Compress PDF');
    await expect(input).toBeHidden();
    await settled(app);
    // The palette also opens from the sidebar search button and closes with Escape.
    await app.getByRole('button', { name: 'Search tools' }).click();
    await expect(input).toBeFocused();
    await input.fill('summ');
    await expect(app.getByRole('option').first()).toContainText('AI Summary');
    // Enter opens the best match even when it is in a later group (a page, not a tool).
    await input.fill('privacy');
    await expect(app.getByRole('option').first()).toContainText('Privacy');
    await app.keyboard.press('Enter');
    await expect(app.locator('h1')).toHaveText('Privacy');
    await settled(app);
    await app.keyboard.press('Control+K');
    await expect(input).toBeFocused();
    await app.keyboard.press('Escape');
    await expect(input).toBeHidden();
    expectNoErrors(errors);
  });

  test('history records tasks without content and can be cleared', async ({ app, errors }) => {
    await openTool(app, 'merge');
    await addFiles(app, [pdfFile('history-a.pdf', await makeTextPdf({ pages: 1 })), pdfFile('history-b.pdf', await makeTextPdf({ pages: 1 }))]);
    await app.getByTestId('primary-action').click();
    await expect(app.getByTestId('result-panel')).toBeVisible();
    await app.evaluate(() => (location.hash = '#/recent'));
    await expect(app.getByText('history-a.pdf, history-b.pdf', { exact: false })).toBeVisible();
    const stored = await app.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)));
    expect(stored).toContain('history-a.pdf');
    expect(stored).not.toContain('%PDF');
    await app.getByRole('button', { name: 'Clear history' }).click();
    await app.getByRole('dialog').getByRole('button', { name: 'Clear history' }).click();
    await expect(app.getByText('No recent tasks')).toBeVisible();
    await app.evaluate(() => (location.hash = '#/settings'));
    await app.getByTestId('clear-all-data').click();
    await app.getByRole('dialog').getByRole('button', { name: 'Clear' }).click();
    const after = await app.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
    expect(after).toEqual([]);
    expectNoErrors(errors);
  });

  test('popup offers quick access', async ({ extContext, extensionId }) => {
    const popup = await extContext.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByTestId('popup-open-app')).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Merge PDF' })).toBeVisible();
    const opened = extContext.waitForEvent('page');
    await popup.getByRole('button', { name: 'Compress PDF' }).click();
    const tab = await opened;
    await expect(tab).toHaveURL(/app\.html#\/tool\/compress/);
    await tab.close();
  });

  test('options page opens settings', async ({ extContext, extensionId }) => {
    const page = await extContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page).toHaveURL(/app\.html#\/settings/);
    await expect(page.locator('h1')).toHaveText('Settings');
    await page.close();
  });

  test('leaving a tool with files asks for confirmation', async ({ app }) => {
    await openTool(app, 'split');
    await addFiles(app, [pdfFile('guard.pdf', await makeTextPdf({ pages: 2 }))]);
    await expect(app.getByTestId('page-card')).toHaveCount(2);
    await app.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
    const dialog = app.getByRole('dialog');
    await expect(dialog.getByText('Leave this tool?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(app.locator('h1')).toHaveText('Split PDF');
    await app.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
    await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
    await expect(app.locator('h1')).toHaveText('Everything you need to work with PDFs.');
  });
});
