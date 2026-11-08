import { describe, expect, it } from 'vitest';
import { cleanExtractedText, countWords, pageTextFromItems, splitSentences } from '../../src/ai/text';
import { chunkTexts, createStreamAccumulator, estimateTokens, splitOversized } from '../../src/ai/chunk';
import { extractiveSummary } from '../../src/ai/extractive';
import { blocksToPlainText, parseInline, parseSummaryBlocks } from '../../src/ai/markdown';
import { checkAiStatus, summarizeDocument } from '../../src/ai/summarizer';

/** Deterministic stand-in for Chrome's Summarizer with a tiny input quota. */
function fakeApi(opts: { availability?: AiAvailability; quota?: number; streaming?: 'delta' | 'cumulative' | 'none' } = {}) {
  const calls: { type?: string; input: string; context?: string }[] = [];
  let created = 0;
  let destroyed = 0;
  const api: SummarizerStatic = {
    availability: async () => opts.availability ?? 'available',
    create: async (o) => {
      created++;
      o?.monitor?.(Object.assign(new EventTarget(), {}) as AiCreateMonitor);
      const instance: SummarizerInstance = {
        inputQuota: opts.quota ?? 100,
        measureInputUsage: async (t) => Math.ceil(t.length / 4),
        summarize: async (input, run) => {
          calls.push({ type: o?.type, input, context: run?.context });
          return `* summary of ${input.length} chars`;
        },
        destroy: () => void destroyed++,
      };
      if (opts.streaming !== 'none') {
        instance.summarizeStreaming = (input) => {
          calls.push({ type: o?.type, input });
          const pieces = ['* First point', '\n* Second point'];
          let acc = '';
          return new ReadableStream<string>({
            start(controller) {
              for (const p of pieces) {
                acc += p;
                controller.enqueue(opts.streaming === 'cumulative' ? acc : p);
              }
              controller.close();
            },
          });
        };
      }
      return instance;
    },
  };
  return { api, calls, stats: () => ({ created, destroyed }) };
}

describe('text helpers', () => {
  it('joins PDF.js items and cleans line breaks and hyphenation', () => {
    const raw = pageTextFromItems([{ str: 'This is an exam-', hasEOL: true }, { str: 'ple of a line', hasEOL: true }, { str: 'that wraps.', hasEOL: true }, { str: 'New paragraph.' }, { hasEOL: true }]);
    expect(cleanExtractedText(raw)).toBe('This is an example of a line that wraps.\nNew paragraph.');
  });
  it('counts words and splits sentences across languages', () => {
    expect(countWords('Hello, wonderful world!')).toBe(3);
    expect(splitSentences('One. Two? Three!')).toEqual(['One.', 'Two?', 'Three!']);
  });
});

describe('chunking', () => {
  it('packs pages under the budget and preserves order', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => `Page ${i} `.repeat(30));
    const chunks = await chunkTexts(pages, 200, async (t) => Math.ceil(t.length / 4));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(Math.ceil(c.length / 4)).toBeLessThanOrEqual(200);
    expect(chunks.join(' ')).toMatch(/Page 0.*Page 9/s);
  });
  it('splits a single oversized page by sentences', () => {
    const page = 'This is a sentence about something important. '.repeat(100);
    const pieces = splitOversized(page, 100);
    expect(pieces.length).toBeGreaterThan(5);
    for (const p of pieces) expect(estimateTokens(p)).toBeLessThanOrEqual(100);
  });
  it('accepts cumulative and delta streams, deciding once', () => {
    const run = (chunks: string[]) => {
      const acc = createStreamAccumulator();
      let text = '';
      for (const c of chunks) text = acc(c);
      return text;
    };
    expect(run(['Hello', ' world'])).toBe('Hello world');
    expect(run(['Hello', 'Hello world', 'Hello world!'])).toBe('Hello world!');
    // A delta that repeats the text so far is not mistaken for a cumulative chunk.
    expect(run(['1', ' key', ' findings', '1', ' more'])).toBe('1 key findings1 more');
    expect(run(['1', '1', ' key findings'])).toBe('11 key findings');
  });
  it('keeps underscores and asterisks inside words, joins CJK lines without spaces', () => {
    expect(blocksToPlainText(parseSummaryBlocks('See quarterly_report_final.pdf and 2*3*4, but _this_ is italic.'))).toBe('See quarterly_report_final.pdf and 2*3*4, but this is italic.');
    expect(cleanExtractedText('日本語の\n文章です。\nNext line')).toBe('日本語の文章です。\nNext line');
  });
});

