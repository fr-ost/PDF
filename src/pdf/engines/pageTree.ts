/**
 * Rebuilds a document's page tree as a single flat list, in any order.
 *
 * Attributes that pages may inherit from intermediate /Pages nodes
 * (Resources, MediaBox, CropBox, Rotate) are copied onto each page first, so
 * flattening never changes how a page looks.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, type PDFDocument } from '@cantoo/pdf-lib';

const INHERITABLE = ['Resources', 'MediaBox', 'CropBox', 'Rotate'].map((k) => PDFName.of(k));
const PARENT = PDFName.of('Parent');

function pushDownInheritedAttributes(leaf: PDFDict): void {
  for (const key of INHERITABLE) {
    if (leaf.has(key)) continue;
    let node: PDFDict | undefined = leaf;
    const seen = new Set<PDFDict>();
    while (node && !seen.has(node)) {
      seen.add(node);
      const parent: unknown = node.lookup(PARENT);
      node = parent instanceof PDFDict ? parent : undefined;
      if (node?.has(key)) {
        const value = node.get(key);
        if (value !== undefined) leaf.set(key, value instanceof PDFDict || value instanceof PDFArray ? value.clone() : value);
        break;
      }
    }
  }
}

/**
 * Replaces the page tree with exactly `pageRefs`, in that order. Every ref
 * must be a page leaf in this document and must appear at most once.
 */
export function setPageOrder(doc: PDFDocument, pageRefs: PDFRef[]): void {
  const ctx = doc.context;
  const rootRef = doc.catalog.get(PDFName.of('Pages'));
  if (!(rootRef instanceof PDFRef)) throw new Error('Document has no page tree reference.');
  const root = ctx.lookup(rootRef, PDFDict);

  const seen = new Set<string>();
  for (const ref of pageRefs) {
    const key = `${ref.objectNumber} ${ref.generationNumber}`;
    if (seen.has(key)) throw new Error('A page can only appear once in the page tree.');
    seen.add(key);
    const leaf = ctx.lookup(ref, PDFDict);
    pushDownInheritedAttributes(leaf);
  }
  for (const ref of pageRefs) {
    ctx.lookup(ref, PDFDict).set(PARENT, rootRef);
  }
  root.set(PDFName.of('Kids'), ctx.obj(pageRefs));
  root.set(PDFName.of('Count'), PDFNumber.of(pageRefs.length));
  root.delete(PARENT);
  invalidatePageCache(doc);
}

/** pdf-lib caches its page list; it must be refreshed after manual edits. */
export function invalidatePageCache(doc: PDFDocument): void {
  const internal = doc as unknown as { pageCache?: { invalidate?: () => void } };
  internal.pageCache?.invalidate?.();
}
