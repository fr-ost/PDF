/**
 * Optional usage stats: off by default, asked once after the first task, and
 * sent only to the tracker after the user opts in. The tracker is mocked.
 */
import type { Page, Route } from '@playwright/test';
import { addFiles, expect, expectNoErrors, openTool, pdfFile, test } from './fixtures';
import { makeTextPdf } from '../helpers/fixtures';

const TRACKER = 'https://unique-pdf.shahriarahmed614.workers.dev';

async function finishTask(app: Page): Promise<void> {
  await openTool(app, 'rotate');
  await addFiles(app, [pdfFile('private-contract.pdf', await makeTextPdf({ pages: 1 }))]);
  await expect(app.getByTestId('page-card')).toHaveCount(1);
  await app.getByRole('button', { name: 'Rotate 180°' }).click();
  await app.getByTestId('primary-action').click();
  await expect(app.getByTestId('result-panel')).toBeVisible();
}

const usageState = (app: Page) => app.evaluate(async () => (await chrome.storage.local.get('usageStats')).usageStats as { consent: string; id: string; asked: boolean; counts: { t: Record<string, number> } } | undefined);

test.describe('usage stats', () => {
  test.afterEach(async ({ app }) => {
    if (!app.isClosed()) await app.evaluate(() => chrome.storage.local.remove(['usageStats', 'reviewPrompt'])).catch(() => undefined);
  });

  test('nothing is sent by default, and "No thanks" keeps it that way', async ({ app, errors }) => {
    await finishTask(app);
    await app.goto(app.url().replace(/#.*$/, '#/'));
    const card = app.getByTestId('usage-stats-ask');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Help improve Unique PDF?' })).toBeVisible();
    await card.getByRole('button', { name: 'No thanks' }).click();
    await expect(card).toHaveCount(0);
    expect(await usageState(app)).toMatchObject({ consent: 'unset', asked: true, id: '' });
    await app.reload();
    await expect(app.locator('h1')).toBeVisible();
    await expect(app.getByTestId('usage-stats-ask')).toHaveCount(0);
    // The fixture records any request leaving the extension: there must be none.
    expectNoErrors(errors);
  });

  test('after opting in, only anonymous counts reach the tracker; turning it off stops it', async ({ app, errors }) => {
    const bodies: Record<string, unknown>[] = [];
    await app.context().route(`${TRACKER}/**`, async (route: Route) => {
      const req = route.request();
      if (req.method() === 'POST') bodies.push(JSON.parse(req.postData() ?? '{}'));
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' });
    });
    try {
      await finishTask(app);
      await app.goto(app.url().replace(/#.*$/, '#/'));
      await app.getByTestId('usage-stats-ask').getByRole('button', { name: 'Share anonymous stats' }).click();
      await expect(app.getByTestId('usage-stats-ask')).toHaveCount(0);
      await expect.poll(() => bodies.length).toBe(1);
      const install = bodies[0]!;
      expect(install).toMatchObject({ ev: 'install', v: expect.stringMatching(/^\d+\.\d+\.\d+$/), p: expect.any(String) });
      expect(install.id).toMatch(/^[a-f0-9]{32}$/);
      for (const key of Object.keys(install)) expect(['ev', 'id', 'v', 'p', 'l', 'ai', 'ag', 't', 'q', 'um']).toContain(key);
      expect(JSON.stringify(install)).not.toMatch(/private|contract|\.pdf/i);

      // A finished task is counted (sent with the next due event, not right away).
      await finishTask(app);
      await expect.poll(async () => (await usageState(app))?.counts.t.rotate).toBe(1);
      expect(bodies).toHaveLength(1);

      // The Settings switch shows the choice and turns it off.
      await app.goto(app.url().replace(/#.*$/, '#/settings'));
      const toggle = app.getByRole('switch', { name: /Share anonymous usage stats/ });
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await expect.poll(async () => (await usageState(app))?.consent).toBe('off');
      const off = (await usageState(app))!;
      expect(off.id).toBe('');
      expect(off.counts.t).toEqual({});
      await finishTask(app);
      expect((await usageState(app))!.counts.t).toEqual({});
      expect(bodies).toHaveLength(1);
      expectNoErrors(errors.filter((e) => !e.startsWith(`external request: ${TRACKER}/`)));
    } finally {
      await app.context().unroute(`${TRACKER}/**`);
    }
  });
});
