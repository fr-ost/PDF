/**
 * Reachability-based clean-up of a document before saving.
 *
 * pdf-lib writes every object it knows about, including objects that are no
 * longer referenced (e.g. pages the user deleted). For privacy that is not
 * acceptable: "deleted" content must really be gone from the output file.
 *
 * This pass walks the object graph from the trailer. References to page
 * objects that are no longer part of the page tree are replaced by null
 * (outline/link destinations, annotation /P entries, …) so the removed pages
 * are not kept alive indirectly. Link annotations that point to removed pages
 * and form fields whose widgets lived only on removed pages are dropped.
 * Finally, every unreachable indirect object is deleted.
 */
import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNull,
  PDFRef,
  PDFStream,
  type PDFDocument,
  type PDFObject,
} from '@cantoo/pdf-lib';

const TYPE = PDFName.of('Type');
const PAGE = PDFName.of('Page');
const ANNOTS = PDFName.of('Annots');

export interface PruneOptions {
  /** Page refs that existed before editing; used to drop orphaned form fields. */
  originalPages?: PDFRef[];
}

export interface PruneReport {
  removedObjects: number;
}

function isPageDict(obj: PDFObject | undefined): boolean {
  return obj instanceof PDFDict && obj.get(TYPE) === PAGE;
}

function refKey(ref: PDFRef): string {
  return `${ref.objectNumber} ${ref.generationNumber}`;
}

export function pruneDocument(doc: PDFDocument, options: PruneOptions = {}): PruneReport {
  const ctx = doc.context;
  const kept = new Set(doc.getPages().map((p) => refKey(p.ref)));

  const removedPageAnnots = new Set<string>();
  if (options.originalPages) {
    for (const ref of options.originalPages) {
      if (kept.has(refKey(ref))) continue;
      const page = ctx.lookup(ref);
      if (!(page instanceof PDFDict)) continue;
      const annots = page.lookup(ANNOTS);
      if (annots instanceof PDFArray) {
        for (let i = 0; i < annots.size(); i++) {
          const a = annots.get(i);
          if (a instanceof PDFRef) removedPageAnnots.add(refKey(a));
        }
      }
    }
  }

  const pointsToRemovedPage = (value: PDFObject | undefined): boolean =>
    value instanceof PDFRef && !kept.has(refKey(value)) && isPageDict(ctx.lookup(value));

  // 1. Drop link annotations on kept pages whose target page was removed.
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(ANNOTS);
    if (!(annots instanceof PDFArray)) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const annot = annots.lookup(i);
      if (!(annot instanceof PDFDict)) continue;
      const dest = annot.lookup(PDFName.of('Dest'));
      const action = annot.lookup(PDFName.of('A'));
      const actionDest = action instanceof PDFDict ? action.lookup(PDFName.of('D')) : undefined;
      const target = dest instanceof PDFArray ? dest.get(0) : actionDest instanceof PDFArray ? actionDest.get(0) : undefined;
      if (pointsToRemovedPage(target)) annots.remove(i);
    }
  }

  // 2. Drop form fields whose widgets were only on removed pages.
  if (removedPageAnnots.size > 0) pruneAcroForm(doc, removedPageAnnots);

  // 3. Mark reachable objects, severing references to removed pages.
  const reachable = new Set<string>();
  const stack: PDFObject[] = [];
  const visitValue = (value: PDFObject | undefined, replace: () => void): void => {
    if (value === undefined) return;
    if (value instanceof PDFRef) {
      const key = refKey(value);
      if (reachable.has(key)) return;
      const target = ctx.lookup(value);
      if (isPageDict(target) && !kept.has(key)) {
        replace();
        return;
      }
      reachable.add(key);
      if (target !== undefined) stack.push(target);
      return;
    }
    if (value instanceof PDFDict || value instanceof PDFArray || value instanceof PDFStream) stack.push(value);
  };

  // /Encrypt is only present when the document is being encrypted on save
  // (decrypted inputs have it removed by the loader).
  const { Root, Info, Encrypt } = ctx.trailerInfo;
  if (Root) visitValue(Root, () => undefined);
  if (Info) visitValue(Info, () => undefined);
  if (Encrypt) visitValue(Encrypt, () => undefined);

  while (stack.length > 0) {
    const obj = stack.pop()!;
    if (obj instanceof PDFStream) {
      stack.push(obj.dict);
    } else if (obj instanceof PDFDict) {
      for (const [key, value] of obj.entries()) {
        visitValue(value, () => obj.set(key, PDFNull));
      }
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) {
        const value = obj.get(i);
        visitValue(value, () => obj.set(i, PDFNull));
      }
    }
  }

  // 4. Delete everything that is unreachable.
  let removedObjects = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!reachable.has(refKey(ref))) {
      ctx.delete(ref);
      removedObjects++;
    }
  }
  return { removedObjects };
}

function pruneAcroForm(doc: PDFDocument, removedAnnots: Set<string>): void {
  const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
  if (!(acroForm instanceof PDFDict)) return;
  const fields = acroForm.lookup(PDFName.of('Fields'));
  if (!(fields instanceof PDFArray)) return;
  const ctx = doc.context;

  // Returns true if the field node should be kept.
  const pruneNode = (ref: PDFObject | undefined, depth: number): boolean => {
    if (depth > 64) return true;
    if (ref instanceof PDFRef && removedAnnots.has(refKey(ref))) return false;
    const node = ref instanceof PDFRef ? ctx.lookup(ref) : ref;
    if (!(node instanceof PDFDict)) return true;
    const kids = node.lookup(PDFName.of('Kids'));
    if (!(kids instanceof PDFArray)) return true;
    for (let i = kids.size() - 1; i >= 0; i--) {
      if (!pruneNode(kids.get(i), depth + 1)) kids.remove(i);
    }
    return kids.size() > 0;
  };

  for (let i = fields.size() - 1; i >= 0; i--) {
    if (!pruneNode(fields.get(i), 0)) fields.remove(i);
  }
}
