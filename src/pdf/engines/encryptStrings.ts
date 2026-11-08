/**
 * String encryption for the objects the PDF writer leaves outside object streams.
 *
 * The writer encrypts streams (object streams included) but never strings. Objects
 * packed into an object stream are covered by the stream's encryption; everything
 * else it writes on its own — the catalog, the page tree and pages, stream
 * dictionaries, objects with a non-zero generation number, signature dictionaries,
 * and every object when object streams are off — would keep its strings in plain
 * text, and readers would then "decrypt" them into garbage (page labels, /Lang,
 * annotation text, bookmarks titles…). This encrypts exactly those strings with
 * each object's own key.
 */
import { PDFArray, PDFCatalog, PDFDict, PDFHexString, PDFInvalidObject, PDFName, PDFPageLeaf, PDFPageTree, PDFRawStream, PDFStream, PDFString, type PDFDocument, type PDFObject, type PDFRef } from '@cantoo/pdf-lib';

type EncryptFn = (bytes: Uint8Array) => Uint8Array;

/** Mirrors the writer's rule for objects it keeps out of object streams. */
function writtenLoose(ref: PDFRef, object: PDFObject, useObjectStreams: boolean): boolean {
  return (
    !useObjectStreams ||
    object instanceof PDFStream ||
    object instanceof PDFCatalog ||
    object instanceof PDFPageTree ||
    object instanceof PDFPageLeaf ||
    ref.generationNumber !== 0 ||
    (object instanceof PDFDict && object.lookup(PDFName.of('Type')) === PDFName.of('Sig'))
  );
}

function encryptedCopy(value: PDFObject, encrypt: EncryptFn): PDFHexString | undefined {
  return value instanceof PDFString || value instanceof PDFHexString ? PDFHexString.fromBytes(encrypt(value.asBytes())) : undefined;
}

/** Replaces every direct string inside `container` (references are separate objects with their own key). */
function encryptStringsIn(container: PDFObject, encrypt: EncryptFn, depth: number): void {
  if (depth > 64) return;
  if (container instanceof PDFDict) {
    for (const [key, value] of container.entries()) {
      const replacement = encryptedCopy(value, encrypt);
      if (replacement) container.set(key, replacement);
      else encryptStringsIn(value, encrypt, depth + 1);
    }
  } else if (container instanceof PDFArray) {
    for (let i = 0; i < container.size(); i++) {
      const value = container.get(i);
      const replacement = encryptedCopy(value, encrypt);
      if (replacement) container.set(i, replacement);
      else encryptStringsIn(value, encrypt, depth + 1);
    }
  }
}

/**
 * Encrypts the strings the writer would otherwise leave in plain text. Call it
 * right before `doc.save` (after `doc.flush()`, with the same `useObjectStreams`)
 * on a document that has been given encryption with `doc.encrypt`. The document
 * must not be saved again afterwards: the writer also encrypts streams in place.
 */
export function encryptLooseStrings(doc: PDFDocument, useObjectStreams: boolean): void {
  const security = doc.context.security;
  if (!security) return;
  const encryptRef = doc.context.trailerInfo.Encrypt;
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (ref === encryptRef || object instanceof PDFInvalidObject) continue;
    if (object instanceof PDFRawStream) {
      const type = object.dict.lookup(PDFName.of('Type'));
      if (type === PDFName.of('ObjStm') || type === PDFName.of('XRef')) continue; // never written as they are
    }
    if (!writtenLoose(ref, object, useObjectStreams)) continue;
    const encrypt = security.getEncryptFn(ref.objectNumber, ref.generationNumber);
    const replacement = encryptedCopy(object, encrypt);
    if (replacement) doc.context.assign(ref, replacement);
    else encryptStringsIn(object instanceof PDFStream ? object.dict : object, encrypt, 0);
  }
}
