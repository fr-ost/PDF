import { describe, expect, it } from 'vitest';
import { computeSplitGroups, formatPageList, parsePageRanges } from '../../src/pdf/pageRanges';

describe('parsePageRanges', () => {
  it('parses singles, ranges and open ranges', () => {
    const r = parsePageRanges('1-3, 5, 8-', 10);
    expect(r).toEqual({ ok: true, groups: [[0, 1, 2], [4], [7, 8, 9]], pages: [0, 1, 2, 4, 7, 8, 9] });
  });
  it('supports leading open range, last/end keywords, odd/even and semicolons', () => {
    expect(parsePageRanges('-2; last', 5)).toMatchObject({ ok: true, groups: [[0, 1], [4]] });
    expect(parsePageRanges('3-end', 4)).toMatchObject({ ok: true, groups: [[2, 3]] });
    expect(parsePageRanges('odd', 5)).toMatchObject({ ok: true, groups: [[0, 2, 4]] });
    expect(parsePageRanges('even', 5)).toMatchObject({ ok: true, groups: [[1, 3]] });
  });
  it('supports descending ranges', () => {
    expect(parsePageRanges('4-2', 5)).toMatchObject({ ok: true, groups: [[3, 2, 1]] });
  });
  it('deduplicates the flattened page list but keeps groups', () => {
    const r = parsePageRanges('1-2, 2-3', 3);
    expect(r).toMatchObject({ ok: true, groups: [[0, 1], [1, 2]], pages: [0, 1, 2] });
  });
  it('rejects pages outside the document with a helpful message', () => {
    const r = parsePageRanges('1-12', 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Page 12 doesn’t exist');
  });
  it('rejects zero, garbage and malformed ranges', () => {
    expect(parsePageRanges('0', 3).ok).toBe(false);
    expect(parsePageRanges('abc', 3).ok).toBe(false);
    expect(parsePageRanges('1-2-3', 3).ok).toBe(false);
    expect(parsePageRanges('   ', 3).ok).toBe(false);
    expect(parsePageRanges(',,,', 3).ok).toBe(false);
    expect(parsePageRanges('even', 1).ok).toBe(false);
  });
  it('handles a document without pages', () => {
    expect(parsePageRanges('1', 0).ok).toBe(false);
  });
});

describe('formatPageList', () => {
  it('compresses consecutive pages', () => {
    expect(formatPageList([0, 1, 2, 4, 6, 7])).toBe('1-3, 5, 7-8');
    expect(formatPageList([])).toBe('');
  });
});

describe('computeSplitGroups', () => {
  it('splits every page', () => {
    expect(computeSplitGroups({ kind: 'every-page' }, 3)).toMatchObject({ ok: true, groups: [[0], [1], [2]] });
  });
  it('splits into fixed-size groups with a short final group', () => {
    expect(computeSplitGroups({ kind: 'fixed-size', size: 2 }, 5)).toMatchObject({ ok: true, groups: [[0, 1], [2, 3], [4]] });
    expect(computeSplitGroups({ kind: 'fixed-size', size: 0 }, 5).ok).toBe(false);
  });
  it('splits before selected pages', () => {
    expect(computeSplitGroups({ kind: 'split-before', pages: [3, 1] }, 5)).toMatchObject({ ok: true, groups: [[0], [1, 2], [3, 4]] });
    expect(computeSplitGroups({ kind: 'split-before', pages: [0] }, 5).ok).toBe(false);
  });
});
