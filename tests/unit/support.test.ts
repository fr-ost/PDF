/**
 * Donations and the review prompt: the packaged QR codes encode exactly the
 * addresses shown, the prompt asks at the right moments and only in store
 * copies, and the links point to the right store page.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import jsQR from 'jsqr';
import { DEVELOPER, WALLETS, shareMessage, storeListing } from '../../src/services/support/support';
import { ASK_AGAIN_AFTER, FIRST_ASK, INITIAL_REVIEW_STATE, MAX_ASKS, afterFinal, afterLater, afterTask, shouldAsk, type ReviewState } from '../../src/services/support/reviewPrompt';

/** Rebuilds the module grid of a segno-style QR SVG (rows drawn as horizontal strokes) and decodes it. */
function decodeQrSvg(svg: string): string | null {
  const size = Number(svg.match(/M0 0h(\d+)/)![1]);
  const d = svg.match(/class="qrline"[^>]*\sd="([^"]+)"/)![1]!;
  const grid = Array.from({ length: size }, () => new Uint8Array(size));
  let x = 0;
  let y = 0;
  const tokens = d.match(/[Mmh]|-?\d*\.?\d+/g)!;
  for (let i = 0; i < tokens.length; ) {
    const op = tokens[i++];
    if (op === 'M') [x, y] = [Number(tokens[i++]), Number(tokens[i++])];
    else if (op === 'm') [x, y] = [x + Number(tokens[i++]), y + Number(tokens[i++])];
    else if (op === 'h') {
      const n = Number(tokens[i++]);
      for (let k = 0; k < n; k++) grid[Math.floor(y)]![x + k] = 1;
      x += n;
    } else throw new Error(`Unexpected path command ${op}`);
  }
  const scale = 8;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let py = 0; py < width; py++)
    for (let px = 0; px < width; px++) {
      const value = grid[Math.floor(py / scale)]![Math.floor(px / scale)] ? 0 : 255;
      pixels.set([value, value, value, 255], (py * width + px) * 4);
    }
  return jsQR(pixels, width, width)?.data ?? null;
}

describe('donation addresses', () => {
  it('every QR code encodes exactly the address shown next to it', () => {
    expect(WALLETS.map((w) => w.id)).toEqual(['evm', 'sol', 'btc']);
    for (const wallet of WALLETS) {
      const svg = readFileSync(resolve(import.meta.dirname, '../../public', wallet.qr.replace(/^\//, '')), 'utf8');
      expect(decodeQrSvg(svg), wallet.name).toBe(wallet.address);
    }
  });

  it('addresses have the expected format for their network', () => {
    const byId = Object.fromEntries(WALLETS.map((w) => [w.id, w.address]));
    expect(byId.evm).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(byId.sol).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(byId.btc).toMatch(/^bc1[02-9ac-hj-np-z]{11,71}$/);
  });
});

describe('developer credit', () => {
  it('links to the developer website and packages the photo', () => {
    expect(DEVELOPER.name).toBe('Shahriar Ahmed');
    expect(DEVELOPER.website).toBe('https://www.shahriarahmed.net');
    const photo = readFileSync(resolve(import.meta.dirname, '../../public', DEVELOPER.photo.replace(/^\//, '')));
    expect(photo.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(photo.subarray(8, 12).toString('latin1')).toBe('WEBP');
    // No EXIF/XMP metadata chunks in the packaged photo.
    expect(photo.includes(Buffer.from('EXIF'))).toBe(false);
    expect(photo.includes(Buffer.from('XMP '))).toBe(false);
  });
});

describe('review prompt', () => {
  const run = (steps: ((s: ReviewState) => ReviewState)[]) => steps.reduce((s, step) => step(s), INITIAL_REVIEW_STATE);
  const tasks = (n: number) => Array.from({ length: n }, () => afterTask);

  it('asks after a few finished tasks, again much later, and at most three times', () => {
    expect(shouldAsk(run(tasks(FIRST_ASK - 1)))).toBe(false);
    const due = run(tasks(FIRST_ASK));
    expect(shouldAsk(due)).toBe(true);
    const later = afterLater(due);
    expect(shouldAsk(later)).toBe(false);
    expect(shouldAsk(run([...tasks(FIRST_ASK), afterLater, ...tasks(ASK_AGAIN_AFTER - 1)]))).toBe(false);
    expect(shouldAsk(run([...tasks(FIRST_ASK), afterLater, ...tasks(ASK_AGAIN_AFTER)]))).toBe(true);
    let s = run(tasks(FIRST_ASK));
    for (let i = 0; i < MAX_ASKS; i++) {
      expect(shouldAsk(s)).toBe(true);
      s = afterLater(s);
      for (let k = 0; k < ASK_AGAIN_AFTER; k++) s = afterTask(s);
    }
    expect(shouldAsk(s)).toBe(false);
  });

  it('never asks again after rating or “don’t ask again”', () => {
    const answered = afterFinal(run(tasks(FIRST_ASK)));
    expect(shouldAsk(run([() => answered, ...tasks(100)]))).toBe(false);
  });
});

describe('store links', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubExtension = (updateUrl?: string) =>
    vi.stubGlobal('chrome', { runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', getManifest: () => (updateUrl ? { update_url: updateUrl } : {}) } });

  it('links to the Chrome Web Store review page for store installs', () => {
    stubExtension('https://clients2.google.com/service/update2/crx');
    expect(storeListing()).toEqual({
      reviewUrl: 'https://chromewebstore.google.com/detail/abcdefghijklmnopabcdefghijklmnop/reviews',
      pageUrl: 'https://chromewebstore.google.com/detail/abcdefghijklmnopabcdefghijklmnop',
      storeName: 'Chrome Web Store',
    });
    expect(shareMessage()).toContain('https://chromewebstore.google.com/detail/abcdefghijklmnopabcdefghijklmnop');
  });

  it('links to Edge Add-ons for copies installed from there', () => {
    stubExtension('https://edge.microsoft.com/extensionwebstorebase/v1/crx');
    expect(storeListing()?.storeName).toBe('Edge Add-ons');
  });

  it('shows no store links for development or side-loaded copies', () => {
    stubExtension();
    expect(storeListing()).toBeNull();
    stubExtension('https://example.com/updates.xml');
    expect(storeListing()).toBeNull();
    expect(shareMessage(null)).toContain('Search “Unique PDF” in the Chrome Web Store.');
  });
});
