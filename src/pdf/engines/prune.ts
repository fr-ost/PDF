/**
 * Reachability-based clean-up of a document before saving.
 *
 * pdf-lib writes every object it knows about, including objects that are no
 * longer referenced (e.g. pages the user deleted). For privacy that is not
 * acceptable: "deleted" content must really be gone from the output file.
 *
 * This pass walks the object graph from the trailer and severs (replaces by
 * null) every reference that would keep removed content alive:
 *  - page objects that are no longer part of the page tree (outline/link
 *    destinations, annotation /P entries, …), unless the page was replaced
 *    (redaction), in which case references move to the replacement;
 *  - annotations of removed pages (reachable e.g. through the structure tree,
 *    /IRT reply chains or form field /Kids);
 *  - structure elements that belong to removed pages (alt text, actual text).
 * Link annotations pointing to removed pages, bookmarks that lead only to
 * removed pages and form fields whose widgets lived only on removed pages are
 * dropped. Finally, every unreachable indirect object is deleted.
 */
import { PDFArray, PDFDict, PDFName, PDFNull, PDFNumber, PDFRef, PDFStream, type PDFDocument, type PDFObject } from '@cantoo/pdf-lib';

const N = {
  Type: PDFName.of('Type'),
  Page: PDFName.of('Page'),
  Annot: PDFName.of('Annot'),
  Annots: PDFName.of('Annots'),
  Subtype: PDFName.of('Subtype'),
  Widget: PDFName.of('Widget'),
  Rect: PDFName.of('Rect'),
  P: PDFName.of('P'),
  Pg: PDFName.of('Pg'),
  S: PDFName.of('S'),
  K: PDFName.of('K'),
  Kids: PDFName.of('Kids'),
  Parent: PDFName.of('Parent'),
  Dest: PDFName.of('Dest'),
  A: PDFName.of('A'),
  D: PDFName.of('D'),
  GoTo: PDFName.of('GoTo'),
  Outlines: PDFName.of('Outlines'),
  First: PDFName.of('First'),
  Last: PDFName.of('Last'),
  Next: PDFName.of('Next'),
  Prev: PDFName.of('Prev'),
  Count: PDFName.of('Count'),
  PageMode: PDFName.of('PageMode'),
  UseOutlines: PDFName.of('UseOutlines'),
  AcroForm: PDFName.of('AcroForm'),
  Fields: PDFName.of('Fields'),
};

export interface PruneOptions {
  /** Page refs that existed before editing; their annotations are treated as removed. */
  originalPages?: PDFRef[];
  /** Annotations of pages that were removed or replaced (their page objects may already be gone). */
  removedAnnots?: PDFRef[];
  /** Replaced pages (old → new): references to the old page are redirected to the new one. */
  remapPages?: [PDFRef, PDFRef][];
  /** Structure elements of replaced pages describe content that no longer exists: drop them. */
  replacedPagesAreGone?: boolean;
}

export interface PruneReport {
  removedObjects: number;
}

function isPageDict(obj: PDFObject | undefined): boolean {
  return obj instanceof PDFDict && obj.get(N.Type) === N.Page;
}

function isAnnotDict(obj: PDFObject | undefined): obj is PDFDict {
  return obj instanceof PDFDict && obj.has(N.Subtype) && (obj.get(N.Type) === N.Annot || obj.has(N.Rect));
}

function refKey(ref: PDFRef): string {
  return `${ref.objectNumber} ${ref.generationNumber}`;
}

function annotRefs(page: PDFObject | undefined): PDFRef[] {
  if (!(page instanceof PDFDict)) return [];
  const annots = page.lookup(N.Annots);
  const out: PDFRef[] = [];
  if (annots instanceof PDFArray) for (let i = 0; i < annots.size(); i++) {
    const a = annots.get(i);
    if (a instanceof PDFRef) out.push(a);
  }
  return out;
}

/** Page targeted by a destination array or a GoTo action (named destinations are not resolved). */
function destinationPage(dict: PDFDict): PDFObject | undefined {
  const dest = dict.lookup(N.Dest);
  if (dest instanceof PDFArray) return dest.get(0);
  const action = dict.lookup(N.A);
  if (action instanceof PDFDict && action.get(N.S) === N.GoTo) {
    const d = action.lookup(N.D);
    if (d instanceof PDFArray) return d.get(0);
  }
  return undefined;
}

