import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { addFiles, downloadResult, expect, expectNoErrors, openTool, pdfFile, runPrimary, test } from './fixtures';
import { makeTextPdf } from '../helpers/fixtures';
import { extractText, openWithPdfjs } from '../helpers/pdfjs';
import { protectPdf, ALL_PERMISSIONS } from '../../src/pdf/engines/security';

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures', name)));

test.describe('security tools', () => {
  test('protect encrypts so the file needs the password', async ({ app, errors }) => {
    await openTool(app, 'protect');
    await addFiles(app, [pdfFile('payroll.pdf', await makeTextPdf({ pages: 1, label: 'Salary' }))]);
    await app.getByTestId('password').fill('Corr3ct-Horse!');
    await app.getByTestId('password-confirm').fill('Corr3ct-Horse');
    await expect(app.getByText('Passwords don’t match.')).toBeVisible();
    await expect(app.getByTestId('primary-action')).toBeDisabled();
    await app.getByTestId('password-confirm').fill('Corr3ct-Horse!');
    await runPrimary(app);
    const out = await downloadResult(app);
    expect(out.name).toBe('payroll-protected.pdf');
    await expect(openWithPdfjs(out.bytes)).rejects.toMatchObject({ name: 'PasswordException' });
    expect((await extractText(out.bytes, 'Corr3ct-Horse!'))[0]).toContain('Salary 1');
    // The password field is cleared after use.
    await app.getByRole('button', { name: 'Back to options' }).click();
    await expect(app.getByTestId('password')).toHaveValue('');
    expectNoErrors(errors);
  });

  test('unlock asks for the password, rejects a wrong one and removes protection', async ({ app, errors }) => {
    const locked = await protectPdf({ bytes: await makeTextPdf({ pages: 1, label: 'Locked' }), name: 'l.pdf' }, { userPassword: 'open-me', permissions: ALL_PERMISSIONS });
    await openTool(app, 'unlock');
    await addFiles(app, [pdfFile('locked.pdf', locked)]);
    const dialog = app.getByRole('dialog');
    await expect(dialog.getByText('Password required')).toBeVisible();
    await dialog.getByLabel('Password').fill('nope');
    await dialog.getByRole('button', { name: 'Open' }).click();
    await expect(dialog.getByText('Incorrect password. Try again.')).toBeVisible();
    await dialog.getByLabel('Password').fill('open-me');
    await dialog.getByRole('button', { name: 'Open' }).click();
    await expect(app.getByText('Password accepted')).toBeVisible();
    await runPrimary(app);
    const out = await downloadResult(app);
    const doc = await PDFDocument.load(out.bytes);
    expect(doc.isEncrypted).toBe(false);
    expect((await extractText(out.bytes))[0]).toContain('Locked 1');
    expectNoErrors(errors);
  });

  test('unlock requires the owner password for restriction-only files', async ({ app }) => {
    await openTool(app, 'unlock');
    await addFiles(app, [pdfFile('restricted.pdf', fixture('pypdf-owner-only.pdf'))]);
    await expect(app.getByText('Restrictions set by the author')).toBeVisible();
    await expect(app.getByTestId('primary-action')).toBeDisabled();
    await app.getByLabel('Owner password').fill('wrong');
    await runPrimary(app);
    await expect(app.getByTestId('error-message')).toContainText('password');
    await app.getByLabel('Owner password').fill('owner456');
    await runPrimary(app);
    const out = await downloadResult(app);
    expect((await PDFDocument.load(out.bytes)).isEncrypted).toBe(false);
  });

  test('encrypted input works in other tools after entering the password', async ({ app, errors }) => {
    const locked = await protectPdf({ bytes: await makeTextPdf({ pages: 3 }), name: 'l.pdf' }, { userPassword: 'pw', permissions: ALL_PERMISSIONS });
    await openTool(app, 'rotate');
    await addFiles(app, [pdfFile('secret.pdf', locked)]);
    await app.getByRole('dialog').getByLabel('Password').fill('pw');
    await app.getByRole('dialog').getByRole('button', { name: 'Open' }).click();
    await expect(app.getByTestId('page-card')).toHaveCount(3);
    await app.getByRole('button', { name: 'Rotate 180°' }).click();
    await runPrimary(app);
    const out = await downloadResult(app);
    expect((await extractText(out.bytes)).length).toBe(3);
    expectNoErrors(errors);
  });

  test('redaction removes searched text and verifies the result', async ({ app, errors }) => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Customer: Jane Example', { x: 60, y: 760, size: 16, font });
    page.drawText('IBAN DE89 3704 0044 0532 0130 00', { x: 60, y: 700, size: 16, font });
    page.drawText('Thank you for your business', { x: 60, y: 640, size: 16, font });
    doc.addPage([595, 842]).drawText('Appendix without secrets', { x: 60, y: 760, size: 16, font });
    doc.setAuthor('Jane Example');
    await openTool(app, 'redact');
    await addFiles(app, [pdfFile('statement.pdf', await doc.save())]);
    await expect(app.getByTestId('redact-overlay')).toBeVisible();
    await app.getByLabel('Find text to redact').fill('DE89 3704');
    await app.getByRole('button', { name: 'Search' }).click();
    await expect(app.getByTestId('search-results')).toContainText('1 match on 1 page');
    await app.getByRole('button', { name: 'Mark all' }).click();
    await expect(app.getByTestId('redaction-box')).toHaveCount(1);
    // Also draw a manual box over the customer line.
    const box = (await app.getByTestId('redact-overlay').boundingBox())!;
    const sx = box.width / 595;
    await app.mouse.move(box.x + 50 * sx, box.y + 62 * sx);
    await app.mouse.down();
    await app.mouse.move(box.x + 300 * sx, box.y + 90 * sx, { steps: 4 });
    await app.mouse.up();
    await expect(app.getByTestId('redaction-box')).toHaveCount(2);
    await runPrimary(app);
    await app.getByRole('dialog').getByRole('button', { name: 'Redact' }).click();
    await expect(app.getByText('Verified')).toBeVisible({ timeout: 60_000 });
    const out = await downloadResult(app);
    const text = await extractText(out.bytes);
    expect(text[0]).not.toContain('DE89');
    expect(text[0]).not.toContain('Jane');
    expect(text[0]).toContain('Thank you for your business');
    expect(text[1]).toContain('Appendix without secrets');
    expect((await PDFDocument.load(out.bytes, { updateMetadata: false })).getAuthor()).toBeUndefined();
    expectNoErrors(errors);
  });

  test('metadata can be edited and removed', async ({ app, errors }) => {
    await openTool(app, 'metadata');
    await addFiles(app, [pdfFile('paper.pdf', await makeTextPdf({ pages: 2, label: 'Draft title' }))]);
    await expect(app.getByLabel('Title')).toHaveValue('Draft title');
    await app.getByLabel('Title').fill('Final Report 2026');
    await app.getByLabel('Author').fill('Unique Labs QA');
    await runPrimary(app);
    await expect(app.getByTestId('metadata-table')).toContainText('Final Report 2026');
    const out = await downloadResult(app);
    const saved = await PDFDocument.load(out.bytes, { updateMetadata: false });
    expect(saved.getTitle()).toBe('Final Report 2026');
    expect(saved.getAuthor()).toBe('Unique Labs QA');

    await app.getByTestId('start-over').click();
    await addFiles(app, [pdfFile('paper.pdf', out.bytes)]);
    await expect(app.getByLabel('Title')).toHaveValue('Final Report 2026');
    await app.getByRole('button', { name: 'Remove all metadata' }).click();
    await app.getByRole('dialog').getByRole('button', { name: 'Remove metadata' }).click();
    const clean = await downloadResult(app);
    const stripped = await PDFDocument.load(clean.bytes, { updateMetadata: false });
    expect(stripped.getTitle()).toBeUndefined();
    expect(stripped.getAuthor()).toBeUndefined();
    expectNoErrors(errors);
  });
});
