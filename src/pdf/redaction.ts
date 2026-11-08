/**
 * Pure geometry for the redaction workflow (no PDF.js / pdf-lib imports).
 * Coordinates: display space, y-down, points, origin top-left of the
 * displayed page (PDF.js viewport at scale 1).
 */
import type { RedactionTextItem } from './engines/redact';

export interface RedactionBox {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the box came from, for display purposes. */
  source: 'manual' | 'search' | 'page';
}

/** Minimal shape of a PDF.js TextItem. */
export interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  /** The item ends a line (PDF.js). */
  hasEOL?: boolean;
  /** Vertical writing (e.g. Japanese columns): PDF.js then reports the run length as `height`. */
  vertical?: boolean;
}

export interface TextGeometry {
  vertical?: boolean;
  /** Baseline origin (display, y-down). */
  x: number;
  y: number;
  /** Baseline angle in radians (y-down, positive = clockwise). */
  angle: number;
  width: number;
  fontSize: number;
  /** Axis-aligned bounding box [x0, y0, x1, y1] (y-down). */
  bbox: [number, number, number, number];
}

type M = [number, number, number, number, number, number];

function multiply(m1: M, m2: number[]): M {
  return [
    m1[0] * m2[0]! + m1[2] * m2[1]!,
    m1[1] * m2[0]! + m1[3] * m2[1]!,
    m1[0] * m2[2]! + m1[2] * m2[3]!,
    m1[1] * m2[2]! + m1[3] * m2[3]!,
    m1[0] * m2[4]! + m1[2] * m2[5]! + m1[4],
    m1[1] * m2[4]! + m1[3] * m2[5]! + m1[5],
  ];
}

const ASCENT = 0.92;
const DESCENT = 0.28;

/** Geometry of a text item, optionally restricted to a fraction [from, to] of its run. */
export function textItemGeometry(item: TextItemLike, viewportTransform: number[], from = 0, to = 1): TextGeometry {
  const tx = multiply(viewportTransform as M, item.transform);
  const fontSize = Math.hypot(tx[2], tx[3]) || Math.abs(item.height) || 1;
  const angle = Math.atan2(tx[1], tx[0]);
  const scale = Math.hypot(viewportTransform[0]!, viewportTransform[1]!) || 1;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  // "Up" direction perpendicular to the baseline (y-down coordinates).
  const vx = Math.sin(angle);
  const vy = -Math.cos(angle);
  const bboxOf = (corners: [number, number][]): [number, number, number, number] => {
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  if (item.vertical) {
    // The run goes down the column from the origin; across it, be generous
    // (glyphs may be centred on the origin or start at it).
    const run = Math.abs(item.height) * scale;
    const s0 = run * Math.max(0, from);
    const s1 = run * Math.max(from, to);
    const corners: [number, number][] = [];
    for (const sAlong of [s0, s1]) for (const across of [-0.75 * fontSize, 1.25 * fontSize]) corners.push([tx[4] - vx * sAlong + ux * across, tx[5] - vy * sAlong + uy * across]);
    return { x: tx[4], y: tx[5], angle, width: s1 - s0, fontSize, bbox: bboxOf(corners), vertical: true };
  }
  const fullWidth = Math.abs(item.width) * scale;
  const ox = tx[4] + ux * fullWidth * from;
  const oy = tx[5] + uy * fullWidth * from;
  const width = fullWidth * Math.max(0, to - from);
  const corners: [number, number][] = [
    [ox - vx * fontSize * DESCENT, oy - vy * fontSize * DESCENT],
    [ox + ux * width - vx * fontSize * DESCENT, oy + uy * width - vy * fontSize * DESCENT],
    [ox + vx * fontSize * ASCENT, oy + vy * fontSize * ASCENT],
    [ox + ux * width + vx * fontSize * ASCENT, oy + uy * width + vy * fontSize * ASCENT],
  ];
  return { x: ox, y: oy, angle, width, fontSize, bbox: bboxOf(corners) };
}

export function boxIntersects(bbox: [number, number, number, number], box: Pick<RedactionBox, 'x' | 'y' | 'w' | 'h'>, padding = 1): boolean {
  return bbox[0] < box.x + box.w + padding && bbox[2] > box.x - padding && bbox[1] < box.y + box.h + padding && bbox[3] > box.y - padding;
}

/**
 * Splits a page's text into items that may stay searchable (entirely outside
 * every box) and items that are removed. Removal is conservative: an item
 * that touches a box at all is dropped completely.
 */
export function partitionTextItems(
  items: TextItemLike[],
  boxes: Pick<RedactionBox, 'x' | 'y' | 'w' | 'h'>[],
  viewportTransform: number[],
  pageHeight: number,
): { keep: RedactionTextItem[]; removed: number } {
  const keep: RedactionTextItem[] = [];
  let removed = 0;
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const g = textItemGeometry(item, viewportTransform);
    if (boxes.some((b) => boxIntersects(g.bbox, b, 1.5))) {
      removed++;
      continue;
    }
    // The invisible text layer is horizontal; vertical columns are left out rather than misplaced.
    if (g.vertical) continue;
    keep.push({ text: item.str, x: g.x, y: pageHeight - g.y, width: g.width, height: g.fontSize, angle: -g.angle });
  }
  return { keep, removed };
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface JoinedText {
  text: string;
  /** For each character of `text`: the item it comes from (-1 for inserted separators) and its index there. */
  item: number[];
  char: number[];
}

/**
 * Joins a page's text items into one string, so words split across items
 * (bold first name, line breaks, kerning) can be found. A space or line break
 * is inserted where the layout shows one but the text has none.
 */
function joinItems(items: TextItemLike[], viewportTransform: number[]): JoinedText {
  const out: JoinedText = { text: '', item: [], char: [] };
  const push = (ch: string, item: number, char: number) => {
    out.text += ch;
    out.item.push(item);
    out.char.push(char);
  };
  let prev: { g: TextGeometry; eol: boolean } | null = null;
  const endsWithSpace = () => /\s/.test(out.text.charAt(out.text.length - 1));
  items.forEach((it, index) => {
    if (!it.str) {
      if (it.hasEOL && out.text && !endsWithSpace()) push('\n', -1, -1);
      return;
    }
    const g = textItemGeometry(it, viewportTransform);
    if (prev && out.text && !endsWithSpace() && !/^\s/.test(it.str)) {
      if (prev.eol) push('\n', -1, -1);
      else {
        const endX = prev.g.vertical ? prev.g.x : prev.g.x + Math.cos(prev.g.angle) * prev.g.width;
        const endY = prev.g.vertical ? prev.g.y + prev.g.width : prev.g.y + Math.sin(prev.g.angle) * prev.g.width;
        const gap = Math.hypot(g.x - endX, g.y - endY);
        const sameLine = Math.abs(prev.g.vertical ? g.x - prev.g.x : g.y - prev.g.y) < 0.5 * g.fontSize;
        if (!sameLine) push('\n', -1, -1);
        else if (gap > 0.2 * g.fontSize) push(' ', -1, -1);
      }
    }
    for (let c = 0; c < it.str.length; c++) push(it.str[c]!, index, c);
    prev = { g, eol: !!it.hasEOL };
  });
  return out;
}

function queryPattern(query: string, options: SearchOptions): RegExp | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  // Whitespace in the query matches any (or no) whitespace between items.
  const body = words.map(escapeRegExp).join('\\s*');
  return new RegExp(options.wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, options.caseSensitive ? 'gu' : 'giu');
}

