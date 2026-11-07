import { addFiles, downloadResult, expect, expectNoErrors, openTool, pdfFile, runPrimary, test } from './fixtures';
import { makeTextPdf } from '../helpers/fixtures';
import { extractText, renderPage } from '../helpers/pdfjs';

test.describe('edit tools', () => {
  test('editor adds text, a rectangle and undo/redo works', async ({ app, errors }) => {
    await openTool(app, 'edit');
    await addFiles(app, [pdfFile('form.pdf', await makeTextPdf({ pages: 2 }))]);
    const overlay = app.getByTestId('editor-overlay');
    await expect(overlay).toBeVisible();
    await app.waitForTimeout(300);

    await app.getByTestId('tool-text').click();
    const box = (await overlay.boundingBox())!;
    await app.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await app.getByTestId('text-editor').fill('Approved by QA');
    await app.getByTestId('text-editor').blur();
    await expect(app.getByTestId('object-text')).toHaveCount(1);

    await app.getByTestId('tool-rect').click();
    await app.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
    await app.mouse.down();
    await app.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 5 });
    await app.mouse.up();
    await expect(app.getByTestId('object-rect')).toHaveCount(1);

    await app.keyboard.press('Control+z');
    await expect(app.getByTestId('object-rect')).toHaveCount(0);
    await app.keyboard.press('Control+Shift+z');
    await expect(app.getByTestId('object-rect')).toHaveCount(1);

    await runPrimary(app);
    const out = await downloadResult(app);
    expect(out.name).toBe('form-edited.pdf');
    const text = await extractText(out.bytes);
    expect(text[0]).toContain('Approved by QA');
    expect(text[0]).toContain('Page 1'); // original content preserved
    // The rectangle outline (red) is drawn around 50–70% of the page.
    const page = await renderPage(out.bytes, 1, 2);
    let red = 0;
    for (let x = 595 * 0.47; x < 595 * 0.53; x += 0.5) {
      const [r, g, b] = page.pixel(x, 842 * 0.65);
      if (r > 180 && g < 100 && b < 100) red++;
    }
    expect(red).toBeGreaterThan(0);
    expectNoErrors(errors);
  });

  test('editor blocks characters the built-in fonts cannot save', async ({ app }) => {
    await openTool(app, 'edit');
    await addFiles(app, [pdfFile('x.pdf', await makeTextPdf({ pages: 1 }))]);
    const overlay = app.getByTestId('editor-overlay');
    await expect(overlay).toBeVisible();
    await app.getByTestId('tool-text').click();
    const box = (await overlay.boundingBox())!;
    await app.mouse.click(box.x + 80, box.y + 80);
    await app.getByTestId('text-editor').fill('Привет');
    await app.getByTestId('text-editor').blur();
    await expect(app.getByTestId('primary-action')).toBeDisabled();
    await expect(app.getByText('Some characters can’t be saved with the built-in fonts.')).toBeVisible();
  });

  test('sign PDF draws and places a signature', async ({ app, errors }) => {
    await openTool(app, 'sign');
    await addFiles(app, [pdfFile('contract.pdf', await makeTextPdf({ pages: 1 }))]);
    const pad = app.getByTestId('signature-pad');
    await expect(pad).toBeVisible();
    const b = (await pad.boundingBox())!;
    await app.mouse.move(b.x + 60, b.y + 120);
    await app.mouse.down();
    for (let i = 1; i <= 20; i++) await app.mouse.move(b.x + 60 + i * 15, b.y + 120 - Math.sin(i / 3) * 40);
    await app.mouse.up();
    await app.getByTestId('use-signature').click();
    await expect(app.getByTestId('object-signature')).toHaveCount(1);
    await runPrimary(app);
    const out = await downloadResult(app);
    expect(out.name).toBe('contract-signed.pdf');
    // Signature ink (near-black) is present around the page centre.
    const page = await renderPage(out.bytes, 1);
    let ink = 0;
    for (let x = 200; x < 400; x += 2) for (let y = 380; y < 460; y += 2) if (page.pixel(x, y)[0] < 90) ink++;
    expect(ink).toBeGreaterThan(10);
    expectNoErrors(errors);
  });

  test('watermark adds text to selected pages', async ({ app, errors }) => {
    await openTool(app, 'watermark');
    await addFiles(app, [pdfFile('memo.pdf', await makeTextPdf({ pages: 3 }))]);
    await app.getByLabel('Text', { exact: true }).fill('DRAFT COPY');
    await app.getByRole('radio', { name: 'Select pages' }).click();
    await app.getByRole('textbox', { name: 'Pages' }).fill('1, 3');
    await runPrimary(app);
    const out = await downloadResult(app);
    const text = await extractText(out.bytes);
    expect(text[0]).toContain('DRAFT COPY');
    expect(text[1]).not.toContain('DRAFT COPY');
    expect(text[2]).toContain('DRAFT COPY');
    expectNoErrors(errors);
  });

  test('page numbers skip the first page and use a custom format', async ({ app, errors }) => {
    await openTool(app, 'page-numbers');
    await addFiles(app, [pdfFile('thesis.pdf', await makeTextPdf({ pages: 4 }))]);
    await app.getByLabel('Format').selectOption('page-n-of-total');
    await app.getByRole('radio', { name: 'Skip first' }).click();
    await runPrimary(app);
    const out = await downloadResult(app);
    const text = await extractText(out.bytes);
    expect(text[0]).not.toContain('of 3');
    expect(text[1]).toContain('Page 1 of 3');
    expect(text[3]).toContain('Page 3 of 3');
    expectNoErrors(errors);
  });
});
