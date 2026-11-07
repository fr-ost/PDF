import { describe, expect, it } from 'vitest';
import { addWatermark, anchorCenters, originForCenter, type WatermarkOptions } from '../../src/pdf/engines/watermark';
import { addPageNumbers, formatPageNumber, type PageNumberOptions } from '../../src/pdf/engines/pageNumbers';
import { applyEditorObjects } from '../../src/pdf/engines/editorExport';
import type { EditorObject } from '../../src/pdf/engines/annotations';
import { pointsToSvgPath } from '../../src/pdf/engines/annotations';
import { displayToUserMatrix, applyMatrix } from '../../src/pdf/engines/geometry';
import { findUnsupportedChars, toWinAnsi } from '../../src/pdf/winAnsi';
import { makePng, makeTextPdf, source } from '../helpers/fixtures';
import { extractText, renderPage } from '../helpers/pdfjs';

const wm: WatermarkOptions = {
  type: 'text', text: 'CONFIDENTIAL', font: 'Helvetica', bold: true, italic: false, fontSize: 48, color: '#ff0000', imageScale: 0.3,
  opacity: 1, rotation: 0, position: 'center', layer: 'over', margin: 24, pages: [0, 1],
};

describe('geometry', () => {
  it('maps display corners to user space for every rotation', () => {
    const box: [number, number, number, number] = [10, 20, 110, 220]; // 100 x 200
    const expectations: Record<number, [number, number]> = { 0: [10, 20], 90: [110, 20], 180: [110, 220], 270: [10, 220] };
    for (const rotation of [0, 90, 180, 270] as const) {
      const swap = rotation % 180 !== 0;
      const g = { box, rotation, width: swap ? 200 : 100, height: swap ? 100 : 200 };
      expect(applyMatrix(displayToUserMatrix(g), 0, 0)).toEqual(expectations[rotation]);
    }
  });
});

