import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { loadPdf } from '../../src/pdf/engines/load';
import { ALL_PERMISSIONS, getSecurityInfo, protectPdf, unlockPdf, validatePassword } from '../../src/pdf/engines/security';
import { assembleNew } from '../../src/pdf/engines/assemble';
import { makeTextPdf, source } from '../helpers/fixtures';
import { extractText, openWithPdfjs } from '../helpers/pdfjs';

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures', name)));

describe('password protection', () => {
  it('encrypts with AES-256 so that PDF.js requires the password', async () => {
    const input = await makeTextPdf({ pages: 2, label: 'Confidential' });
    const out = await protectPdf(source(input), { userPassword: 'open sesame', permissions: ALL_PERMISSIONS });
    await expect(openWithPdfjs(out)).rejects.toMatchObject({ name: 'PasswordException' });
    await expect(openWithPdfjs(out, 'wrong')).rejects.toMatchObject({ name: 'PasswordException' });
    const text = await extractText(out, 'open sesame');
    expect(text[0]).toContain('Confidential 1');
    const info = await getSecurityInfo(source(out));
    expect(info).toMatchObject({ encrypted: true, needsPassword: true, algorithm: 'AES-256' });
    // The plaintext must not be visible in the raw file.
    expect(Buffer.from(out).toString('latin1')).not.toContain('Confidential');
  });

  it('records restricted permissions', async () => {
    const input = await makeTextPdf({ pages: 1 });
    const out = await protectPdf(source(input), {
      userPassword: 'u',
      ownerPassword: 'owner-secret',
      permissions: { ...ALL_PERMISSIONS, printing: 'none', copying: false, modifying: false },
    });
    const info = await getSecurityInfo(source(out));
    expect(info.permissions).toMatchObject({ printing: 'none', copying: false, modifying: false, annotating: true });
  });

  it('supports Unicode passwords and validates length', async () => {
    expect(validatePassword('')).not.toBeNull();
    expect(validatePassword('x'.repeat(128))).not.toBeNull();
    expect(validatePassword('pässwörd-ü')).toBeNull();
    const out = await protectPdf(source(await makeTextPdf({ pages: 1 })), { userPassword: 'pässwörd-ü', permissions: ALL_PERMISSIONS });
    expect((await extractText(out, 'pässwörd-ü'))[0]).toContain('Page 1');
  });

  it('rejects empty passwords', async () => {
    await expect(protectPdf(source(await makeTextPdf({ pages: 1 })), { userPassword: '', permissions: ALL_PERMISSIONS })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('unlock', () => {
  it('removes encryption with the correct password', async () => {
    const locked = await protectPdf(source(await makeTextPdf({ pages: 1, label: 'Unlocked' })), { userPassword: 'pw', permissions: ALL_PERMISSIONS });
    const out = await unlockPdf(source(locked, 'locked.pdf', 'pw'));
    const doc = await PDFDocument.load(out);
    expect(doc.isEncrypted).toBe(false);
    expect((await extractText(out))[0]).toContain('Unlocked 1');
  });

  it('refuses a wrong or missing password', async () => {
    const locked = await protectPdf(source(await makeTextPdf({ pages: 1 })), { userPassword: 'pw', permissions: ALL_PERMISSIONS });
    await expect(unlockPdf(source(locked, 'l.pdf', 'nope'))).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(unlockPdf(source(locked, 'l.pdf'))).rejects.toMatchObject({ code: 'ENCRYPTED' });
  });

  it('reports files that are not encrypted', async () => {
    await expect(unlockPdf(source(await makeTextPdf({ pages: 1 }), 'x.pdf', 'pw'))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it.each(['rc4-40', 'rc4-128', 'aes-128', 'aes-256'])('decrypts pypdf %s files with the user or owner password', async (alg) => {
    const bytes = fixture(`pypdf-${alg}.pdf`);
    const info = await getSecurityInfo(source(bytes));
    expect(info.needsPassword).toBe(true);
    for (const pw of ['user123', 'owner456']) {
      const out = await unlockPdf(source(bytes, 'f.pdf', pw));
      const doc = await PDFDocument.load(out, { updateMetadata: false });
      expect(doc.isEncrypted).toBe(false);
      expect(doc.getTitle()).toBe('Encrypted fixture');
    }
    await expect(unlockPdf(source(bytes, 'f.pdf', 'bad'))).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('requires the owner password to lift restrictions on owner-only files', async () => {
    const bytes = fixture('pypdf-owner-only.pdf');
    const info = await getSecurityInfo(source(bytes));
    expect(info).toMatchObject({ encrypted: true, needsPassword: false });
    await expect(unlockPdf(source(bytes, 'o.pdf'))).rejects.toMatchObject({ code: 'ENCRYPTED' });
    await expect(unlockPdf(source(bytes, 'o.pdf', 'not-the-owner'))).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    const out = await unlockPdf(source(bytes, 'o.pdf', 'owner456'));
    expect((await PDFDocument.load(out)).isEncrypted).toBe(false);
  });
});

describe('encrypted inputs in other tools', () => {
  it('asks for a password, then processes with it, producing an unencrypted file', async () => {
    const locked = await protectPdf(source(await makeTextPdf({ pages: 2 })), { userPassword: 'pw', permissions: ALL_PERMISSIONS });
    await expect(loadPdf(source(locked, 'l.pdf'))).rejects.toMatchObject({ code: 'ENCRYPTED' });
    await expect(loadPdf(source(locked, 'l.pdf', 'bad'))).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    const out = await assembleNew([source(locked, 'l.pdf', 'pw')], [{ source: 0, page: 1 }]);
    expect((await extractText(out))[0]).toContain('Page 2');
  });

  it('opens owner-only encrypted files without a password, like a viewer', async () => {
    const { doc, wasEncrypted } = await loadPdf(source(fixture('pypdf-owner-only.pdf')));
    expect(wasEncrypted).toBe(true);
    expect(doc.getPageCount()).toBe(1);
  });
});
