/**
 * The universal page assembler used by Merge, Split, Extract, Reorder,
 * Delete, Rotate and the Organize workspace.
 *
 * A "plan" lists output pages as (source document, page index, extra
 * rotation). Two strategies exist:
 *
 *  - `assembleInPlace` keeps the first source document as the base, so
 *    document-level features (bookmarks, forms, tags, metadata) survive
 *    reordering, rotation and deletion. Pages from other sources are copied
 *    in. Removed pages are pruned from the file completely.
 *  - `assembleNew` builds a fresh document from copied pages. Used for split
 *    parts and extracted pages, which should not inherit the whole source
 *    document's outline or forms.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNull, PDFNumber, PDFRef, degrees, type PDFObject, type PDFPage } from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { normalizeRotation } from './geometry';
import { inheritAuthorRestrictions, loadPdf, savePdf, type PdfSource } from './load';
import { setPageOrder } from './pageTree';
import { detachForeignWidgets, pruneDocument } from './prune';

export interface PagePlanItem {
  /** Index into the sources array. */
  source: number;
  /** 0-based page index within that source. */
  page: number;
  /** Additional clockwise rotation in degrees (multiple of 90). */
  rotate?: number;
}

export type ProgressFn = (value: number, label?: string) => void;
const noop: ProgressFn = () => undefined;

function validatePlan(plan: PagePlanItem[], docs: Map<number, PDFDocument>, sources: PdfSource[]): void {
  if (plan.length === 0) throw new PdfToolError('INVALID_INPUT', 'The output would contain no pages.');
  for (const item of plan) {
    const doc = docs.get(item.source);
    const name = sources[item.source]?.name;
    if (!doc) throw new PdfToolError('INVALID_INPUT', 'A page refers to a missing file.');
    if (!Number.isInteger(item.page) || item.page < 0 || item.page >= doc.getPageCount()) {
      throw new PdfToolError('INVALID_INPUT', `Page ${item.page + 1} does not exist.`, name);
    }
  }
}

function applyRotation(page: PDFPage, extra: number | undefined): void {
  if (!extra) return;
  const current = page.getRotation().angle;
  page.setRotation(degrees(normalizeRotation(current + extra)));
}

async function loadSources(sources: PdfSource[], used: Set<number>, progress: ProgressFn): Promise<Map<number, PDFDocument>> {
  const docs = new Map<number, PDFDocument>();
  let n = 0;
  for (const index of used) {
    const source = sources[index];
    if (!source) throw new PdfToolError('INVALID_INPUT', 'A page refers to a missing file.');
    progress((n / used.size) * 0.4, `Reading ${source.name}`);
    docs.set(index, (await loadPdf(source)).doc);
    n++;
  }
  return docs;
}

/** Groups consecutive plan items by source so pages sharing resources are copied together. */
async function copyForeignPages(target: PDFDocument, plan: PagePlanItem[], docs: Map<number, PDFDocument>, baseIndex: number | null): Promise<Map<number, PDFPage>> {
  const copied = new Map<number, PDFPage>(); // plan index -> page in target
  const bySource = new Map<number, number[]>();
  const baseUsed = new Set<number>();
  plan.forEach((item, idx) => {
    if (item.source === baseIndex && !baseUsed.has(item.page)) {
      baseUsed.add(item.page);
      return;
    }
    const list = bySource.get(item.source) ?? [];
    list.push(idx);
    bySource.set(item.source, list);
  });
  for (const [sourceIndex, planIndices] of bySource) {
    const src = docs.get(sourceIndex)!;
    const sourcePages = planIndices.map((i) => plan[i]!.page);
    const isolation = isolateForCopy(src, sourcePages);
    let pages: PDFPage[];
    try {
      pages = await target.copyPages(src, sourcePages);
    } finally {
      isolation.restore();
    }
    relinkCopiedPages(pages, sourcePages, isolation.replyTargets);
    // The source's form tree isn't merged: keep the widgets' appearance, not other fields' data.
    detachForeignWidgets(pages);
    planIndices.forEach((planIdx, k) => copied.set(planIdx, pages[k]!));
  }
  return copied;
}

const K = {
  Annots: PDFName.of('Annots'),
  P: PDFName.of('P'),
  Parent: PDFName.of('Parent'),
  IRT: PDFName.of('IRT'),
  Subtype: PDFName.of('Subtype'),
  Widget: PDFName.of('Widget'),
  Link: PDFName.of('Link'),
  Dest: PDFName.of('Dest'),
  A: PDFName.of('A'),
  S: PDFName.of('S'),
  D: PDFName.of('D'),
  GoTo: PDFName.of('GoTo'),
};