export function pruneDocument(doc: PDFDocument, options: PruneOptions = {}): PruneReport {
  const ctx = doc.context;
  const pages = doc.getPages();
  const kept = new Set(pages.map((p) => refKey(p.ref)));
  const remap = new Map<string, PDFRef>();
  for (const [from, to] of options.remapPages ?? []) remap.set(refKey(from), to);

  // Original pages that are gone (their objects may still exist, or may be deleted already).
  const removedPages = new Set<string>();
  const removedAnnots = new Set<string>((options.removedAnnots ?? []).map(refKey));
  for (const ref of options.originalPages ?? []) {
    const key = refKey(ref);
    if (kept.has(key) || remap.has(key)) continue;
    removedPages.add(key);
    for (const a of annotRefs(ctx.lookup(ref))) removedAnnots.add(refKey(a));
  }
  // Annotations listed on kept pages always stay, whatever their (possibly wrong) /P says.
  const keptAnnots = new Set<string>();
  for (const page of pages) for (const a of annotRefs(page.node)) keptAnnots.add(refKey(a));

  const isRemovedPageRef = (value: PDFObject | undefined): boolean => {
    if (!(value instanceof PDFRef)) return false;
    const key = refKey(value);
    if (kept.has(key) || remap.has(key)) return false;
    return removedPages.has(key) || isPageDict(ctx.lookup(value));
  };

  /** True for annotations of removed pages and structure elements of removed pages. */
  const isGone = (ref: PDFRef, target: PDFObject | undefined): boolean => {
    const key = refKey(ref);
    if (keptAnnots.has(key)) return false;
    if (removedAnnots.has(key)) return true;
    if (isAnnotDict(target) && isRemovedPageRef(target.get(N.P))) return true;
    if (target instanceof PDFDict && target.has(N.S) && target.has(N.K)) {
      const pg = target.get(N.Pg);
      if (isRemovedPageRef(pg)) return true;
      if (options.replacedPagesAreGone && pg instanceof PDFRef && remap.has(refKey(pg))) return true;
    }
    return false;
  };

  // 1. Drop link annotations on kept pages whose target page was removed.
  for (const page of pages) {
    const annots = page.node.lookup(N.Annots);
    if (!(annots instanceof PDFArray)) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const annot = annots.lookup(i);
      if (annot instanceof PDFDict && isRemovedPageRef(destinationPage(annot))) annots.remove(i);
    }
  }

  // 2. Drop form fields whose widgets were all on removed pages.
  pruneAcroForm(doc, (ref) => isGone(ref, ctx.lookup(ref)));

  // 3. Drop bookmarks that lead only to removed pages.
  pruneOutlines(doc, isRemovedPageRef);

  // 4. Mark reachable objects, severing references to removed content.
  const reachable = new Set<string>();
  const stack: PDFObject[] = [];
  const visitValue = (value: PDFObject | undefined, set: (v: PDFObject) => void): void => {
    if (value === undefined) return;
    if (value instanceof PDFRef) {
      let ref = value;
      const mapped = remap.get(refKey(ref));
      if (mapped) {
        set(mapped);
        ref = mapped;
      }
      const key = refKey(ref);
      if (reachable.has(key)) return;
      const target = ctx.lookup(ref);
      if ((isPageDict(target) && !kept.has(key)) || removedPages.has(key) || isGone(ref, target)) {
        set(PDFNull);
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
        visitValue(value, (v) => obj.set(key, v));
      }
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) {
        visitValue(obj.get(i), (v) => obj.set(i, v));
      }
    }
  }

  // 5. Delete everything that is unreachable.
  let removedObjects = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!reachable.has(refKey(ref))) {
      ctx.delete(ref);
      removedObjects++;
    }
  }
  return { removedObjects };
}

