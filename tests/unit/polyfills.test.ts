import { afterAll, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const targets: [any, string][] = [
  [Promise, 'try'],
  [URL, 'parse'],
  [Map.prototype, 'getOrInsertComputed'],
  [Map.prototype, 'getOrInsert'],
  [Math, 'sumPrecise'],
  [Uint8Array.prototype, 'toHex'],
  [Uint8Array.prototype, 'toBase64'],
  [Uint8Array, 'fromBase64'],
  [Uint8Array, 'fromHex'],
];
const saved = targets.map(([obj, name]) => [obj, name, Object.getOwnPropertyDescriptor(obj, name)] as const);

describe('polyfills for built-ins pdf.js needs', () => {
  afterAll(() => {
    for (const [obj, name, desc] of saved) {
      delete obj[name];
      if (desc) Object.defineProperty(obj, name, desc);
    }
  });

  it('installs working replacements when the browser lacks them', async () => {
    for (const [obj, name] of targets) delete obj[name];
    vi.resetModules();
    await import('../../src/polyfills/modern');
    expect(await (Promise as any).try((a: number, b: number) => a + b, 2, 3)).toBe(5);
    await expect((Promise as any).try(() => { throw new Error('x'); })).rejects.toThrow('x');
    expect((URL as any).parse('not a url')).toBeNull();
    expect((URL as any).parse('/a', 'https://example.com').href).toBe('https://example.com/a');
    const map = new Map<string, number[]>();
    (map as any).getOrInsertComputed('k', () => []).push(1);
    (map as any).getOrInsertComputed('k', () => []).push(2);
    expect(map.get('k')).toEqual([1, 2]);
    expect((Math as any).sumPrecise([1e20, 0.1, -1e20])).toBeCloseTo(0.1, 10);
    expect((Math as any).sumPrecise([])).toBe(-0);
    const bytes = new Uint8Array([0, 15, 16, 255]);
    expect((bytes as any).toHex()).toBe('000f10ff');
    expect((bytes as any).toBase64()).toBe('AA8Q/w==');
    expect([...(Uint8Array as any).fromBase64('AA8Q/w==')]).toEqual([0, 15, 16, 255]);
    expect([...(Uint8Array as any).fromHex('000f10ff')]).toEqual([0, 15, 16, 255]);
  });
});
