/**
 * Password protection and removal.
 *
 * Protection uses AES-256 (PDF 2.0, revision 6) via @cantoo/pdf-lib.
 * Unlocking requires the real password: there is no cracking, guessing or
 * recovery of forgotten passwords. Passwords only exist in memory for the
 * duration of the operation and are never stored or transmitted.
 */
import { PDFDict, PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { hasPdfHeader, loadPdf, savePdf, type PdfSource } from './load';

export interface PermissionSettings {
  printing: 'none' | 'low' | 'high';
  copying: boolean;
  modifying: boolean;
  annotating: boolean;
  fillingForms: boolean;
  contentAccessibility: boolean;
  documentAssembly: boolean;
}

export const ALL_PERMISSIONS: PermissionSettings = {
  printing: 'high',
  copying: true,
  modifying: true,
  annotating: true,
  fillingForms: true,
  contentAccessibility: true,
  documentAssembly: true,
};

export interface ProtectOptions {
  userPassword: string;
  /** Optional separate password for changing permissions. */
  ownerPassword?: string;
  permissions: PermissionSettings;
}

const MAX_PASSWORD_BYTES = 127; // AES-256 (R6) limit on UTF-8 password length

export function validatePassword(password: string): string | null {
  if (password.length === 0) return 'Enter a password.';
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'Passwords can be at most 127 bytes long.';
  return null;
}

function randomOwnerPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function protectPdf(source: PdfSource, options: ProtectOptions): Promise<Uint8Array> {
  const error = validatePassword(options.userPassword);
  if (error) throw new PdfToolError('INVALID_INPUT', error);
  if (options.ownerPassword) {
    const ownerError = validatePassword(options.ownerPassword);
    if (ownerError) throw new PdfToolError('INVALID_INPUT', ownerError);
  }
  const { doc } = await loadPdf(source);
  const p = options.permissions;
  doc.encrypt({
    userPassword: options.userPassword,
    // Without an explicit owner password, a random one makes the permission
    // restrictions binding (nobody can lift them with the open password).
    ownerPassword: options.ownerPassword || randomOwnerPassword(),
    permissions: {
      printing: p.printing === 'none' ? false : p.printing === 'low' ? 'lowResolution' : 'highResolution',
      copying: p.copying,
      modifying: p.modifying,
      annotating: p.annotating,
      fillingForms: p.fillingForms,
      contentAccessibility: p.contentAccessibility,
      documentAssembly: p.documentAssembly,
    },
    algorithm: 'AES-256',
  });
  return savePdf(doc);
}

export interface SecurityInfo {
  encrypted: boolean;
  /** True if a password is needed just to open the file. */
  needsPassword: boolean;
  algorithm: string | null;
  /** Permissions granted to users without the owner password (null if not encrypted). */
  permissions: PermissionSettings | null;
}

function describeAlgorithm(encrypt: PDFDict): string {
  const v = encrypt.lookup(PDFName.of('V'));
  const r = encrypt.lookup(PDFName.of('R'));
  const vn = v instanceof PDFNumber ? v.asNumber() : 0;
  const rn = r instanceof PDFNumber ? r.asNumber() : 0;
  if (vn >= 5 || rn >= 5) return 'AES-256';
  const cf = encrypt.lookup(PDFName.of('CF'));
  if (cf instanceof PDFDict && cf.toString().includes('AESV2')) return 'AES-128';
  const len = encrypt.lookup(PDFName.of('Length'));
  const bits = len instanceof PDFNumber ? len.asNumber() : 40;
  return `RC4 ${bits}-bit`;
}

function decodePermissions(p: number): PermissionSettings {
  const has = (bit: number) => (p & (1 << (bit - 1))) !== 0;
  return {
    printing: !has(3) ? 'none' : has(12) ? 'high' : 'low',
    modifying: has(4),
    copying: has(5),
    annotating: has(6),
    fillingForms: has(9),
    contentAccessibility: has(10),
    documentAssembly: has(11),
  };
}

export async function getSecurityInfo(source: PdfSource): Promise<SecurityInfo> {
  if (!hasPdfHeader(source.bytes)) throw new PdfToolError('NOT_PDF', 'The file does not start with a PDF header.', source.name);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(source.bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (err) {
    throw new PdfToolError('CORRUPT', err instanceof Error ? err.message : 'Unreadable file', source.name);
  }
  const encryptRef = doc.context.trailerInfo.Encrypt;
  const encrypt = encryptRef ? doc.context.lookup(encryptRef) : undefined;
  if (!(encrypt instanceof PDFDict)) return { encrypted: false, needsPassword: false, algorithm: null, permissions: null };
  const pValue = encrypt.lookup(PDFName.of('P'));
  const permissions = pValue instanceof PDFNumber ? decodePermissions(pValue.asNumber() | 0) : null;
  let needsPassword = false;
  try {
    await PDFDocument.load(source.bytes, { password: '', updateMetadata: false });
  } catch {
    needsPassword = true;
  }
  return { encrypted: true, needsPassword, algorithm: describeAlgorithm(encrypt), permissions };
}

/**
 * Removes encryption. The caller must supply a password that the file
 * accepts. For files that open without a password but carry author-set
 * restrictions, the owner password is required.
 */
export async function unlockPdf(source: PdfSource): Promise<Uint8Array> {
  const info = await getSecurityInfo(source);
  if (!info.encrypted) throw new PdfToolError('INVALID_INPUT', 'This PDF is not password-protected, so there is nothing to unlock.', source.name);
  if (!source.password) {
    throw new PdfToolError(
      'ENCRYPTED',
      info.needsPassword ? 'Enter the document password to unlock it.' : 'This PDF opens without a password but has restrictions set by its author. Enter the owner password to remove them.',
      source.name,
    );
  }
  try {
    await PDFDocument.load(source.bytes, { password: source.password, updateMetadata: false });
  } catch {
    throw new PdfToolError('WRONG_PASSWORD', 'The password is incorrect.', source.name);
  }
  const { doc } = await loadPdf(source);
  return savePdf(doc);
}

