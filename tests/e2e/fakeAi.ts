import type { Page } from '@playwright/test';

/**
 * Installs a deterministic stand-in for Chrome's built-in Summarizer API
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

/**
 * A deterministic stand-in for Chrome's Prompt API (LanguageModel). Answers
 * quote the excerpt sentence that shares the most words with the question and
 * cite its page, which shows that retrieval put the right passage in the
 * prompt. A question containing "SLOW" streams slowly (to test Stop).
 */
export async function installFakeLanguageModel(
  page: Page,
  availability: 'available' | 'downloadable' | 'unavailable' | 'none' = 'available',
  { unavailableLanguages = [] }: { unavailableLanguages?: string[] } = {},
): Promise<void> {
  await page.addInitScript(
    ({ availability, unavailableLanguages }) => {
      if (availability === 'none') {
        Object.defineProperty(window, 'LanguageModel', { configurable: true, value: undefined });
        return;
      }
      const calls: string[] = [];
      (window as unknown as { __lmCalls: string[] }).__lmCalls = calls;
      let state = availability;
      const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
      const answerFor = (prompt: string) => {
        const question = prompt.slice(prompt.lastIndexOf('Question:') + 9).trim();
        const q = words(question);
        let best = { score: -1, sentence: 'I could not find that in this document.', page: 0 };
        for (const line of prompt.split('\n')) {
          const m = line.match(/^\[p\. (\d+)\] (.*)$/);
          if (!m) continue;
          for (const sentence of m[2]!.split(/(?<=[.!?])\s+/)) {
            let score = 0;
            for (const w of words(sentence)) if (q.has(w) || [...q].some((x) => x.slice(0, 5) === w.slice(0, 5))) score++;
            if (score > best.score) best = { score, sentence, page: Number(m[1]) };
          }
        }
        return best.page ? `According to the document, **${best.sentence.replace(/\.$/, '')}** [p. ${best.page}].` : best.sentence;
      };
      const session = (): Record<string, unknown> => ({
        contextWindow: 6000,
        inputQuota: 6000,
        measureContextUsage: async (t: string) => Math.ceil(t.length / 4),
        measureInputUsage: async (t: string) => Math.ceil(t.length / 4),
        prompt: async (t: string) => {
          calls.push(t);
          return answerFor(t);
        },
        promptStreaming: (t: string, o?: { signal?: AbortSignal }) => {
          calls.push(t);
          const slow = /SLOW/.test(t.slice(t.lastIndexOf('Question:')));
          const text = slow ? `${'This is a long and careful answer. '.repeat(40)}[p. 1]` : answerFor(t);
          const parts = text.match(/[\s\S]{1,12}/g) ?? [];
          let i = 0;
          return new ReadableStream<string>({
            async pull(controller) {
              await new Promise((r) => setTimeout(r, slow ? 120 : 12));
              if (o?.signal?.aborted) return controller.error(new DOMException('Aborted', 'AbortError'));
              if (i < parts.length) controller.enqueue(parts[i++]!);
              else controller.close();
            },
          });
        },
        clone: async () => session(),
        destroy() {},
      });
      Object.defineProperty(window, 'LanguageModel', {
        configurable: true,
        value: {
          // Like Chrome builds without some output languages.
          availability: async (opts?: { expectedOutputs?: { languages?: string[] }[] }) =>
            opts?.expectedOutputs?.some((o) => o.languages?.some((l) => unavailableLanguages.includes(l))) ? 'unavailable' : state,
          create: async (opts: { monitor?: (m: EventTarget) => void } = {}) => {
            if (state === 'unavailable') throw new DOMException('Unavailable', 'NotSupportedError');
            if (state === 'downloadable') {
              const monitor = new EventTarget();
              opts.monitor?.(monitor);
              for (const p of [0.15, 0.4, 0.7, 1]) {
                await new Promise((r) => setTimeout(r, 200));
                monitor.dispatchEvent(new ProgressEvent('downloadprogress', { loaded: p, total: 1 }));
              }
              state = 'available';
            }
            return session();
          },
        },
      });
    },
    { availability, unavailableLanguages },
  );
}

export async function lmCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __lmCalls?: string[] }).__lmCalls ?? []);
}