function pruneAcroForm(doc: PDFDocument, isGoneRef: (ref: PDFRef) => boolean): void {
  const acroForm = doc.catalog.lookup(N.AcroForm);
  if (!(acroForm instanceof PDFDict)) return;
  const fields = acroForm.lookup(N.Fields);
  if (!(fields instanceof PDFArray)) return;
  const ctx = doc.context;

  // Returns true if the field node should be kept.
  const pruneNode = (ref: PDFObject | undefined, depth: number): boolean => {
    if (depth > 64) return true;
    if (ref instanceof PDFRef && isGoneRef(ref)) return false;
    const node = ref instanceof PDFRef ? ctx.lookup(ref) : ref;
    if (!(node instanceof PDFDict)) return true;
    const kids = node.lookup(N.Kids);
    if (!(kids instanceof PDFArray)) return true;
    if (kids.size() === 0) return true;
    for (let i = kids.size() - 1; i >= 0; i--) {
      if (!pruneNode(kids.get(i), depth + 1)) kids.remove(i);
    }
    return kids.size() > 0;
  };

  for (let i = fields.size() - 1; i >= 0; i--) {
    if (!pruneNode(fields.get(i), 0)) fields.remove(i);
  }
}

/** Removes outline items that lead only to removed pages (relinking the lists). */
function pruneOutlines(doc: PDFDocument, isRemovedPageRef: (v: PDFObject | undefined) => boolean): void {
  const ctx = doc.context;
  const rootRef = doc.catalog.get(N.Outlines);
  const root = doc.catalog.lookup(N.Outlines);
  if (!(root instanceof PDFDict)) return;
  let budget = 200_000; // guards against cyclic lists in damaged files

  // Prunes the children of `parent`; returns how many remain.
  const pruneChildren = (parent: PDFDict, parentRef: PDFObject | undefined, depth: number): number => {
    const keptItems: PDFRef[] = [];
    const seen = new Set<string>();
    let ref = parent.get(N.First);
    while (ref instanceof PDFRef && budget-- > 0 && !seen.has(refKey(ref))) {
      seen.add(refKey(ref));
      const item = ctx.lookup(ref);
      if (!(item instanceof PDFDict)) break;
      const next = item.get(N.Next);
      const children = depth < 48 ? pruneChildren(item, ref, depth + 1) : 1;
      if (isRemovedPageRef(destinationPage(item))) {
        if (children > 0) {
          // A section heading with remaining entries: keep it, without the dead link.
          item.delete(N.Dest);
          item.delete(N.A);
          keptItems.push(ref);
        }
      } else {
        keptItems.push(ref);
      }
      ref = next;
    }
    keptItems.forEach((r, i) => {
      const item = ctx.lookup(r) as PDFDict;
      if (i > 0) item.set(N.Prev, keptItems[i - 1]!);
      else item.delete(N.Prev);
      if (i < keptItems.length - 1) item.set(N.Next, keptItems[i + 1]!);
      else item.delete(N.Next);
      if (parentRef instanceof PDFRef) item.set(N.Parent, parentRef);
    });
    if (keptItems.length) {
      parent.set(N.First, keptItems[0]!);
      parent.set(N.Last, keptItems[keptItems.length - 1]!);
    } else {
      parent.delete(N.First);
      parent.delete(N.Last);
    }
    const count = parent.lookup(N.Count);
    if (count instanceof PDFNumber || keptItems.length === 0) {
      const sign = count instanceof PDFNumber && count.asNumber() < 0 ? -1 : 1;
      if (keptItems.length) parent.set(N.Count, PDFNumber.of(sign * keptItems.length));
      else parent.delete(N.Count);
    }
    return keptItems.length;
  };

  const remaining = pruneChildren(root, rootRef, 0);
  if (remaining === 0) {
    doc.catalog.delete(N.Outlines);
    if (doc.catalog.lookup(N.PageMode) === N.UseOutlines) doc.catalog.delete(N.PageMode);
  }
}

/**
 * Detaches widget annotations from a form tree that is not part of the
 * document (pages copied from another file): the field values and sibling
 * widgets of the source form would otherwise be carried along. The widgets
 * keep their appearance, so the page looks the same.
 */
export function detachForeignWidgets(pages: { node: PDFDict }[]): void {
  for (const page of pages) {
    const annots = page.node.lookup(N.Annots);
    if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i);
      if (annot instanceof PDFDict && annot.get(N.Subtype) === N.Widget) annot.delete(N.Parent);
    }
  }
}
