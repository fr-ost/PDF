/**
 * Page range parsing and validation.
 *
 * Accepted syntax (1-based page numbers, case-insensitive):
 *   "5"          single page
 *   "1-3"        inclusive range
 *   "8-"         page 8 to the end      "-4"  first page to 4
 *   "3-last"     "last"/"end" mean the final page
 *   "odd" / "even"
 * Items are separated by commas or semicolons. Each item becomes one group,
 * which the split tool uses as one output file.
 */
export type RangeParseResult =
  | { ok: true; groups: number[][]; pages: number[] }
  | { ok: false; error: string };

const ITEM_SEPARATOR = /[,;]+/;

function parseBound(token: string, pageCount: number): number | null {
  const t = token.trim().toLowerCase();
  if (t === 'last' || t === 'end') return pageCount;
  if (!/^\d+$/.test(t)) return null;
  return Number.parseInt(t, 10);
}

export function parsePageRanges(input: string, pageCount: number): RangeParseResult {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return { ok: false, error: 'The document has no pages.' };
  }
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Enter at least one page or range, for example “1-3, 5”.' };

  const groups: number[][] = [];
  for (const rawItem of trimmed.split(ITEM_SEPARATOR)) {
    const item = rawItem.trim().toLowerCase().replace(/\s+/g, '');
    if (!item) continue;

    if (item === 'odd' || item === 'even') {
      const group: number[] = [];
      for (let p = item === 'odd' ? 1 : 2; p <= pageCount; p += 2) group.push(p - 1);
      if (group.length === 0) return { ok: false, error: `This document has no ${item} pages.` };
      groups.push(group);
      continue;
    }

    const dash = item.indexOf('-');
    if (dash === -1) {
      const page = parseBound(item, pageCount);
      if (page === null) return { ok: false, error: `“${rawItem.trim()}” is not a valid page number.` };
      if (page < 1 || page > pageCount) return { ok: false, error: outOfRange(page, pageCount) };
      groups.push([page - 1]);
      continue;
    }

    if (item.indexOf('-', dash + 1) !== -1) {
      return { ok: false, error: `“${rawItem.trim()}” is not a valid range. Use a format like 2-5.` };
    }
    const startToken = item.slice(0, dash);
    const endToken = item.slice(dash + 1);
    const start = startToken === '' ? 1 : parseBound(startToken, pageCount);
    const end = endToken === '' ? pageCount : parseBound(endToken, pageCount);
    if (start === null || end === null) {
      return { ok: false, error: `“${rawItem.trim()}” is not a valid range. Use a format like 2-5.` };
    }
    if (start < 1 || start > pageCount) return { ok: false, error: outOfRange(start, pageCount) };
    if (end < 1 || end > pageCount) return { ok: false, error: outOfRange(end, pageCount) };
    const group: number[] = [];
    if (start <= end) for (let p = start; p <= end; p++) group.push(p - 1);
    else for (let p = start; p >= end; p--) group.push(p - 1);
    groups.push(group);
  }

  if (groups.length === 0) return { ok: false, error: 'Enter at least one page or range, for example “1-3, 5”.' };
  return { ok: true, groups, pages: uniqueInOrder(groups.flat()) };
}

function outOfRange(page: number, pageCount: number): string {
  return `Page ${page} doesn’t exist — this document has ${pageCount} page${pageCount === 1 ? '' : 's'}.`;
}

export function uniqueInOrder(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Formats 0-based page indices as a compact 1-based range string ("1-3, 5"). */
export function formatPageList(indices: number[]): string {
  const sorted = uniqueInOrder(indices).sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i]!;
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
      i++;
      end = sorted[i]!;
    }
    parts.push(start === end ? `${start + 1}` : `${start + 1}-${end + 1}`);
    i++;
  }
  return parts.join(', ');
}

export type SplitMode =
  | { kind: 'every-page' }
  | { kind: 'ranges'; ranges: string }
  | { kind: 'split-before'; pages: number[] }
  | { kind: 'fixed-size'; size: number };

/** Computes the page groups (one per output file) for a split operation. */
export function computeSplitGroups(mode: SplitMode, pageCount: number): RangeParseResult {
  switch (mode.kind) {
    case 'every-page': {
      const groups = Array.from({ length: pageCount }, (_, i) => [i]);
      return { ok: true, groups, pages: groups.flat() };
    }
    case 'ranges':
      return parsePageRanges(mode.ranges, pageCount);
    case 'fixed-size': {
      if (!Number.isInteger(mode.size) || mode.size < 1) return { ok: false, error: 'Pages per file must be a whole number of at least 1.' };
      const groups: number[][] = [];
      for (let start = 0; start < pageCount; start += mode.size) {
        groups.push(Array.from({ length: Math.min(mode.size, pageCount - start) }, (_, i) => start + i));
      }
      return { ok: true, groups, pages: groups.flat() };
    }
    case 'split-before': {
      const cuts = uniqueInOrder(mode.pages.filter((p) => p > 0 && p < pageCount)).sort((a, b) => a - b);
      if (cuts.length === 0) return { ok: false, error: 'Select at least one page (other than the first) where a new file should start.' };
      const groups: number[][] = [];
      let start = 0;
      for (const cut of [...cuts, pageCount]) {
        groups.push(Array.from({ length: cut - start }, (_, i) => start + i));
        start = cut;
      }
      return { ok: true, groups, pages: groups.flat() };
    }
  }
}
