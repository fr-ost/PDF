/**
 * Password protection and removal.
 *
 * Protection uses AES-256 (PDF 2.0, revision 6) via @cantoo/pdf-lib.
 * Unlocking requires the real password: there is no cracking, guessing or
 * recovery of forgotten passwords. Passwords only exist in memory for the
 * duration of the operation and are never stored or transmitted.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFObject } from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { dropAuthorRestrictions, hasPdfHeader, isPdfA, loadPdf, savePdf, type PdfSource } from './load';

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
  dropAuthorRestrictions(doc); // the new protection replaces them
  const p = options.permissions;
  // PDF/A forbids encryption, so an encrypted copy can't keep claiming PDF/A:
  // drop the catalog XMP that carries the claim (the document info stays).
  if (doc.catalog.has(PDFName.of('Metadata')) && isPdfA(doc)) doc.catalog.delete(PDFName.of('Metadata'));
  moveStringsIntoObjects(doc);
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

function containsString(obj: PDFObject, depth = 0): boolean {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return true;
  if (depth > 32) return false;
  if (obj instanceof PDFArray) return obj.asArray().some((v) => containsString(v, depth + 1));
  if (obj instanceof PDFDict) return obj.values().some((v) => containsString(v, depth + 1));
  return false;
}

/**
 * The writer encrypts streams (object streams included) but keeps the catalog
 * and page-tree objects outside object streams, where strings would stay in
 * plain text and readers would "decrypt" them into garbage (page labels,
 * /Lang…). Moving string-bearing values into their own objects puts them into
 * an encrypted object stream.
 */
function moveStringsIntoObjects(doc: PDFDocument): void {
  const holders: PDFDict[] = [doc.catalog];
  const seen = new Set<PDFDict>();
  const walk = (node: PDFObject | undefined, depth: number) => {
    if (!(node instanceof PDFDict) || seen.has(node) || depth > 64) return;
    seen.add(node);
    holders.push(node);
    const kids = node.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i), depth + 1);
  };
  walk(doc.catalog.lookup(PDFName.of('Pages')), 0);
  for (const dict of holders) {
    for (const [key, value] of dict.entries()) {
      if (!(value instanceof PDFRef) && containsString(value)) dict.set(key, doc.context.register(value));
    }
  }
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
  dropAuthorRestrictions(doc); // the owner password was given: remove everything
  return savePdf(doc);
}

