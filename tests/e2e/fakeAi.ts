import type { Page } from '@playwright/test';

/**
 * Installs a deterministic stand-in for Chrome's on-device Summarizer API
 * (the real model is not available in headless CI). It mirrors the API
 * shape: availability(), create() with download-progress monitor,
 * summarizeStreaming() returning deltas, measureInputUsage(), inputQuota.
 */
export const FAKE_SUMMARY =
  '* **Revenue grew 18%** year over year, driven by strong subscription renewals.\n* Operating costs fell 6% after the warehouse consolidation finished in Q2.\n* The board approved a **$40M share buyback** and an expansion into APAC.\n* Key risks: supplier concentration and rising interest rates.';

export async function installFakeSummarizer(page: Page, availability: 'available' | 'downloadable' | 'unavailable' | 'none' = 'available'): Promise<void> {
  await page.addInitScript(
    ({ availability, summary }) => {
      if (availability === 'none') {
        try {
          delete (window as unknown as { Summarizer?: unknown }).Summarizer;
        } catch {
          /* not present */
        }
        Object.defineProperty(window, 'Summarizer', { configurable: true, value: undefined });
        return;
      }
      // Recorded calls let tests check the options passed to the model and how
      // long documents are split (summarize = one part, stream = final pass).
      const calls: string[] = [];
      (window as unknown as { __aiCalls: string[] }).__aiCalls = calls;
      let state = availability;
      const instance = () => ({
        inputQuota: 6000,
        measureInputUsage: async (t: string) => Math.ceil(t.length / 4),
        summarize: async (t: string) => {
          calls.push(`summarize:${t.length}`);
          return summary;
        },
        summarizeStreaming: (t: string) => {
          calls.push(`stream:${t.length}`);
          const parts = summary.match(/[\s\S]{1,14}/g) ?? [];
          let i = 0;
          return new ReadableStream<string>({
            async pull(controller) {
              await new Promise((r) => setTimeout(r, 15));
              if (i < parts.length) controller.enqueue(parts[i++]!);
              else controller.close();
            },
          });
        },
        destroy() {},
      });
      Object.defineProperty(window, 'Summarizer', {
        configurable: true,
        value: {
          availability: async () => state,
          create: async (opts: { monitor?: (m: EventTarget) => void; type?: string; length?: string; format?: string; outputLanguage?: string; sharedContext?: string } = {}) => {
            calls.push(`create:${JSON.stringify({ type: opts.type, length: opts.length, format: opts.format, outputLanguage: opts.outputLanguage, sharedContext: opts.sharedContext ?? null })}`);
            if (state === 'unavailable') throw new DOMException('Unavailable', 'NotSupportedError');
            if (state === 'downloadable') {
              const monitor = new EventTarget();
              opts.monitor?.(monitor);
              for (const p of [0.2, 0.55, 0.85, 1]) {
                await new Promise((r) => setTimeout(r, 200));
                monitor.dispatchEvent(new ProgressEvent('downloadprogress', { loaded: p, total: 1 }));
              }
              state = 'available';
            }
            return instance();
          },
        },
      });
    },
    { availability, summary: FAKE_SUMMARY },
  );
}

export async function aiCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __aiCalls?: string[] }).__aiCalls ?? []);
}
