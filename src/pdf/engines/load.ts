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
import { EncryptedPDFError, PDFDocument, PDFName, PDFRef } from '@cantoo/pdf-lib';
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

  if (wasEncrypted) stripEncryption(doc);

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
  pruneDocument(doc);
  return doc.save({ useObjectStreams: objectStreams, addDefaultPage: false, updateFieldAppearances: false });
}

export function catalogHas(doc: PDFDocument, key: string): boolean {
  return doc.catalog.has(PDFName.of(key));
}
