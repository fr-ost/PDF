import { FONT_FAMILIES, type FontFamily } from '../pdf/winAnsi';

let ctx: CanvasRenderingContext2D | null = null;

export function cssFont(family: FontFamily): string {
  return FONT_FAMILIES.find((f) => f.value === family)?.css ?? 'sans-serif';
}

/** Approximate rendered width of text in points (metric-compatible system fonts). */
export function measureTextWidth(text: string, family: FontFamily, size: number, bold = false, italic = false): number {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * size * 0.5;
  ctx.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}100px ${cssFont(family)}`;
  return (ctx.measureText(text).width / 100) * size;
}
