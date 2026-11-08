/**
 * Small polyfills for recent built-ins that pdf.js 6 uses without feature
 * checks (document fingerprints, font compilation, message passing). They are
 * installed only where the browser lacks them, so current Chrome is untouched.
 * Loaded first on the page and inside the pdf.js worker.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const define = (target: object, name: string, value: unknown) => {
  if (!(name in target)) Object.defineProperty(target, name, { value, writable: true, configurable: true });
};

// Promise.try (Chrome 128)
define(Promise, 'try', function <T>(fn: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve) => resolve(fn(...args)));
});

// Promise.withResolvers (Chrome 119)
define(Promise, 'withResolvers', function <T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
});

// URL.parse (Chrome 126)
define(URL, 'parse', (url: string | URL, base?: string | URL): URL | null => {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
});

// Map / WeakMap getOrInsert and getOrInsertComputed (upsert proposal)
for (const proto of [Map.prototype, WeakMap.prototype] as any[]) {
  define(proto, 'getOrInsert', function (this: any, key: unknown, value: unknown) {
    if (!this.has(key)) this.set(key, value);
    return this.get(key);
  });
  define(proto, 'getOrInsertComputed', function (this: any, key: unknown, compute: (key: unknown) => unknown) {
    if (!this.has(key)) this.set(key, compute(key));
    return this.get(key);
  });
}

// Math.sumPrecise: Neumaier compensated summation (exact enough for pdf.js's byte counts).
define(Math, 'sumPrecise', (values: Iterable<number>): number => {
  let sum = 0;
  let compensation = 0;
  let any = false;
  for (const v of values) {
    any = true;
    const t = sum + v;
    compensation += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum;
    sum = t;
  }
  return any ? sum + compensation : -0;
});

// Uint8Array base64 / hex (Chrome 140)
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
define(Uint8Array.prototype, 'toHex', function (this: Uint8Array): string {
  let out = '';
  for (const b of this) out += HEX[b];
  return out;
});
define(Uint8Array.prototype, 'toBase64', function (this: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < this.length; i += 0x8000) binary += String.fromCharCode(...this.subarray(i, i + 0x8000));
  return btoa(binary);
});
define(Uint8Array, 'fromBase64', (text: string): Uint8Array => {
  const binary = atob(text.replace(/[\s]/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
});
define(Uint8Array, 'fromHex', (text: string): Uint8Array => {
  if (text.length % 2) throw new SyntaxError('Invalid hex string');
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new SyntaxError('Invalid hex string');
    out[i] = byte;
  }
  return out;
});

// Blob.bytes / Response.bytes (Chrome 132)
define(Blob.prototype, 'bytes', async function (this: Blob) {
  return new Uint8Array(await this.arrayBuffer());
});
if (typeof Response !== 'undefined') {
  define(Response.prototype, 'bytes', async function (this: Response) {
    return new Uint8Array(await this.arrayBuffer());
  });
}

export {};