describe('watermark', () => {
  it('computes anchor centres inside the margins', () => {
    const [[x, y]] = anchorCenters('top-left', { w: 600, h: 800 }, { w: 100, h: 20 }, 0, 10) as [[number, number]];
    expect(x).toBe(60);
    expect(y).toBe(780);
    expect(anchorCenters('tile', { w: 600, h: 800 }, { w: 100, h: 20 }, 45, 10).length).toBeGreaterThan(10);
    const [ox, oy] = originForCenter(100, 100, { w: 40, h: 20 }, 90);
    expect(ox).toBeCloseTo(110);
    expect(oy).toBeCloseTo(80);
  });

  it('adds a text watermark to the selected pages only', async () => {
    const out = await addWatermark(source(await makeTextPdf({ pages: 3 })), wm);
    const text = await extractText(out);
    expect(text[0]).toContain('CONFIDENTIAL');
    expect(text[1]).toContain('CONFIDENTIAL');
    expect(text[2]).not.toContain('CONFIDENTIAL');
    const page = await renderPage(out, 1);
    // Red ink near the centre of the page.
    let red = 0;
    for (let x = 200; x < 400; x += 4) {
      const [r, g, b] = page.pixel(x, 421 - 12);
      if (r > 200 && g < 80 && b < 80) red++;
    }
    expect(red).toBeGreaterThan(5);
  });

  it('places watermarks relative to the visible page on rotated pages', async () => {
    const out = await addWatermark(source(await makeTextPdf({ pages: 1, rotate: [90] })), { ...wm, position: 'top-left', pages: [0], fontSize: 30 });
    const page = await renderPage(out, 1);
    expect(page.width).toBe(842); // landscape as displayed
    let red = 0;
    for (let x = 30; x < 200; x += 3) for (let y = 25; y < 55; y += 3) {
      const [r, g, b] = page.pixel(x, y);
      if (r > 200 && g < 90 && b < 90) red++;
    }
    expect(red).toBeGreaterThan(5);
  });

  it('supports image watermarks and the behind-content layer', async () => {
    const png = makePng(50, 50, (ctx) => {
      ctx.fillStyle = '#00aa00';
      ctx.fillRect(0, 0, 50, 50);
    });
    const out = await addWatermark(source(await makeTextPdf({ pages: 1 })), { ...wm, type: 'image', image: { kind: 'png', bytes: png }, layer: 'under', pages: [0] });
    const page = await renderPage(out, 1);
    const [r, g] = page.pixel(297, 420);
    expect(g).toBeGreaterThan(120);
    expect(r).toBeLessThan(60);
    expect((await extractText(out))[0]).toContain('Page 1');
  });

  it('validates input', async () => {
    const pdf = await makeTextPdf({ pages: 1 });
    await expect(addWatermark(source(pdf), { ...wm, text: '  ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(addWatermark(source(pdf), { ...wm, pages: [5] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(addWatermark(source(pdf), { ...wm, type: 'image' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('page numbers', () => {
  const opts: PageNumberOptions = { position: 'bottom-center', margin: 30, startNumber: 1, format: 'page-n-of-total', prefix: '', suffix: '', font: 'Helvetica', bold: false, fontSize: 11, color: '#000000', pages: [0, 1, 2] };

  it('formats labels', () => {
    expect(formatPageNumber(3, 9, { format: 'n', prefix: '- ', suffix: ' -' })).toBe('- 3 -');
    expect(formatPageNumber(3, 9, { format: 'n-of-total', prefix: '', suffix: '' })).toBe('3 of 9');
    expect(formatPageNumber(3, 9, { format: 'page-n', prefix: '', suffix: '' })).toBe('Page 3');
  });

  it('numbers selected pages with a custom start', async () => {
    const out = await addPageNumbers(source(await makeTextPdf({ pages: 4 })), { ...opts, pages: [1, 2, 3], startNumber: 5 });
    const text = await extractText(out);
    expect(text[0]).not.toMatch(/Page \d+ of/);
    expect(text[1]).toContain('Page 5 of 7');
    expect(text[3]).toContain('Page 7 of 7');
  });

  it('rejects bad start numbers', async () => {
    await expect(addPageNumbers(source(await makeTextPdf({ pages: 1 })), { ...opts, startNumber: -1, pages: [0] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('editor export', () => {
  it('draws text at the displayed position, even on rotated pages', async () => {
    const objects: EditorObject[] = [
      { id: 't', page: 0, type: 'text', x: 40, y: 40, text: 'Hello editor', font: 'Helvetica', bold: false, italic: false, underline: true, size: 20, color: '#0000ff', opacity: 1 },
      { id: 'r', page: 0, type: 'rect', x: 300, y: 300, w: 100, h: 50, stroke: null, strokeWidth: 0, fill: '#00ff00', opacity: 1 },
      { id: 'h', page: 0, type: 'highlight', x: 40, y: 200, w: 100, h: 20, color: '#ffff00', opacity: 0.5 },
      { id: 'd', page: 0, type: 'draw', points: [10, 500, 50, 520, 90, 500], color: '#000000', width: 2, opacity: 1 },
      { id: 'a', page: 0, type: 'arrow', x1: 100, y1: 450, x2: 200, y2: 450, color: '#000000', width: 2, opacity: 1 },
      { id: 's', page: 0, type: 'signature', x: 400, y: 450, w: 100, h: 40, strokes: [[0, 0.5, 0.5, 0.2, 1, 0.8]], color: '#000000', strokeRatio: 0.05, opacity: 1 },
    ];
    const out = await applyEditorObjects(source(await makeTextPdf({ pages: 1, rotate: [90] })), objects, {});
    expect((await extractText(out))[0]).toContain('Hello editor');
    const page = await renderPage(out, 1);
    const [r, g, b] = page.pixel(350, 325);
    expect([r > 200 ? 0 : 1, g > 200 ? 1 : 0, b < 80 ? 1 : 0].join('')).toBe('111');
    // Blue text ink near (45-200, 45-60)
    let blue = 0;
    for (let x = 40; x < 200; x += 2) for (let y = 42; y < 62; y += 2) {
      const [pr, pg, pb] = page.pixel(x, y);
      if (pb > 180 && pr < 100 && pg < 100) blue++;
    }
    expect(blue).toBeGreaterThan(10);
  });

  it('embeds image overlays', async () => {
    const png = makePng(20, 20, (ctx) => {
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(0, 0, 20, 20);
    });
    const out = await applyEditorObjects(source(await makeTextPdf({ pages: 1 })), [{ id: 'i', page: 0, type: 'image', x: 100, y: 100, w: 80, h: 80, assetId: 'a1', opacity: 1 }], { a1: { kind: 'png', bytes: png, width: 20, height: 20 } });
    const [r, g, b] = (await renderPage(out, 1)).pixel(140, 140);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeGreaterThan(200);
  });

  it('builds smooth SVG paths', () => {
    expect(pointsToSvgPath([])).toBe('');
    expect(pointsToSvgPath([1, 2, 3, 4])).toBe('M 1 2 L 3 4');
    expect(pointsToSvgPath([0, 0, 10, 10, 20, 0])).toContain('Q');
  });
});

describe('WinAnsi helpers', () => {
  it('detects unsupported characters and replaces them', () => {
    expect(findUnsupportedChars('Café €5 — “ok”')).toEqual([]);
    expect(findUnsupportedChars('Привет 你好')).toEqual(['П', 'р', 'и', 'в', 'е', 'т', '你', '好']);
    expect(toWinAnsi('A\tB→C')).toBe('A    B?C');
  });
});
