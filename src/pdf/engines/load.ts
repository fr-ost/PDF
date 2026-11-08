/**
 * Safe PDF loading for the processing engines.
 *
 * - Verifies the file really is a PDF (header sniffing).
 * - Transparently opens documents protected only by an owner password
 *   (empty user password), exactly as every PDF viewer does.
 * - Decrypts documents when the user supplies the correct password. There is
 *   no password guessing or bypassing of any kind.
 * - Converts parser failures into typed, user-friendly errors.
 */
import { EncryptedPDFError, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { pruneDocument } from './prune';
import { hasPdfHeader } from '../sniff';

export interface PdfSource {
  bytes: Uint8Array;
  name: string;
  password?: string;
}

export interface LoadedPdf {
  doc: PDFDocument;
  /** True if the source file was encrypted (and has now been decrypted). */
  wasEncrypted: boolean;
}

export { hasPdfHeader };

function isPasswordError(err: unknown): boolean {
  return err instanceof Error && /password/i.test(err.message);
}

export interface PdfPermissions {
  printing: false | 'lowResolution' | 'highResolution';
  modifying: boolean;
  copying: boolean;
  annotating: boolean;
  fillingForms: boolean;
  contentAccessibility: boolean;
  documentAssembly: boolean;
}

/**
 * Restrictions set by the author of an owner-password-only file. Such files
 * open without a password, but lifting the restrictions needs the owner
 * password (the Unlock tool), so other tools write them back on save.
 */
const authorRestrictions = new WeakMap<PDFDocument, PdfPermissions>();

function readRestrictions(doc: PDFDocument): PdfPermissions | null {
  const encrypt = doc.context.lookup(doc.context.trailerInfo.Encrypt);
  if (!(encrypt instanceof PDFDict)) return null;
  const p = encrypt.lookup(PDFName.of('P'));
  if (!(p instanceof PDFNumber)) return null;
  const value = p.asNumber() | 0;
  const revision = encrypt.lookup(PDFName.of('R'));
  const modern = !(revision instanceof PDFNumber) || revision.asNumber() >= 3;
  const bit = (n: number) => (value & (1 << (n - 1))) !== 0;
  // Revision 2 only defines bits 3–6.
  const extra = (n: number) => (modern ? bit(n) : true);
  const permissions: PdfPermissions = {
    printing: bit(3) ? (extra(12) ? 'highResolution' : 'lowResolution') : false,
    modifying: bit(4),
    copying: bit(5),
    annotating: bit(6),
    fillingForms: extra(9),
    contentAccessibility: extra(10),
    documentAssembly: extra(11),
  };
  const restricted = permissions.printing !== 'highResolution' || Object.entries(permissions).some(([k, v]) => k !== 'printing' && v === false);
  return restricted ? permissions : null;
}

/** For tools that set or remove protection themselves (Protect, Unlock). */
export function dropAuthorRestrictions(doc: PDFDocument): void {
  authorRestrictions.delete(doc);
}

export function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function stripEncryption(doc: PDFDocument): void {
  const ctx = doc.context;
  const encrypt = ctx.trailerInfo.Encrypt;
  if (encrypt instanceof PDFRef) ctx.delete(encrypt);
  ctx.trailerInfo.Encrypt = undefined;
}

export async function loadPdf(source: PdfSource): Promise<LoadedPdf> {
  const { bytes, name, password } = source;
  if (!bytes || bytes.length === 0) throw new PdfToolError('CORRUPT', 'The file is empty.', name);
  if (!hasPdfHeader(bytes)) throw new PdfToolError('NOT_PDF', 'The file does not start with a PDF header.', name);

  let doc: PDFDocument;
  let wasEncrypted = false;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (err) {
    if (!(err instanceof EncryptedPDFError) && !(err instanceof Error && err.name === 'EncryptedPDFError')) {
      throw new PdfToolError('CORRUPT', describeParseError(err), name);
    }
    wasEncrypted = true;
    doc = await openEncrypted(bytes, name, password);
  }

  if (wasEncrypted) {
    // Opened without a password: an owner-only file. Remember its restrictions
    // (the decrypted document no longer has its /Encrypt dictionary, so read
    // them from a raw parse; such files are rare).
    if (!password) {
      try {
        const raw = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
        const restrictions = readRestrictions(raw);
        if (restrictions) authorRestrictions.set(doc, restrictions);
      } catch {
        /* unreadable /Encrypt: nothing to keep */
      }
    }
    stripEncryption(doc);
  }

  let pageCount: number;
  try {
    pageCount = doc.getPageCount();
  } catch (err) {
    throw new PdfToolError('CORRUPT', `The page structure is broken (${describeParseError(err)}).`, name);
  }
  if (pageCount === 0) throw new PdfToolError('CORRUPT', 'The document contains no readable pages.', name);
  return { doc, wasEncrypted };
}

async function openEncrypted(bytes: Uint8Array, name: string, password: string | undefined): Promise<PDFDocument> {
  // Owner-password-only files open with an empty user password, like in any viewer.
  const attempts = password !== undefined && password !== '' ? [password] : [''];
  for (const attempt of attempts) {
    try {
      return await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false, password: attempt });
    } catch (err) {
      if (!isPasswordError(err)) {
        throw new PdfToolError('UNSUPPORTED', `This file’s encryption could not be opened (${describeParseError(err)}).`, name);
      }
    }
  }
  if (password) throw new PdfToolError('WRONG_PASSWORD', 'The password is incorrect.', name);
  throw new PdfToolError('ENCRYPTED', 'This document requires a password to open.', name);
}

