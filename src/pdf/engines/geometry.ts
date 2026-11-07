/**
 * Page geometry helpers.
 *
 * "Display space" is the page as a viewer shows it: the visible box (CropBox
 * clipped to the MediaBox) after applying the page's /Rotate value. All tools
 * that place content (editor, watermark, page numbers, redaction) work in
 * display space so that "top-left" always means the top-left the user sees.
 *
 * Display space here is y-up with the origin at the bottom-left corner of the
 * displayed page, measured in PDF points. `displayToUserMatrix` converts it to
 * the page's native user space, including the rotation.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, type PDFPage } from '@cantoo/pdf-lib';

export type Matrix = [number, number, number, number, number, number];
export type Rotation = 0 | 90 | 180 | 270;
export type Box = [number, number, number, number];

export interface PageGeometry {
  /** Visible box in user space [x0, y0, x1, y1], normalised so x0<x1, y0<y1. */
  box: Box;
  rotation: Rotation;
  /** Width/height of the page as displayed (after rotation), in points. */
  width: number;
  height: number;
}

export function normalizeRotation(value: number): Rotation {
  const r = (((Math.round(value / 90) * 90) % 360) + 360) % 360;
  return r as Rotation;
}

function readBox(dict: PDFDict, key: string): Box | undefined {
  // Walk the inheritance chain (MediaBox/CropBox can be inherited).
  let node: PDFDict | undefined = dict;
  const visited = new Set<PDFDict>();
  while (node && !visited.has(node)) {
    visited.add(node);
    const value = node.lookup(PDFName.of(key));
    if (value instanceof PDFArray && value.size() === 4) {
      const nums = [0, 1, 2, 3].map((i) => {
        const n = value.lookup(i);
        return n instanceof PDFNumber ? n.asNumber() : Number.NaN;
      });
      if (nums.every((n) => Number.isFinite(n))) {
        const [a, b, c, d] = nums as [number, number, number, number];
        return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
      }
    }
    const parent: unknown = node.lookup(PDFName.of('Parent'));
    node = parent instanceof PDFDict ? parent : undefined;
  }
  return undefined;
}

export function intersectBoxes(a: Box, b: Box): Box {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  if (x1 - x0 < 1 || y1 - y0 < 1) return a; // degenerate crop box: fall back
  return [x0, y0, x1, y1];
}

export function getPageGeometry(page: PDFPage): PageGeometry {
  const media = readBox(page.node, 'MediaBox') ?? [0, 0, 612, 792];
  const crop = readBox(page.node, 'CropBox');
  const box = crop ? intersectBoxes(media, crop) : media;
  const rotation = normalizeRotation(page.getRotation().angle);
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  const swap = rotation === 90 || rotation === 270;
  return { box, rotation, width: swap ? h : w, height: swap ? w : h };
}

/** Matrix mapping y-up display space to the page's user space. */
export function displayToUserMatrix(g: PageGeometry): Matrix {
  const [x0, y0, x1, y1] = g.box;
  switch (g.rotation) {
    case 0:
      return [1, 0, 0, 1, x0, y0];
    case 90:
      return [0, 1, -1, 0, x1, y0];
    case 180:
      return [-1, 0, 0, -1, x1, y1];
    case 270:
      return [0, -1, 1, 0, x0, y1];
  }
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  // Result applies m1 first, then m2 (PDF convention: m1 × m2).
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

/** Standard paper sizes in PDF points (portrait). */
export const PAPER_SIZES = {
  a3: { label: 'A3', width: 841.89, height: 1190.55 },
  a4: { label: 'A4', width: 595.28, height: 841.89 },
  a5: { label: 'A5', width: 419.53, height: 595.28 },
  letter: { label: 'US Letter', width: 612, height: 792 },
  legal: { label: 'US Legal', width: 612, height: 1008 },
} as const;
export type PaperSize = keyof typeof PAPER_SIZES;

export const MM_TO_PT = 72 / 25.4;
export const IN_TO_PT = 72;
