/**
 * On-device summarization with Chrome's built-in Summarizer API.
 *
 * The model runs locally (Chrome downloads it once and manages it); no
 * document text ever leaves the device. Long documents are summarised with
 * a "summary of summaries" (map-reduce) approach so they fit the model's
 * input quota.
 */
import { PdfToolError } from '../pdf/errors';
import { accumulateStream, chunkTexts, estimateTokens } from './chunk';

export type AiStatus = 'no-api' | AiAvailability;
export type SummaryStyle = SummarizerType;
export type SummaryLength = SummarizerLength;

export interface SummaryOptions {
  style: SummaryStyle;
  length: SummaryLength;
  outputLanguage: string;
  /** Optional reader focus, e.g. "risks and deadlines". */
  focus?: string;
  /** Used as context so the model knows what it is reading. */
  title?: string;
}

export type SummaryStage =
  | { kind: 'preparing' }
  | { kind: 'download'; progress: number }
  | { kind: 'chunk'; index: number; total: number }
  | { kind: 'combine'; round: number }
  | { kind: 'writing' };

export interface SummaryCallbacks {
  onStage?: (stage: SummaryStage) => void;
  onText?: (text: string) => void;
}

export const OUTPUT_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'ja', label: '日本語' },
] as const;

export function getSummarizerApi(): SummarizerStatic | undefined {
  const api = (globalThis as { Summarizer?: SummarizerStatic }).Summarizer;
  return api && typeof api.create === 'function' && typeof api.availability === 'function' ? api : undefined;
}

function coreOptions(o: Pick<SummaryOptions, 'style' | 'length' | 'outputLanguage'>): SummarizerCoreOptions {
  return { type: o.style, format: 'markdown', length: o.length, outputLanguage: o.outputLanguage, expectedContextLanguages: ['en'] };
}

export async function checkAiStatus(options: Pick<SummaryOptions, 'style' | 'length' | 'outputLanguage'>, api = getSummarizerApi()): Promise<AiStatus> {
  if (!api) return 'no-api';
  try {
    return await api.availability(coreOptions(options));
  } catch {
    return 'unavailable';
  }
}

function sharedContext(options: SummaryOptions): string | undefined {
  const parts: string[] = [];
  if (options.title) parts.push(`The text comes from the PDF document "${options.title}".`);
  if (options.focus?.trim()) parts.push(`The reader is especially interested in: ${options.focus.trim().slice(0, 300)}.`);
  return parts.length ? parts.join(' ') : undefined;
}

function mapError(err: unknown): unknown {
  const name = (err as { name?: string })?.name;
  if (name === 'AbortError') return new PdfToolError('CANCELLED', 'Summarizing was cancelled.');
  if (name === 'NotAllowedError') return new PdfToolError('UNSUPPORTED', 'Chrome needs a click to start downloading its on-device AI model. Press the button again.');
  if (name === 'NotSupportedError') return new PdfToolError('UNSUPPORTED', 'This combination of language and summary style is not supported by Chrome’s on-device AI yet.');
  if (name === 'QuotaExceededError') return new PdfToolError('UNSUPPORTED', 'A section of this document is too long for the on-device model. Try a smaller page range.');
  if (name === 'InvalidStateError' || name === 'OperationError') return new PdfToolError('UNSUPPORTED', 'Chrome’s on-device AI is not ready on this device right now. Try again later.');
  return err;
}

async function readStream(stream: ReadableStream<string>, onText: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const reader = stream.getReader();
  let text = '';
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      text = accumulateStream(text, value);
      onText(text);
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

/**
 * Summarises a document given as page texts. IMPORTANT: call this directly
 * from a user gesture (click) — Chrome requires user activation to start the
 * one-time model download, so `create()` is invoked before any await.
 */
export async function summarizeDocument(
  pages: string[],
  options: SummaryOptions,
  callbacks: SummaryCallbacks = {},
  signal?: AbortSignal,
  api = getSummarizerApi(),
): Promise<string> {
  if (!api) throw new PdfToolError('UNSUPPORTED', 'Chrome’s on-device AI is not available in this browser.');
  const { onStage = () => undefined, onText = () => undefined } = callbacks;
  const context = sharedContext(options);
  const monitor = (m: AiCreateMonitor) =>
    m.addEventListener('downloadprogress', (e) => onStage({ kind: 'download', progress: Math.max(0, Math.min(1, e.total ? e.loaded / e.total : e.loaded)) }));

  // Created first, synchronously from the gesture, for user activation.
  const finalPromise = api.create({ ...coreOptions(options), ...(context ? { sharedContext: context } : {}), monitor, ...(signal ? { signal } : {}) });
  let final: SummarizerInstance;
  try {
    final = await finalPromise;
  } catch (err) {
    throw mapError(err);
  }

  try {
    onStage({ kind: 'preparing' });
    const quota = final.inputQuota && final.inputQuota > 0 ? final.inputQuota : 4000;
    const budget = Math.max(256, Math.floor(quota * 0.8));
    const measure = final.measureInputUsage
      ? (t: string) => final.measureInputUsage!(t, signal ? { signal } : undefined)
      : (t: string) => Promise.resolve(estimateTokens(t));

    const fullText = pages.map((p) => p.trim()).filter(Boolean).join('\n\n');
    if (!fullText) throw new PdfToolError('INVALID_INPUT', 'There is no text to summarize.');

    let input = fullText;
    if (estimateTokens(fullText) > budget * 0.9 || (await measure(fullText)) > budget) {
      const chunker = await api.create({ type: 'key-points', format: 'markdown', length: 'long', outputLanguage: options.outputLanguage, ...(context ? { sharedContext: context } : {}), ...(signal ? { signal } : {}) });
      try {
        let parts = await chunkTexts(pages, budget, measure);
        let round = 0;
        for (;;) {
          const partials: string[] = [];
          for (let i = 0; i < parts.length; i++) {
            if (round === 0) onStage({ kind: 'chunk', index: i + 1, total: parts.length });
            else onStage({ kind: 'combine', round });
            partials.push(await chunker.summarize(parts[i]!, { context: `This is part ${i + 1} of ${parts.length}.`, ...(signal ? { signal } : {}) }));
          }
          const combined = partials.join('\n\n');
          round++;
          if ((await measure(combined)) <= budget || round >= 4) {
            input = combined;
            break;
          }
          parts = await chunkTexts(partials, budget, measure);
        }
      } finally {
        chunker.destroy();
      }
    }

    onStage({ kind: 'writing' });
    const runOptions: SummarizerRunOptions = { ...(signal ? { signal } : {}) };
    let text: string;
    if (typeof final.summarizeStreaming === 'function') {
      text = await readStream(final.summarizeStreaming(input, runOptions), onText, signal);
    } else {
      text = await final.summarize(input, runOptions);
      onText(text);
    }
    return text.trim();
  } catch (err) {
    throw mapError(err);
  } finally {
    final.destroy();
  }
}