function describeParseError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 160 ? `${message.slice(0, 157)}…` : message || 'unknown parser error';
}

/** Lightweight inspection used before processing (no full rewrite). */
export async function inspectEncryption(bytes: Uint8Array, name: string): Promise<{ encrypted: boolean; needsPassword: boolean }> {
  if (!hasPdfHeader(bytes)) throw new PdfToolError('NOT_PDF', 'The file does not start with a PDF header.', name);
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true, throwOnInvalidObject: false });
    if (!doc.isEncrypted) return { encrypted: false, needsPassword: false };
  } catch (err) {
    throw new PdfToolError('CORRUPT', describeParseError(err), name);
  }
  try {
    await PDFDocument.load(bytes, { updateMetadata: false, password: '' });
    return { encrypted: true, needsPassword: false };
  } catch {
    return { encrypted: true, needsPassword: true };
  }
}

export const PRODUCER = 'Unique PDF by Unique Labs';

export interface SaveOptions {
  /** Stamp Producer + ModDate (default true). Disabled for metadata editing. */
  stamp?: boolean;
  objectStreams?: boolean;
}

/**
 * Saves a document. Unreachable objects are always removed first: besides
 * keeping files small, this guarantees that stale cross-reference streams,
 * superseded incremental-update objects and removed pages from the source
 * file never leak into the output.
 */
export async function savePdf(doc: PDFDocument, options: SaveOptions = {}): Promise<Uint8Array> {
  const { stamp = true, objectStreams = true } = options;
  if (stamp) {
    doc.setProducer(PRODUCER);
    doc.setModificationDate(new Date());
  }
  // Usage rights (Reader extensions) are signed over the original bytes; any
  // change invalidates them and Adobe Reader would report an error.
  doc.catalog.delete(PDFName.of('Perms'));
  // Keep the author's restrictions (no open password, same permissions). PDF/A can't be encrypted.
  const restrictions = authorRestrictions.get(doc);
  if (restrictions && pdfAPart(doc) === undefined) {
    doc.encrypt({ userPassword: '', ownerPassword: randomPassword(), permissions: restrictions, algorithm: 'AES-256' });
  }
  pruneDocument(doc);
  // PDF/A-1 forbids object and cross-reference streams.
  return doc.save({ useObjectStreams: objectStreams && pdfAPart(doc) !== 1, addDefaultPage: false, updateFieldAppearances: false });
}

/** PDF/A part declared in the catalog XMP (1, 2, 3, 4), if any. */
export function pdfAPart(doc: PDFDocument): number | undefined {
  const meta = doc.catalog.lookup(PDFName.of('Metadata'));
  if (!(meta instanceof PDFRawStream)) return undefined;
  try {
    const xml = new TextDecoder().decode(decodePDFRawStream(meta).decode());
    const m = xml.match(/pdfaid:part\s*=\s*["'](\d)["']|<pdfaid:part>\s*(\d)\s*</);
    return m ? Number(m[1] ?? m[2]) : undefined;
  } catch {
    return undefined;
  }
}

export function isPdfA(doc: PDFDocument): boolean {
  return pdfAPart(doc) !== undefined;
}

export function catalogHas(doc: PDFDocument, key: string): boolean {
  return doc.catalog.has(PDFName.of(key));
}
