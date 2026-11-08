/**
 * Minimal typings for Chrome's built-in AI APIs used by Unique AI:
 * the Summarizer API and the Prompt API (LanguageModel), both available to
 * extensions since Chrome 138. Runtime code always feature-detects before use.
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

// ---- Prompt API ------------------------------------------------------------
type LanguageModelRole = 'system' | 'user' | 'assistant';

interface LanguageModelMessage {
  role: LanguageModelRole;
  content: string;
}

interface LanguageModelExpected {
  type: 'text';
  languages?: string[];
}

interface LanguageModelCoreOptions {
  expectedInputs?: LanguageModelExpected[];
  expectedOutputs?: LanguageModelExpected[];
}

interface LanguageModelCreateOptions extends LanguageModelCoreOptions {
  initialPrompts?: LanguageModelMessage[];
  signal?: AbortSignal;
  monitor?: (monitor: AiCreateMonitor) => void;
}

interface LanguageModelPromptOptions {
  signal?: AbortSignal;
}

/**
 * A session. Chrome renamed the context accounting members over time
 * (inputQuota → contextWindow, inputUsage → contextUsage,
 * measureInputUsage → measureContextUsage); current builds expose both.
 */
interface LanguageModelSession {
  readonly contextWindow?: number;
  readonly contextUsage?: number;
  readonly inputQuota?: number;
  readonly inputUsage?: number;
  measureContextUsage?(input: string, options?: LanguageModelPromptOptions): Promise<number>;
  measureInputUsage?(input: string, options?: LanguageModelPromptOptions): Promise<number>;
  prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
  promptStreaming?(input: string, options?: LanguageModelPromptOptions): ReadableStream<string>;
  clone?(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
}

interface LanguageModelStatic {
  availability(options?: LanguageModelCoreOptions): Promise<AiAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

// `var` (not let/const) so the APIs are also typed as properties of globalThis.
// eslint-disable-next-line no-var
declare var Summarizer: SummarizerStatic | undefined;
// eslint-disable-next-line no-var
declare var LanguageModel: LanguageModelStatic | undefined;
