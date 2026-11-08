import { addFiles, expect, expectNoErrors, openTool, pdfFile, settled, test } from './fixtures';
import { makeTextPdf } from '../helpers/fixtures';
import { protectPdf } from '../../src/pdf/engines/security';

const ALL_PERMISSIONS = { printing: 'high' as const, copying: true, modifying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true };

test.describe('interaction details', () => {
  test('the password prompt focuses the password field', async ({ app, errors }) => {
    const locked = await protectPdf({ bytes: await makeTextPdf({ pages: 1 }), name: 'l.pdf' }, { userPassword: 'open-me', permissions: ALL_PERMISSIONS });
    await openTool(app, 'unlock');
    await addFiles(app, [pdfFile('locked.pdf', locked)]);
    const dialog = app.getByRole('dialog');
    await expect(dialog.getByLabel('Password')).toBeFocused();
    // Typing straight away (no click) and pressing Enter submits the password.
    await app.keyboard.type('open-me');
    await app.keyboard.press('Enter');
    await expect(app.getByText('Password accepted')).toBeVisible();
    expectNoErrors(errors);
  });

  test('a file dropped outside a drop zone does not replace the app', async ({ app, errors }) => {
    await openTool(app, 'split');
    await addFiles(app, [pdfFile('work.pdf', await makeTextPdf({ pages: 2 }))]);
    await expect(app.getByTestId('page-card')).toHaveCount(2);
    const prevented = await app.evaluate(async () => {
      const dt = new DataTransfer();
      dt.items.add(new File(['%PDF-1.4'], 'stray.pdf', { type: 'application/pdf' }));
      const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
      const drop = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
      document.querySelector('h1')!.dispatchEvent(over);
      document.querySelector('h1')!.dispatchEvent(drop);
      return over.defaultPrevented && drop.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await expect(app.getByTestId('page-card')).toHaveCount(2);
    expectNoErrors(errors);
  });

  test('Back after confirming “Leave” returns to the previous page (history stays intact)', async ({ app, errors }) => {
    await app.evaluate(() => (location.hash = '#/organize'));
    await expect(app.locator('h1')).toHaveText('Organize PDF');
    await settled(app);
    await openTool(app, 'merge');
    await addFiles(app, [pdfFile('a.pdf', await makeTextPdf({ pages: 1 })), pdfFile('b.pdf', await makeTextPdf({ pages: 1 }))]);
    await expect(app.getByTestId('file-tile')).toHaveCount(2);
    await app.goBack();
    await app.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
    await expect(app.locator('h1')).toHaveText('Organize PDF');
    await settled(app);
    await app.goBack();
    await expect(app.locator('h1')).toHaveText('Everything you need to work with PDFs.');
    expectNoErrors(errors);
  });

  test('number fields can be cleared and retyped', async ({ app, errors }) => {
    await openTool(app, 'page-numbers');
    await addFiles(app, [pdfFile('n.pdf', await makeTextPdf({ pages: 2 }))]);
    const start = app.getByLabel('Start numbering at');
    await start.click();
    await start.press('Backspace');
    await expect(start).toHaveValue('');
    await start.pressSequentially('5');
    await expect(start).toHaveValue('5');
    expectNoErrors(errors);
  });

  test('widening the window closes the phone menu and leaves the page usable', async ({ app, errors }) => {
    await app.setViewportSize({ width: 390, height: 844 });
    await app.getByRole('button', { name: 'Open navigation' }).click();
    await expect(app.getByRole('navigation', { name: 'Main (menu)' })).toBeVisible();
    await app.setViewportSize({ width: 1360, height: 900 });
    await expect(app.getByRole('navigation', { name: 'Main (menu)' })).toBeHidden();
    // Nothing is left inert behind an invisible modal: the sidebar link works.
    await app.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Settings' }).click();
    await expect(app.locator('h1')).toHaveText('Settings');
    expectNoErrors(errors);
  });

  test('on phones the main action follows you down long pages', async ({ app, errors }) => {
    await app.setViewportSize({ width: 390, height: 844 });
    await openTool(app, 'rotate');
    await addFiles(app, [pdfFile('long.pdf', await makeTextPdf({ pages: 12 }))]);
    await expect(app.getByTestId('page-card')).toHaveCount(12);
    const floating = app.getByTestId('floating-action');
    await expect(floating).toBeVisible();
    await expect(floating.getByRole('button')).toHaveText(/Rotate|Save|Apply/);
    // Near the real button, the floating copy gets out of the way.
    await app.getByTestId('primary-action').scrollIntoViewIfNeeded();
    await expect(floating).toBeHidden();
    expectNoErrors(errors);
  });
});