function destArrays(annot: PDFDict): PDFArray[] {
  const out: PDFArray[] = [];
  const dest = annot.lookup(K.Dest);
  if (dest instanceof PDFArray) out.push(dest);
  const action = annot.lookup(K.A);
  if (action instanceof PDFDict && action.get(K.S) === K.GoTo) {
    const d = action.lookup(K.D);
    if (d instanceof PDFArray) out.push(d);
  }
  return out;
}

/**
 * copyPages deep-copies everything reachable from a page. Annotation /P
 * entries, link destinations, reply chains and form trees reach other pages
 * (and through /Parent, the whole page tree with its images), which the
 * pruner then has to throw away: quadratic for "split every page". These
 * references are cut for the copy and restored afterwards; link destinations
 * temporarily hold the source page index, and replies whose comment is on a
 * copied page are remembered by position (see relinkCopiedPages).
 */
interface Isolation {
  restore: () => void;
  /** `${page}:${annotation index}` of a reply → position of the comment it replies to. */
  replyTargets: Map<string, { page: number; index: number }>;
}

const refKey = (ref: PDFRef) => `${ref.objectNumber} ${ref.generationNumber}`;

function isolateForCopy(src: PDFDocument, pageIndices: number[]): Isolation {
  const indexByRef = new Map<string, number>();
  src.getPages().forEach((p, i) => indexByRef.set(refKey(p.ref), i));
  const undo: (() => void)[] = [];
  const seenAnnots = new Set<PDFDict>();
  const seenArrays = new Set<PDFArray>();
  const pages = [...new Set(pageIndices)];
  const annotPosition = new Map<string, { page: number; index: number }>();
  for (const page of pages) {
    const annots = src.getPage(page).node.lookup(K.Annots);
    if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      if (ref instanceof PDFRef && !annotPosition.has(refKey(ref))) annotPosition.set(refKey(ref), { page, index: i });
    }
  }
  const replyTargets = new Map<string, { page: number; index: number }>();
  for (const index of pages) {
    const annots = src.getPage(index).node.lookup(K.Annots);
    if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i);
      if (!(annot instanceof PDFDict) || seenAnnots.has(annot)) continue;
      seenAnnots.add(annot);
      const irt = annot.get(K.IRT);
      const target = irt instanceof PDFRef ? annotPosition.get(refKey(irt)) : undefined;
      if (target) replyTargets.set(`${index}:${i}`, target);
      const keys = annot.get(K.Subtype) === K.Widget ? [K.P, K.IRT, K.Parent] : [K.P, K.IRT];
      for (const key of keys) {
        const value: PDFObject | undefined = annot.get(key);
        if (value === undefined) continue;
        annot.delete(key);
        undo.push(() => annot.set(key, value));
      }
      for (const arr of destArrays(annot)) {
        if (seenArrays.has(arr)) continue;
        seenArrays.add(arr);
        const first = arr.get(0);
        if (!(first instanceof PDFRef)) continue;
        const target = indexByRef.get(refKey(first));
        if (target === undefined) continue;
        arr.set(0, PDFNumber.of(target));
        undo.push(() => arr.set(0, first));
      }
    }
  }
  return {
    restore: () => {
      for (let i = undo.length - 1; i >= 0; i--) undo[i]!();
    },
    replyTargets,
  };
}

/**
 * Points copied links at the copied pages (links to pages that were not copied
 * are dropped) and reconnects replies to their comments: on the same copy of a
 * page, or on the first copy of another copied page.
 */
