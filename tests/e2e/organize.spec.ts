import { unzipSync } from 'fflate';
import { addFiles, downloadResult, expect, expectNoErrors, openTool, pdfFile, runPrimary, test, waitForPages } from './fixtures';
import { makeTextPdf } from '../helpers/fixtures';
import { extractText, pageInfo } from '../helpers/pdfjs';

const pageNumbers = (texts: string[]) => texts.map((t) => /Page (\d+)/.exec(t)?.[1]);

test.describe('organize tools', () => {
  test('merge combines files in the chosen order', async ({ app, errors }) => {
    await openTool(app, 'merge');
    await addFiles(app, [pdfFile('first.pdf', await makeTextPdf({ pages: 2, label: 'First' })), pdfFile('second.pdf', await makeTextPdf({ pages: 1, label: 'Second' }))]);
    await expect(app.getByTestId('file-tile')).toHaveCount(2);
    // Move "second.pdf" before "first.pdf" with the keyboard-accessible button.
    await app.getByRole('button', { name: 'Move second.pdf earlier' }).click();
    await runPrimary(app);
    const out = await downloadResult(app);
    expect(out.name).toBe('second-merged.pdf');
    const text = await extractText(out.bytes);
    expect(text).toHaveLength(3);
    expect(text[0]).toContain('Second 1');
    expect(text[2]).toContain('First 2');
    expectNoErrors(errors);
  });

  test('split every page produces a ZIP of single-page PDFs', async ({ app, errors }) => {
    await openTool(app, 'split');
    await addFiles(app, [pdfFile('report.pdf', await makeTextPdf({ pages: 4 }))]);
    await waitForPages(app, 4);
    await runPrimary(app);
    const zip = await downloadResult(app, 'download-all-button');
    expect(zip.name).toBe('report-split.zip');
    const files = unzipSync(zip.bytes);
    expect(Object.keys(files).sort()).toEqual(['report-page-1.pdf', 'report-page-2.pdf', 'report-page-3.pdf', 'report-page-4.pdf']);
    expect((await extractText(files['report-page-3.pdf']!))[0]).toContain('Page 3');
    expectNoErrors(errors);
  });

  test('split by custom ranges validates input', async ({ app, errors }) => {
    await openTool(app, 'split');
    await addFiles(app, [pdfFile('doc.pdf', await makeTextPdf({ pages: 5 }))]);
    await waitForPages(app, 5);
    await app.getByText('Custom ranges').click();
    const input = app.getByLabel('Ranges', { exact: true });
    await input.fill('1-9');
    await input.blur();
    await expect(app.getByText('Page 9 doesn’t exist — this document has 5 pages.').first()).toBeVisible();
    await input.fill('1-2, 3-5');
    await runPrimary(app);
    await expect(app.getByTestId('result-panel')).toBeVisible();
    await expect(app.getByRole('list', { name: 'Output files' }).getByRole('listitem')).toHaveCount(2);
    expectNoErrors(errors);
  });

  test('extract selected pages into one PDF', async ({ app, errors }) => {
    await openTool(app, 'extract');
    await addFiles(app, [pdfFile('book.pdf', await makeTextPdf({ pages: 6 }))]);
    await waitForPages(app, 6);
    await app.getByLabel('Pages to extract').fill('2, 5-6');
    await expect(app.locator('[data-testid=page-card][data-selected]')).toHaveCount(3);
    await runPrimary(app);
    const out = await downloadResult(app);
    expect(pageNumbers(await extractText(out.bytes))).toEqual(['2', '5', '6']);
    expectNoErrors(errors);
  });

  test('rotate selected pages', async ({ app, errors }) => {
    await openTool(app, 'rotate');
    await addFiles(app, [pdfFile('scan.pdf', await makeTextPdf({ pages: 3 }))]);
    await waitForPages(app, 3);
    await app.getByTestId('page-card').nth(1).click();
    await app.getByRole('button', { name: 'Right 90°' }).click();
    await runPrimary(app);
    const out = await downloadResult(app);
    expect((await pageInfo(out.bytes)).map((p) => p.rotation)).toEqual([0, 90, 0]);
    expectNoErrors(errors);
  });

  test('reorder pages (reverse)', async ({ app, errors }) => {
    await openTool(app, 'reorder');
    await addFiles(app, [pdfFile('order.pdf', await makeTextPdf({ pages: 3 }))]);
    await waitForPages(app, 3);
    await app.getByRole('button', { name: 'Reverse order' }).click();
    await runPrimary(app);
    const out = await downloadResult(app);
    expect(pageNumbers(await extractText(out.bytes))).toEqual(['3', '2', '1']);
    expectNoErrors(errors);
  });

  test('reorder pages by keyboard drag-and-drop', async ({ app, errors }) => {
    await openTool(app, 'reorder');
    await addFiles(app, [pdfFile('kbd.pdf', await makeTextPdf({ pages: 3 }))]);
    await waitForPages(app, 3);
    const first = app.getByTestId('page-card').first();
    await first.focus();
    await app.keyboard.press('Space');
    await expect(app.getByText(/1 · page 1 is over position 1 of 3/)).toBeAttached();
    await app.waitForTimeout(250); // dnd-kit starts listening for arrow keys on the next tick
    await app.keyboard.press('ArrowRight');
    await expect(app.getByText(/is over position 2 of 3/)).toBeAttached();
    await app.keyboard.press('Space');
    await expect(app.getByTestId('page-card').first()).toHaveAttribute('aria-label', /page 2/);
    await runPrimary(app);
    const out = await downloadResult(app);
    expect(pageNumbers(await extractText(out.bytes))).toEqual(['2', '1', '3']);
    expectNoErrors(errors);
  });

  test('reorder pages by dragging with the mouse', async ({ app, errors }) => {
    await openTool(app, 'reorder');
    await addFiles(app, [pdfFile('drag.pdf', await makeTextPdf({ pages: 3 }))]);
    await waitForPages(app, 3);
    const cards = app.getByTestId('page-card');
    const from = (await cards.nth(0).boundingBox())!;
    const to = (await cards.nth(2).boundingBox())!;
    await app.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await app.mouse.down();
    await app.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await app.mouse.move(to.x + to.width / 2 + 4, to.y + to.height / 2, { steps: 2 });
    await app.mouse.up();
    await expect(cards.last()).toHaveAttribute('aria-label', /page 1/);
    await runPrimary(app);
    const out = await downloadResult(app);
    expect(pageNumbers(await extractText(out.bytes))).toEqual(['2', '3', '1']);
    expectNoErrors(errors);
  });

  test('delete pages asks for confirmation', async ({ app, errors }) => {
    await openTool(app, 'delete-pages');
    await addFiles(app, [pdfFile('trim.pdf', await makeTextPdf({ pages: 4 }))]);
    await waitForPages(app, 4);
    await app.getByTestId('page-card').nth(0).click();
    await app.getByTestId('page-card').nth(2).click();
    await runPrimary(app);
    await expect(app.getByRole('dialog').getByText('Delete 2 pages?')).toBeVisible();
    await app.getByRole('dialog').getByRole('button', { name: 'Delete pages' }).click();
    const out = await downloadResult(app);
    expect(pageNumbers(await extractText(out.bytes))).toEqual(['2', '4']);
    expectNoErrors(errors);
  });

  test('organize combines and edits pages from two files', async ({ app, errors }) => {
    await openTool(app, 'organize');
    await addFiles(app, [pdfFile('a.pdf', await makeTextPdf({ pages: 2, label: 'A' })), pdfFile('b.pdf', await makeTextPdf({ pages: 2, label: 'B' }))]);
    await waitForPages(app, 4);
    await app.getByTestId('page-card').nth(1).hover();
    await app.getByRole('button', { name: 'Delete page 2' }).click();
    await waitForPages(app, 3);
    await app.getByTestId('page-card').nth(2).hover();
    await app.getByRole('button', { name: 'Rotate page 3' }).click();
    await runPrimary(app);
    const out = await downloadResult(app);
    const text = await extractText(out.bytes);
    expect(text.map((t) => /([AB]) (\d)/.exec(t)?.[0])).toEqual(['A 1', 'B 1', 'B 2']);
    expect((await pageInfo(out.bytes)).map((p) => p.rotation)).toEqual([0, 0, 90]);
    expectNoErrors(errors);
  });
});
