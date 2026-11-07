import { addFiles, expect, openTool, pdfFile, test, waitForPages } from './fixtures';
import { makeTextPdf } from '../helpers/fixtures';

async function dropFiles(page: import('@playwright/test').Page, selector: string, files: { name: string; type: string; bytes: number[] }[]) {
  const dataTransfer = await page.evaluateHandle((list) => {
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
    return dt;
  }, files);
  await page.dispatchEvent(selector, 'dragenter', { dataTransfer });
  await page.dispatchEvent(selector, 'dragover', { dataTransfer });
  await page.dispatchEvent(selector, 'drop', { dataTransfer });
}

test.describe('file handling and errors', () => {
  test('rejects files that are not PDFs, even with a .pdf name', async ({ app }) => {
    await openTool(app, 'merge');
    await addFiles(app, [{ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html><script>alert(1)</script></html>') }]);
    await expect(app.getByText('“fake.pdf” was not added')).toBeVisible();
    await expect(app.getByText('This doesn’t look like a PDF file.')).toBeVisible();
    await expect(app.getByTestId('file-tile')).toHaveCount(0);
  });

  test('rejects empty files', async ({ app }) => {
    await openTool(app, 'split');
    await addFiles(app, [{ name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) }]);
    await expect(app.getByText('The file is empty.')).toBeVisible();
  });

  test('shows a clear error for a damaged PDF', async ({ app }) => {
    const good = await makeTextPdf({ pages: 2 });
    const broken = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from(good.slice(400, 900))]);
    await openTool(app, 'merge');
    await addFiles(app, [pdfFile('broken.pdf', broken), pdfFile('good.pdf', good)]);
    await expect(app.getByTestId('file-tile')).toHaveCount(2);
    await expect(app.getByTestId('file-tile').first()).toContainText(/damaged|could not|invalid/i);
    await expect(app.getByTestId('primary-action')).toBeDisabled();
    await app.getByRole('button', { name: 'Remove broken.pdf' }).click();
    await expect(app.getByTestId('file-tile')).toHaveCount(1);
  });

  test('accepts files dropped on the drop zone', async ({ app }) => {
    await openTool(app, 'split');
    await dropFiles(app, '[data-testid=dropzone]', [{ name: 'dropped.pdf', type: 'application/pdf', bytes: Array.from(await makeTextPdf({ pages: 3 })) }]);
    await waitForPages(app, 3);
  });

  test('dropping a PDF on a tool card opens that tool with the file', async ({ app }) => {
    await dropFiles(app, '[data-testid=tool-card-rotate]', [{ name: 'card.pdf', type: 'application/pdf', bytes: Array.from(await makeTextPdf({ pages: 2 })) }]);
    await expect(app.locator('h1')).toHaveText('Rotate PDF');
    await waitForPages(app, 2);
  });

  test('dropping images on the home screen opens Images to PDF', async ({ app }) => {
    const png = await app.evaluate(async () => {
      const c = new OffscreenCanvas(20, 20);
      c.getContext('2d')!.fillRect(0, 0, 20, 20);
      return Array.from(new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()));
    });
    await dropFiles(app, '[data-testid=dropzone]', [{ name: 'a.png', type: 'image/png', bytes: png }]);
    await expect(app.locator('h1')).toHaveText('Images to PDF');
    await expect(app.getByTestId('file-tile')).toHaveCount(1);
  });

  test('dropping one PDF on the home screen suggests tools', async ({ app }) => {
    await dropFiles(app, '[data-testid=dropzone]', [{ name: 'q.pdf', type: 'application/pdf', bytes: Array.from(await makeTextPdf({ pages: 1 })) }]);
    await expect(app.getByText('What would you like to do with “q.pdf”?')).toBeVisible();
    await app.getByTestId('choose-compress').click();
    await expect(app.locator('h1')).toHaveText('Compress PDF');
  });
});

test('warns before modifying a digitally signed PDF', async ({ app }) => {
  const { makeSignedFieldPdf } = await import('../helpers/fixtures');
  await openTool(app, 'rotate');
  await addFiles(app, [pdfFile('signed.pdf', await makeSignedFieldPdf())]);
  await expect(app.getByTestId('signed-warning')).toBeVisible();
});

test('does not warn for ordinary PDFs', async ({ app }) => {
  await openTool(app, 'rotate');
  await addFiles(app, [pdfFile('plain.pdf', await makeTextPdf({ pages: 1 }))]);
  await expect(app.getByTestId('page-card')).toHaveCount(1);
  await expect(app.getByTestId('signed-warning')).toHaveCount(0);
});
