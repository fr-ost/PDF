import { addFiles, expect, expectNoErrors, openTool, pdfFile, test } from './fixtures';
import { makeTextPdf } from '../helpers/fixtures';

test.describe('application shell', () => {
  test('home renders every tool and the privacy promise', async ({ app, errors }) => {
    await expect(app.locator('h1')).toHaveText('Everything you need to work with PDFs.');
    await expect(app.getByText('Powerful PDF tools. Completely free. Your files stay on your device.')).toBeVisible();
    await expect(app.locator('[data-testid^=tool-card-]')).toHaveCount(18);
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
      ['Recent files', 'Recent files'],
      ['Settings', 'Settings'],
    ] as const) {
      await app.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }).click();
      await expect(app.locator('h1')).toHaveText(heading);
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
    await app.getByRole('radio', { name: /Dark/ }).click();
    await expect(app.locator('html')).toHaveClass(/dark/);
    await app.reload();
    await expect(app.locator('html')).toHaveClass(/dark/);
    await app.getByRole('radio', { name: /Light/ }).click();
    await expect(app.locator('html')).not.toHaveClass(/dark/);
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