function relinkCopiedPages(pages: PDFPage[], sourceIndices: number[], replyTargets: Isolation['replyTargets']): void {
  const byIndex = new Map<number, PDFRef>();
  const firstCopy = new Map<number, number>();
  sourceIndices.forEach((index, k) => {
    if (!byIndex.has(index)) byIndex.set(index, pages[k]!.ref);
    if (!firstCopy.has(index)) firstCopy.set(index, k);
  });
  // Replies first: positions refer to the annotation arrays as copied.
  if (replyTargets.size) {
    pages.forEach((page, k) => {
      const source = sourceIndices[k]!;
      const annots = page.node.lookup(K.Annots);
      if (!(annots instanceof PDFArray)) return;
      for (let i = 0; i < annots.size(); i++) {
        const target = replyTargets.get(`${source}:${i}`);
        if (!target) continue;
        const targetCopy = target.page === source ? k : firstCopy.get(target.page);
        const targetAnnots = targetCopy === undefined ? undefined : pages[targetCopy]!.node.lookup(K.Annots);
        const targetRef = targetAnnots instanceof PDFArray ? targetAnnots.get(target.index) : undefined;
        const reply = annots.lookup(i);
        if (targetRef instanceof PDFRef && reply instanceof PDFDict) reply.set(K.IRT, targetRef);
      }
    });
  }
  for (const page of pages) {
    const annots = page.node.lookup(K.Annots);
    if (!(annots instanceof PDFArray)) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const annot = annots.lookup(i);
      if (!(annot instanceof PDFDict)) continue;
      annot.set(K.P, page.ref);
      let dead = false;
      for (const arr of destArrays(annot)) {
        const first = arr.get(0);
        if (!(first instanceof PDFNumber)) continue;
        const target = byIndex.get(first.asNumber());
        if (target) arr.set(0, target);
        else {
          arr.set(0, PDFNull);
          dead = true;
        }
      }
      if (dead && annot.get(K.Subtype) === K.Link) annots.remove(i);
    }
  }
}

export async function assembleInPlace(sources: PdfSource[], plan: PagePlanItem[], progress: ProgressFn = noop): Promise<Uint8Array> {
  const used = new Set(plan.map((p) => p.source));
  const docs = await loadSources(sources, used, progress);
  validatePlan(plan, docs, sources);

  const baseIndex = plan[0]!.source;
  const base = docs.get(baseIndex)!;
  const originalPages: PDFRef[] = base.getPages().map((p) => p.ref);
  const basePages = base.getPages();

  progress(0.5, 'Arranging pages');
  const copied = await copyForeignPages(base, plan, docs, baseIndex);
  const seenBase = new Set<number>();
  const finalPages: PDFPage[] = plan.map((item, idx) => {
    if (item.source === baseIndex && !seenBase.has(item.page) && !copied.has(idx)) {
      seenBase.add(item.page);
      return basePages[item.page]!;
    }
    return copied.get(idx)!;
  });

  setPageOrder(base, finalPages.map((p) => p.ref));
  plan.forEach((item, idx) => applyRotation(finalPages[idx]!, item.rotate));
  // Pages imported from restricted files bring their restrictions along.
  inheritAuthorRestrictions(base, docs.values());

  progress(0.75, 'Cleaning up');
  pruneDocument(base, { originalPages });
  progress(0.85, 'Saving');
  const out = await savePdf(base);
  progress(1);
  return out;
}

/** Builds a new document from already-loaded sources. */
export async function assembleNewFromDocs(docs: Map<number, PDFDocument>, plan: PagePlanItem[]): Promise<PDFDocument> {
  const target = await PDFDocument.create({ updateMetadata: false });
  inheritAuthorRestrictions(target, new Set(plan.map((item) => docs.get(item.source)!)));
  const copied = await copyForeignPages(target, plan, docs, null);
  plan.forEach((item, idx) => {
    const page = copied.get(idx)!;
    target.addPage(page);
    applyRotation(page, item.rotate);
  });
  pruneDocument(target);
  return target;
}

export async function assembleNew(sources: PdfSource[], plan: PagePlanItem[], progress: ProgressFn = noop): Promise<Uint8Array> {
  const used = new Set(plan.map((p) => p.source));
  const docs = await loadSources(sources, used, progress);
  validatePlan(plan, docs, sources);
  progress(0.5, 'Combining pages');
  const target = await assembleNewFromDocs(docs, plan);
  progress(0.85, 'Saving');
  const out = await savePdf(target);
  progress(1);
  return out;
}

export interface SplitPart {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

/** Splits one source into several documents, loading the source only once. */
export async function splitDocument(source: PdfSource, groups: number[][], names: string[], progress: ProgressFn = noop): Promise<SplitPart[]> {
  if (groups.length === 0) throw new PdfToolError('INVALID_INPUT', 'Nothing to split.');
  progress(0.02, `Reading ${source.name}`);
  const { doc } = await loadPdf(source);
  const docs = new Map([[0, doc]]);
  const parts: SplitPart[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;
    const plan = group.map((page) => ({ source: 0, page }));
    validatePlan(plan, docs, [source]);
    const part = await assembleNewFromDocs(docs, plan);
    parts.push({ name: names[i] ?? `part-${i + 1}.pdf`, bytes: await savePdf(part), pageCount: group.length });
    progress(0.05 + ((i + 1) / groups.length) * 0.95, `Created ${i + 1} of ${groups.length} files`);
  }
  return parts;
}
