/**
 * Placement geometry for watermarks and page numbers (pure; shared by the
 * live previews and the engines). Coordinates are y-up display space.
 */
export type Anchor = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface Size {
  w: number;
  h: number;
}

export function rotatedHalfExtents({ w, h }: Size, rotationDeg: number): { ex: number; ey: number } {
  const t = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return { ex: (w / 2) * c + (h / 2) * s, ey: (w / 2) * s + (h / 2) * c };
}

export function anchorCenters(anchor: Anchor | 'tile', page: Size, item: Size, rotation: number, margin: number): [number, number][] {
  const { ex, ey } = rotatedHalfExtents(item, rotation);
  if (anchor === 'tile') {
    const gap = Math.max(36, Math.min(item.w, item.h) * 0.8);
    const sx = 2 * ex + gap;
    const sy = 2 * ey + gap;
    const centers: [number, number][] = [];
    let row = 0;
    for (let y = sy / 2; y < page.h + sy; y += sy, row++) {
      const offset = row % 2 === 0 ? 0 : sx / 2;
      for (let x = sx / 2 - offset; x < page.w + sx; x += sx) centers.push([x, y]);
      if (centers.length > 400) break;
    }
    return centers;
  }
  const [v, hz] = anchor === 'center' ? ['middle', 'center'] : (anchor.split('-') as [string, string]);
  const x = hz === 'left' ? margin + ex : hz === 'right' ? page.w - margin - ex : page.w / 2;
  const y = v === 'top' ? page.h - margin - ey : v === 'bottom' ? margin + ey : page.h / 2;
  return [[x, y]];
}

/** Origin (bottom-left of the unrotated box) so the box is centred on (cx, cy). */
export function originForCenter(cx: number, cy: number, { w, h }: Size, rotationDeg: number): [number, number] {
  const t = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [cx - ((w / 2) * c - (h / 2) * s), cy - ((w / 2) * s + (h / 2) * c)];
}

