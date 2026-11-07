/** Editor object helpers: defaults, bounds, moving and resizing. */
import type { EditorObject, TextObject } from '../../pdf/engines/annotations';
import { FONT_ASCENT, FONT_DESCENT, LINE_HEIGHT } from '../../pdf/winAnsi';
import { measureTextWidth } from '../../utils/measureText';

export type EditorTool = 'select' | 'text' | 'draw' | 'highlight' | 'rect' | 'ellipse' | 'line' | 'arrow';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ToolDefaults {
  text: Pick<TextObject, 'font' | 'size' | 'color' | 'bold' | 'italic' | 'underline'>;
  draw: { color: string; width: number; opacity: number };
  shape: { stroke: string | null; fill: string | null; strokeWidth: number; opacity: number };
  line: { color: string; width: number; opacity: number };
  highlight: { color: string; opacity: number };
}

export const DEFAULTS: ToolDefaults = {
  text: { font: 'Helvetica', size: 16, color: '#111827', bold: false, italic: false, underline: false },
  draw: { color: '#2563eb', width: 2.5, opacity: 1 },
  shape: { stroke: '#dc2626', fill: null, strokeWidth: 2, opacity: 1 },
  line: { color: '#111827', width: 2, opacity: 1 },
  highlight: { color: '#fde047', opacity: 0.45 },
};

export function newId(): string {
  return crypto.randomUUID();
}

export function textLines(obj: TextObject): string[] {
  return obj.text.split('\n');
}

export function textBounds(obj: TextObject): Bounds {
  const lines = textLines(obj);
  const width = Math.max(obj.size * 0.5, ...lines.map((l) => measureTextWidth(l, obj.font, obj.size, obj.bold, obj.italic)));
  const height = (lines.length - 1) * obj.size * LINE_HEIGHT + obj.size * (FONT_ASCENT[obj.font] + FONT_DESCENT[obj.font]);
  return { x: obj.x, y: obj.y, w: width, h: height };
}

export function objectBounds(obj: EditorObject): Bounds {
  switch (obj.type) {
    case 'text':
      return textBounds(obj);
    case 'draw': {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i + 1 < obj.points.length; i += 2) {
        xs.push(obj.points[i]!);
        ys.push(obj.points[i + 1]!);
      }
      const pad = obj.width / 2;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
    }
    case 'line':
    case 'arrow': {
      const pad = Math.max(obj.width, 4);
      const x = Math.min(obj.x1, obj.x2) - pad;
      const y = Math.min(obj.y1, obj.y2) - pad;
      return { x, y, w: Math.abs(obj.x2 - obj.x1) + 2 * pad, h: Math.abs(obj.y2 - obj.y1) + 2 * pad };
    }
    default:
      return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  }
}

export function moveObject(obj: EditorObject, dx: number, dy: number): EditorObject {
  switch (obj.type) {
    case 'draw':
      return { ...obj, points: obj.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
    case 'line':
    case 'arrow':
      return { ...obj, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy };
    default:
      return { ...obj, x: obj.x + dx, y: obj.y + dy };
  }
}

export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'p1' | 'p2';

export function isBoxObject(obj: EditorObject): obj is Extract<EditorObject, { w: number }> {
  return 'w' in obj && 'h' in obj;
}

/** Resizes from a corner handle; images and signatures keep their aspect ratio. */
export function resizeObject(start: EditorObject, handle: Handle, px: number, py: number): EditorObject {
  if ((start.type === 'line' || start.type === 'arrow') && (handle === 'p1' || handle === 'p2')) {
    return handle === 'p1' ? { ...start, x1: px, y1: py } : { ...start, x2: px, y2: py };
  }
  if (!isBoxObject(start)) return start;
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  const anchorX = handle === 'nw' || handle === 'sw' ? right : start.x;
  const anchorY = handle === 'nw' || handle === 'ne' ? bottom : start.y;
  let w = Math.max(4, Math.abs(px - anchorX));
  let h = Math.max(4, Math.abs(py - anchorY));
  if (start.type === 'image' || start.type === 'signature') {
    const ratio = start.w / start.h;
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
  }
  const x = px < anchorX ? anchorX - w : anchorX;
  const y = py < anchorY ? anchorY - h : anchorY;
  return { ...start, x, y, w, h };
}

export function clampToPage(obj: EditorObject, pageW: number, pageH: number): EditorObject {
  const b = objectBounds(obj);
  const dx = b.x < -b.w + 10 ? -b.w + 10 - b.x : b.x > pageW - 10 ? pageW - 10 - b.x : 0;
  const dy = b.y < -b.h + 10 ? -b.h + 10 - b.y : b.y > pageH - 10 ? pageH - 10 - b.y : 0;
  return dx || dy ? moveObject(obj, dx, dy) : obj;
}
