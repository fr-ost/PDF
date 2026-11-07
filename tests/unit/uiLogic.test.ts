import { describe, expect, it } from 'vitest';
import { parseHash, routeHref } from '../../src/app/router';
import { baseName, outputName, sanitizeFileName } from '../../src/utils/filenames';
import { formatBytes, percentSaved, pluralize } from '../../src/utils/format';
import { moveKeys } from '../../src/components/tool/PageGrid';
import { normalizeStrokes } from '../../src/features/editor/SignaturePad';
import { passwordStrength } from '../../src/features/security/ProtectTool';
import { moveObject, resizeObject, clampToPage } from '../../src/features/editor/model';
import { splitFileName } from '../../src/features/split/SplitTool';
import { computePlacement } from '../../src/pdf/imageLayout';
import { anchorCenters } from '../../src/pdf/placement';
import { TOOLS } from '../../src/features/registry';
import type { EditorObject } from '../../src/pdf/engines/annotations';

describe('router', () => {
  it('parses routes and rejects unknown or unsafe ones', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/organize')).toEqual({ name: 'category', category: 'organize' });
    expect(parseHash('#/tool/merge')).toEqual({ name: 'tool', id: 'merge' });
    expect(parseHash('#/settings/')).toEqual({ name: 'settings' });
    expect(parseHash('#/tool/<script>')).toEqual({ name: 'not-found' });
    expect(parseHash('#/nope')).toEqual({ name: 'not-found' });
    expect(routeHref({ name: 'tool', id: 'split' })).toBe('#/tool/split');
  });
  it('every registered tool has a valid, unique route id', () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(parseHash(`#/tool/${id}`)).toEqual({ name: 'tool', id });
  });
});

describe('file names', () => {
  it('produces safe output names and never reuses the input name', () => {
    expect(outputName('Report.pdf', 'compressed')).toBe('Report-compressed.pdf');
    expect(outputName('a/b\\c:d*e?.pdf', 'x')).toBe('a b c d e-x.pdf');
    expect(sanitizeFileName('  ..con..  ')).toBe('document');
    expect(sanitizeFileName('\u0000\u0007bad\u001fname')).toBe('bad name');
    expect(sanitizeFileName('x'.repeat(300)).length).toBe(120);
    expect(baseName('archive.tar.gz')).toBe('archive.tar');
    expect(splitFileName('doc', [0])).toBe('doc-page-1.pdf');
    expect(splitFileName('doc', [0, 1, 2, 5])).toBe('doc-pages-1-3_6.pdf');
  });
});

describe('formatting', () => {
  it('formats sizes, plurals and savings', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(pluralize(1, 'page')).toBe('1 page');
    expect(pluralize(3, 'match', 'matches')).toBe('3 matches');
    expect(percentSaved(1000, 250)).toBe(75);
    expect(percentSaved(1000, 1200)).toBe(-20);
  });
});

describe('page grid multi-move', () => {
  const keys = ['a', 'b', 'c', 'd', 'e'];
  it('moves a single page forwards and backwards', () => {
    expect(moveKeys(keys, ['a'], 'c')).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(moveKeys(keys, ['e'], 'b')).toEqual(['a', 'e', 'b', 'c', 'd']);
  });
  it('moves a non-contiguous selection together, preserving its order', () => {
    expect(moveKeys(keys, ['a', 'c'], 'e')).toEqual(['b', 'd', 'e', 'a', 'c']);
    expect(moveKeys(keys, ['b', 'e'], 'a')).toEqual(['b', 'e', 'a', 'c', 'd']);
    expect(moveKeys(keys, ['b', 'c'], 'c')).toEqual(keys);
  });
});

describe('editor geometry', () => {
  const rect: EditorObject = { id: '1', page: 0, type: 'rect', x: 10, y: 10, w: 100, h: 50, stroke: '#000', strokeWidth: 1, fill: null, opacity: 1 };
  it('moves and resizes from corners', () => {
    expect(moveObject(rect, 5, -5)).toMatchObject({ x: 15, y: 5 });
    expect(resizeObject(rect, 'se', 210, 110)).toMatchObject({ x: 10, y: 10, w: 200, h: 100 });
    expect(resizeObject(rect, 'nw', 0, 0)).toMatchObject({ x: 0, y: 0, w: 110, h: 60 });
    // Dragging past the anchor flips the box instead of producing negative sizes.
    expect(resizeObject(rect, 'se', 0, 0)).toMatchObject({ x: 0, y: 0, w: 10, h: 10 });
  });
  it('keeps aspect ratio for images and signatures', () => {
    const img: EditorObject = { id: '2', page: 0, type: 'image', x: 0, y: 0, w: 100, h: 50, assetId: 'a', opacity: 1 };
    const r = resizeObject(img, 'se', 300, 60);
    expect((r as { w: number; h: number }).w / (r as { h: number }).h).toBeCloseTo(2);
  });
  it('keeps objects reachable on the page', () => {
    const far = moveObject(rect, 5000, 5000);
    const clamped = clampToPage(far, 600, 800) as { x: number; y: number };
    expect(clamped.x).toBeLessThan(600);
    expect(clamped.y).toBeLessThan(800);
  });
  it('normalises signature strokes into a unit box', () => {
    const n = normalizeStrokes([[10, 10, 110, 60]])!;
    for (const v of n.strokes.flat()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(n.aspect).toBeCloseTo(108 / 58, 2);
    expect(normalizeStrokes([])).toBeNull();
  });
});

describe('password strength', () => {
  it('rates passwords sensibly', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('abc').score).toBeLessThanOrEqual(1);
    expect(passwordStrength('Corr3ct-Horse-Battery!').score).toBe(4);
  });
});

describe('layout previews share engine math', () => {
  it('image layout and watermark anchors are deterministic', () => {
    const p = computePlacement({ width: 100, height: 200, orientation: 1 }, { pageSize: 'a4', orientation: 'auto', margin: 0, fit: 'contain' });
    expect(p.pageHeight).toBeGreaterThan(p.pageWidth);
    expect(anchorCenters('center', { w: 100, h: 200 }, { w: 10, h: 10 }, 0, 0)).toEqual([[50, 100]]);
  });
});
