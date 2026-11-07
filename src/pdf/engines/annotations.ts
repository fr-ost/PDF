/**
 * Editor object model, shared by the editor UI (rendering) and the export
 * engine. Coordinates are in display space, y-down, origin at the top-left
 * corner of the displayed page, in PDF points. This module must not import
 * pdf-lib so the UI can use it without pulling the PDF writer into the page
 * bundle.
 */
import type { FontFamily } from '../winAnsi';

interface BaseObject {
  id: string;
  page: number;
  opacity: number;
}

export interface TextObject extends BaseObject {
  type: 'text';
  x: number;
  y: number;
  text: string;
  font: FontFamily;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  size: number;
  color: string;
}

export interface DrawObject extends BaseObject {
  type: 'draw';
  /** Flat list of x,y pairs. */
  points: number[];
  color: string;
  width: number;
}

export interface ShapeObject extends BaseObject {
  type: 'rect' | 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string | null;
  strokeWidth: number;
  fill: string | null;
}

export interface LineObject extends BaseObject {
  type: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

export interface HighlightObject extends BaseObject {
  type: 'highlight';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface ImageObject extends BaseObject {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  assetId: string;
}

export interface SignatureObject extends BaseObject {
  type: 'signature';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Strokes as flat [u,v,…] lists normalised to the 0–1 box. */
  strokes: number[][];
  color: string;
  /** Stroke width as a fraction of the box height. */
  strokeRatio: number;
}

export type EditorObject = TextObject | DrawObject | ShapeObject | LineObject | HighlightObject | ImageObject | SignatureObject;

export interface EditorAsset {
  kind: 'png' | 'jpeg';
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Smooth SVG path through points using quadratic curves between midpoints. */
export function pointsToSvgPath(points: number[]): string {
  const n = Math.floor(points.length / 2);
  if (n === 0) return '';
  const f = (v: number) => Math.round(v * 100) / 100;
  const x = (i: number) => points[i * 2]!;
  const y = (i: number) => points[i * 2 + 1]!;
  if (n === 1) return `M ${f(x(0))} ${f(y(0))} L ${f(x(0) + 0.01)} ${f(y(0))}`;
  if (n === 2) return `M ${f(x(0))} ${f(y(0))} L ${f(x(1))} ${f(y(1))}`;
  let d = `M ${f(x(0))} ${f(y(0))}`;
  for (let i = 1; i < n - 1; i++) {
    const mx = (x(i) + x(i + 1)) / 2;
    const my = (y(i) + y(i + 1)) / 2;
    d += ` Q ${f(x(i))} ${f(y(i))} ${f(mx)} ${f(my)}`;
  }
  d += ` L ${f(x(n - 1))} ${f(y(n - 1))}`;
  return d;
}

export function signatureToPoints(obj: Pick<SignatureObject, 'x' | 'y' | 'w' | 'h'>, stroke: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < stroke.length; i += 2) out.push(obj.x + stroke[i]! * obj.w, obj.y + stroke[i + 1]! * obj.h);
  return out;
}

/** Arrow head triangle (y-down coordinates) as an SVG path. */
export function arrowHeadPath(obj: Pick<LineObject, 'x1' | 'y1' | 'x2' | 'y2' | 'width'>): string {
  const len = Math.max(8, obj.width * 4);
  const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
  const spread = Math.PI / 7;
  const p1 = [obj.x2 - len * Math.cos(angle - spread), obj.y2 - len * Math.sin(angle - spread)];
  const p2 = [obj.x2 - len * Math.cos(angle + spread), obj.y2 - len * Math.sin(angle + spread)];
  return `M ${obj.x2} ${obj.y2} L ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} Z`;
}

/** End point of the arrow's shaft, so the line does not poke through the head. */
export function arrowShaftEnd(obj: Pick<LineObject, 'x1' | 'y1' | 'x2' | 'y2' | 'width'>): [number, number] {
  const len = Math.max(8, obj.width * 4) * 0.8;
  const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
  const total = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
  if (total <= len) return [obj.x1, obj.y1];
  return [obj.x2 - len * Math.cos(angle), obj.y2 - len * Math.sin(angle)];
}
