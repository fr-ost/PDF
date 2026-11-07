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
import { PDFDocument, degrees, type PDFPage, type PDFRef } from '@cantoo/pdf-lib';
import { PdfToolError } from '../errors';
import { normalizeRotation } from './geometry';
import { loadPdf, savePdf, type PdfSource } from './load';
import { setPageOrder } from './pageTree';
import { pruneDocument } from './prune';

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
    const pages = await target.copyPages(src, planIndices.map((i) => plan[i]!.page));
    planIndices.forEach((planIdx, k) => copied.set(planIdx, pages[k]!));
  }
  return copied;
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
