/**
 * Playwright fixtures that load the production build (dist/) as an unpacked
 * extension in Chromium and provide helpers for driving tools and checking
 * the files they produce.
 */
import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '../../dist');

export interface FileSpec {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

type WorkerFixtures = { extContext: BrowserContext; extensionId: string };
type TestFixtures = { app: Page; errors: string[] };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  extContext: [
    async ({}, use) => {
      if (!existsSync(join(DIST, 'manifest.json'))) throw new Error('Run "npm run build" before the E2E tests.');
      const userDir = mkdtempSync(join(tmpdir(), 'unique-pdf-e2e-'));
      const context = await chromium.launchPersistentContext(userDir, {
        channel: 'chromium',
        headless: true,
        acceptDownloads: true,
        viewport: { width: 1360, height: 900 },
        args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
      });
      await use(context);
      await context.close();
      rmSync(userDir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
  extensionId: [
    async ({ extContext }, use) => {
      let [sw] = extContext.serviceWorkers();
      if (!sw) sw = await extContext.waitForEvent('serviceworker', { timeout: 20_000 });
      // On first install the extension opens its welcome tab. Wait for it and
      // verify it, then close it so it doesn't push test tabs into the
      // background (where Chrome throttles rendering to 1 fps).
      const isApp = (p: Page) => p.url().includes('/app.html');
      const welcome = extContext.pages().find(isApp) ?? (await extContext.waitForEvent('page', { predicate: isApp, timeout: 10_000 }).catch(() => undefined));
      if (!welcome) throw new Error('The welcome tab was not opened on install.');
      await welcome.close();
      await use(new URL(sw.url()).host);
    },
    { scope: 'worker' },
  ],
  errors: async ({}, use) => {
    await use([]);
  },
  app: async ({ extContext, extensionId, errors }, use) => {
    const page = await extContext.newPage();
    await page.bringToFront();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
    });
    // Count any network request that leaves the extension (there must be none).
    page.on('request', (r) => {
      const url = r.url();
      if (!url.startsWith('chrome-extension://') && !url.startsWith('blob:') && !url.startsWith('data:')) errors.push(`external request: ${url}`);
    });
    await page.goto(`chrome-extension://${extensionId}/app.html#/`);
    await expect(page.locator('h1')).toBeVisible();
    await use(page);
    await page.close();
  },
});

export { expect };

export async function openTool(page: Page, id: string): Promise<void> {
  await page.evaluate((hash) => (location.hash = hash), `#/tool/${id}`);
  await expect(page.locator('[data-testid=dropzone]')).toBeVisible();
}

export async function addFiles(page: Page, files: FileSpec[]): Promise<void> {
  await page.setInputFiles('[data-testid=file-input]', files);
}

export function pdfFile(name: string, bytes: Uint8Array): FileSpec {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) };
}

export async function runPrimary(page: Page): Promise<void> {
  const button = page.getByTestId('primary-action');
  await expect(button).toBeEnabled();
  await button.click();
}

/** Clicks the single-file Download button and returns the saved bytes. */
export async function downloadResult(page: Page, testId = 'download-button'): Promise<{ name: string; bytes: Uint8Array }> {
  await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) };
}

export async function waitForPages(page: Page, count: number): Promise<void> {
  await expect(page.getByTestId('page-card')).toHaveCount(count, { timeout: 30_000 });
}

export function expectNoErrors(errors: string[]): void {
  expect(errors, errors.join('\n')).toEqual([]);
}