describe('extractive fallback', () => {
  it('returns the most representative sentences in document order', () => {
    const text = [
      'Solar panels convert sunlight into electricity for homes and businesses.',
      'The weather was pleasant on Tuesday afternoon in the small town.',
      'Electricity from solar panels reduces energy bills for homes over time.',
      'Installing solar panels requires a roof survey and an electricity permit.',
      'My cat enjoys sleeping in sunny corners of the living room every day.',
    ].join(' ');
    const out = extractiveSummary(text, { sentences: 2 });
    expect(out).toHaveLength(2);
    expect(out.every((s) => /solar|electricity/i.test(s))).toBe(true);
    expect(text.indexOf(out[0]!)).toBeLessThan(text.indexOf(out[1]!));
  });
  it('handles short and empty input', () => {
    expect(extractiveSummary('', { sentences: 3 })).toEqual([]);
    expect(extractiveSummary('Only one reasonably long sentence lives here.', { sentences: 3 })).toHaveLength(1);
  });
});

describe('markdown blocks', () => {
  it('parses bullets, numbers, headings and inline styles safely', () => {
    const blocks = parseSummaryBlocks('# Title\n* **Bold** point\n- second <script>\n1. first\nA paragraph\ncontinues.');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'bullet', 'bullet', 'numbered', 'paragraph']);
    expect(blocks[1]!.inline[0]).toEqual({ text: 'Bold', bold: true });
    expect(blocksToPlainText(blocks)).toContain('• second <script>');
    expect(parseInline('a `code` and *it*')).toEqual([{ text: 'a ' }, { text: 'code', code: true }, { text: ' and ' }, { text: 'it', italic: true }]);
  });
});

describe('summarizeDocument', () => {
  const opts = { style: 'key-points' as const, length: 'medium' as const, outputLanguage: 'en', title: 'report.pdf' };

  it('summarises short documents in one streamed pass', async () => {
    const { api, calls, stats } = fakeApi({ quota: 4000, streaming: 'delta' });
    const texts: string[] = [];
    const out = await summarizeDocument(['A short page of text.'], opts, { onText: (t) => texts.push(t) }, undefined, api);
    expect(out).toBe('* First point\n* Second point');
    expect(texts.at(-1)).toBe(out);
    expect(calls).toHaveLength(1);
    expect(stats()).toEqual({ created: 1, destroyed: 1 });
  });

  it('handles cumulative streams and non-streaming implementations', async () => {
    expect(await summarizeDocument(['Text.'], opts, {}, undefined, fakeApi({ quota: 4000, streaming: 'cumulative' }).api)).toBe('* First point\n* Second point');
    expect(await summarizeDocument(['Text.'], opts, {}, undefined, fakeApi({ quota: 4000, streaming: 'none' }).api)).toBe('* summary of 5 chars');
  });

  it('uses map-reduce for documents larger than the quota', async () => {
    const { api, calls, stats } = fakeApi({ quota: 100, streaming: 'delta' });
    const stages: string[] = [];
    const pages = Array.from({ length: 6 }, (_, i) => `Section ${i}. ` + 'Important findings about the topic. '.repeat(12));
    await summarizeDocument(pages, opts, { onStage: (s) => stages.push(s.kind) }, undefined, api);
    const chunkCalls = calls.filter((c) => c.type === 'key-points' && c.context?.startsWith('This is part'));
    expect(chunkCalls.length).toBeGreaterThan(1);
    expect(stages).toContain('chunk');
    expect(stages.at(-1)).toBe('writing');
    expect(stats().created).toBe(stats().destroyed);
  });

  it('reports a cancelled run and maps API errors', async () => {
    const ac = new AbortController();
    ac.abort();
    const { api } = fakeApi({ quota: 4000 });
    await expect(summarizeDocument(['Text.'], opts, {}, ac.signal, api)).rejects.toMatchObject({ code: 'CANCELLED' });
    const failing: SummarizerStatic = { availability: async () => 'available', create: async () => { throw new DOMException('no', 'NotSupportedError'); } };
    await expect(summarizeDocument(['Text.'], opts, {}, undefined, failing)).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });

  it('detects availability and a missing API', async () => {
    expect(await checkAiStatus(opts, undefined)).toBe('no-api');
    expect(await checkAiStatus(opts, fakeApi({ availability: 'downloadable' }).api)).toBe('downloadable');
  });
});