/** Finds occurrences of a query in a page's text (also across items) and returns covering boxes. */
export function findTextBoxes(items: TextItemLike[], query: string, viewportTransform: number[], options: SearchOptions): { x: number; y: number; w: number; h: number }[] {
  const pattern = queryPattern(query, options);
  if (!pattern) return [];
  const joined = joinItems(items, viewportTransform);
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  for (const match of joined.text.matchAll(pattern)) {
    const start = match.index ?? 0;
    // Character range covered in each item touched by the match.
    const ranges = new Map<number, [number, number]>();
    for (let k = start; k < start + match[0].length; k++) {
      const item = joined.item[k]!;
      if (item < 0) continue;
      const c = joined.char[k]!;
      const r = ranges.get(item);
      if (r) r[1] = c + 1;
      else ranges.set(item, [c, c + 1]);
    }
    for (const [index, [from, to]] of ranges) {
      const item = items[index]!;
      const len = item.str.length || 1;
      const g = textItemGeometry(item, viewportTransform, from / len, to / len);
      // Character widths vary, so pad generously along the baseline.
      const padX = g.fontSize * 0.35;
      const padY = g.fontSize * (g.vertical ? 0.35 : 0.08);
      boxes.push({ x: g.bbox[0] - padX, y: g.bbox[1] - padY, w: g.bbox[2] - g.bbox[0] + 2 * padX, h: g.bbox[3] - g.bbox[1] + 2 * padY });
    }
  }
  return boxes;
}

/** True if the page's text (joined across items, as for search) contains the term. */
export function pageTextContains(items: TextItemLike[], term: string, viewportTransform: number[], options: SearchOptions): boolean {
  const pattern = queryPattern(term, options);
  if (!pattern) return false;
  pattern.lastIndex = 0;
  return pattern.test(joinItems(items, viewportTransform).text);
}
