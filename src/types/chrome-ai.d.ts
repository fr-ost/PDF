/**
 * Minimal typings for Chrome's built-in, on-device Summarizer API
 * (stable for extensions since Chrome 138). Runtime code always
 * feature-detects before use.
 */
type AiAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
type SummarizerType = 'key-points' | 'tldr' | 'teaser' | 'headline';
type SummarizerFormat = 'markdown' | 'plain-text';
type SummarizerLength = 'short' | 'medium' | 'long';

interface AiCreateMonitor extends EventTarget {
  addEventListener(type: 'downloadprogress', listener: (event: ProgressEvent) => void): void;
}

interface SummarizerCoreOptions {
  type?: SummarizerType;
  format?: SummarizerFormat;
  length?: SummarizerLength;
  expectedInputLanguages?: string[];
  expectedContextLanguages?: string[];
  outputLanguage?: string;
}

interface SummarizerCreateOptions extends SummarizerCoreOptions {
  sharedContext?: string;
  signal?: AbortSignal;
  monitor?: (monitor: AiCreateMonitor) => void;
}

interface SummarizerRunOptions {
  context?: string;
  signal?: AbortSignal;
}

interface SummarizerInstance {
  readonly inputQuota?: number;
  summarize(input: string, options?: SummarizerRunOptions): Promise<string>;
  summarizeStreaming?(input: string, options?: SummarizerRunOptions): ReadableStream<string>;
  measureInputUsage?(input: string, options?: SummarizerRunOptions): Promise<number>;
  destroy(): void;
}

interface SummarizerStatic {
  availability(options?: SummarizerCoreOptions): Promise<AiAvailability>;
  create(options?: SummarizerCreateOptions): Promise<SummarizerInstance>;
}

// `var` (not let/const) so the API is also typed as a property of globalThis.
// eslint-disable-next-line no-var
declare var Summarizer: SummarizerStatic | undefined;
