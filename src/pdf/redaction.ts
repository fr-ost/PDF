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
}

export interface TextGeometry {
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

/** Geometry of a text item, optionally restricted to a fraction [from, to] of its width. */
export function textItemGeometry(item: TextItemLike, viewportTransform: number[], from = 0, to = 1): TextGeometry {
  const tx = multiply(viewportTransform as M, item.transform);
  const fontSize = Math.hypot(tx[2], tx[3]) || Math.abs(item.height) || 1;
  const angle = Math.atan2(tx[1], tx[0]);
  const scale = Math.hypot(viewportTransform[0]!, viewportTransform[1]!) || 1;
  const fullWidth = Math.abs(item.width) * scale;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  // "Up" direction perpendicular to the baseline (y-down coordinates).
  const vx = Math.sin(angle);
  const vy = -Math.cos(angle);
  const ox = tx[4] + ux * fullWidth * from;
  const oy = tx[5] + uy * fullWidth * from;
  const width = fullWidth * Math.max(0, to - from);
  const corners: [number, number][] = [
    [ox - vx * fontSize * DESCENT, oy - vy * fontSize * DESCENT],
    [ox + ux * width - vx * fontSize * DESCENT, oy + uy * width - vy * fontSize * DESCENT],
    [ox + vx * fontSize * ASCENT, oy + vy * fontSize * ASCENT],
    [ox + ux * width + vx * fontSize * ASCENT, oy + uy * width + vy * fontSize * ASCENT],
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x: ox, y: oy, angle, width, fontSize, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
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

/** Finds occurrences of a query in a page's text items and returns covering boxes. */
export function findTextBoxes(items: TextItemLike[], query: string, viewportTransform: number[], options: SearchOptions): { x: number; y: number; w: number; h: number }[] {
  const q = query.trim();
  if (!q) return [];
  const pattern = new RegExp(options.wholeWord ? `(?<![\\p{L}\\p{N}])${escapeRegExp(q)}(?![\\p{L}\\p{N}])` : escapeRegExp(q), options.caseSensitive ? 'gu' : 'giu');
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  for (const item of items) {
    if (!item.str) continue;
    const len = item.str.length;
    for (const match of item.str.matchAll(pattern)) {
      const start = match.index ?? 0;
      const g = textItemGeometry(item, viewportTransform, start / len, (start + match[0].length) / len);
      // Character widths vary, so pad generously along the baseline.
      const padX = g.fontSize * 0.35;
      const padY = g.fontSize * 0.08;
      boxes.push({ x: g.bbox[0] - padX, y: g.bbox[1] - padY, w: g.bbox[2] - g.bbox[0] + 2 * padX, h: g.bbox[3] - g.bbox[1] + 2 * padY });
    }
  }
  return boxes;
}
