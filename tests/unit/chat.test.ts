import { describe, expect, it } from 'vitest';
import { buildIndex, buildPassages, normalizeTerm, search, selectContext, terms } from '../../src/ai/retrieval';
import { DocumentChat, buildPrompt, checkChatStatus, citedPages, contextWindow, searchAnswer, splitCitations, systemPrompt, trimHistory } from '../../src/ai/chat';
import { suggestQuestions } from '../../src/ai/suggestions';

const PAGES = [
  'Northwind Analytics closed the fiscal year with revenue of 412 million dollars. Subscription renewals rose to 94 percent across enterprise customers. The company added 1,240 new business accounts.',
  'Operating costs fell by 6 percent after the warehouse consolidation finished in the second quarter. Two regional warehouses were merged into a single automated facility near Rotterdam.',
  'The board approved a share buyback of 40 million dollars. The main risks are supplier concentration, rising interest rates and stricter data regulations.',
];

function longDocument(pages = 40): string[] {
  return Array.from({ length: pages }, (_, i) => `${PAGES[i % 3]} Section ${i + 1} adds routine operational notes about logistics, staffing and quarterly planning for the regional teams.`);
}

describe('retrieval', () => {
  it('normalizes terms and drops stop words', () => {
    expect(normalizeTerm('Warehouses')).toBe('warehouse');
    expect(normalizeTerm('Café')).toBe('cafe');
    expect(normalizeTerm('studies')).toBe('study');
    expect(terms('What are the risks of the warehouses?')).toEqual(['risk', 'warehouse']);
  });

  it('builds sentence-aligned passages that never cross pages', () => {
    const passages = buildPassages(PAGES, { targetWords: 12, maxWords: 30 });
    expect(passages.length).toBeGreaterThan(3);
    expect(new Set(passages.map((p) => p.page))).toEqual(new Set([1, 2, 3]));
    for (const p of passages) expect(PAGES[p.page - 1]).toContain(p.text.split(' ')[0]);
    expect(passages.map((p) => p.id)).toEqual(passages.map((_, i) => i));
  });

  it('ranks the passage that answers the question first (BM25)', () => {
    const index = buildIndex(buildPassages(PAGES, { targetWords: 12, maxWords: 30 }));
    const results = search(index, 'Which warehouses were merged?');
    expect(results[0]!.passage.page).toBe(2);
    expect(results[0]!.passage.text).toMatch(/warehouses were merged/);
    expect(search(index, 'the of and')).toEqual([]);
  });

  it('sends small documents whole and selects passages for large ones within the budget', () => {
    const small = buildIndex(buildPassages(PAGES));
    expect(selectContext(small, 'risks', 5000).mode).toBe('full');

    const large = buildIndex(buildPassages(longDocument()));
    const ctx = selectContext(large, 'share buyback approved by the board', 400);
    expect(ctx.mode).toBe('search');
    expect(ctx.passages.reduce((n, p) => n + p.tokens, 0)).toBeLessThanOrEqual(400);
    expect(ctx.ranked[0]!.passage.text).toMatch(/buyback/);
    expect(ctx.passages.map((p) => p.id)).toEqual([...ctx.passages.map((p) => p.id)].sort((a, b) => a - b));

    const overview = selectContext(large, 'summarize this', 400);
    expect(overview.mode).toBe('overview');
    expect(overview.passages[0]!.page).toBe(1);
    expect(new Set(overview.passages.map((p) => p.page)).size).toBeGreaterThan(2);
  });

  it('cuts dense Chinese and Japanese pages into passages that fit the context', () => {
    const sentence = '当社の売上高は前年同期比で増加し、主要な事業分野すべてで堅調な伸びを示しました。';
    const pages = Array.from({ length: 10 }, (_, i) => sentence.repeat(70) + (i === 6 ? '倉庫の統合はロッテルダムで完了しました。' : ''));
    const passages = buildPassages(pages);
    expect(Math.max(...passages.map((p) => p.tokens))).toBeLessThan(400);
    expect(passages[0]!.text).not.toMatch(/。 当/); // no spaces inserted between Japanese sentences
    const ctx = selectContext(buildIndex(passages), '倉庫の統合', 3000);
    expect(ctx.passages.some((p) => p.page === 7 && p.text.includes('倉庫'))).toBe(true);
  });
});

describe('prompt building', () => {
  it('trims history to the budget and never starts with an answer', () => {
    const history = [
      { role: 'user' as const, content: 'First question?' },
      { role: 'assistant' as const, content: 'A'.repeat(2000) },
      { role: 'user' as const, content: 'Second question?' },
      { role: 'assistant' as const, content: 'Second answer.' },
    ];
    const kept = trimHistory(history, 30);
    expect(kept[0]!.role).toBe('user');
    expect(kept.at(-1)!.content).toBe('Second answer.');
    expect(trimHistory(history, 10_000)[1]!.content.length).toBeLessThanOrEqual(701);
  });

  it('labels excerpts with pages and includes the conversation', () => {
    const index = buildIndex(buildPassages(PAGES));
    const prompt = buildPrompt({ fileName: 'report.pdf', pageCount: 3, passages: index.passages, mode: 'full', history: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }], question: 'What about risks?' });
    expect(prompt).toContain('"report.pdf" (3 pages)');
    expect(prompt).toContain('[p. 2] Operating costs');
    expect(prompt).toContain('User: Hi\nAssistant: Hello');
    expect(prompt.endsWith('Question: What about risks?')).toBe(true);
    expect(systemPrompt('es')).toContain('Spanish');
    expect(systemPrompt('en')).toContain('Unique AI');
  });
});

describe('citations', () => {
  it('finds page citations in common formats and ignores invalid pages', () => {
    const text = 'Revenue grew [p. 1]. Costs fell (page 2). Risks [pp. 2–3]. Bad [p. 99]. Ref [3] stays.';
    const pieces = splitCitations(text, 3);
    expect(pieces.filter((p) => p.type === 'cite').map((p) => (p.type === 'cite' ? p.pages : []))).toEqual([[1], [2], [2, 3]]);
    expect(pieces.map((p) => (p.type === 'text' ? p.text : '')).join('')).toContain('Bad [p. 99]. Ref [3] stays.');
    expect(citedPages('See [p. 3] and [p.1, 3]', 5)).toEqual([1, 3]);
  });

  it('ignores look-alikes such as (P1) or (p53) and reads other languages and separators', () => {
    expect(citedPages('Fix the login bug first (P1), then the report (P2). Mutations in (p53).', 60)).toEqual([]);
    expect(citedPages('Revenue grew [p. 3; p. 5] and (pg 7).', 9)).toEqual([3, 5, 7]);
    expect(citedPages('Los ingresos crecieron [pág. 4] y [págs. 5 y 6].', 9)).toEqual([4, 5, 6]);
    expect(citedPages('売上は増加しました［p. 4］。費用（2ページ）', 9)).toEqual([2, 4]);
    const pieces = splitCitations('Fine [p 2].', 3);
    expect(pieces.map((p) => p.type)).toEqual(['text', 'cite', 'text']);
  });
});

describe('suggestions', () => {
  it('adapts to the kind of document', () => {
    const contract = 'This Agreement is made between the parties. The Supplier shall deliver. Termination of this agreement. Liability. The parties shall. Obligations of each party.';
    expect(suggestQuestions(contract).map((s) => s.kind)).toContain('obligations');
    expect(suggestQuestions('Revenue was $4 million, up 12%, margin 3%, costs $2 million.').map((s) => s.kind)).toContain('numbers');
    const generic = suggestQuestions('A short note about the garden.');
    expect(generic[0]!.kind).toBe('summary');
    expect(generic).toHaveLength(3);
  });

  it('only counts month names next to a day or year (“may” is also a verb)', () => {
    const policy = 'You may cancel at any time. Users may opt out. We may share data with partners. Terms may change.';
    expect(suggestQuestions(policy).map((s) => s.kind)).not.toContain('dates');
    const schedule = 'Kick-off on May 5, review on 12 March 2026, launch in June 2026.';
    expect(suggestQuestions(schedule).map((s) => s.kind)).toContain('dates');
  });
});

/** A stand-in for Chrome's LanguageModel with the same shape. */
function fakeLanguageModel(opts: { streaming?: 'delta' | 'cumulative' | 'none'; window?: number; legacy?: boolean; availability?: AiAvailability; failCreate?: string } = {}) {
  const prompts: string[] = [];
  const stats = { created: 0, destroyed: 0, cloned: 0 };
  const answer = 'Costs fell 6% [p. 2].';
  const session = (): LanguageModelSession => {
    stats.created++;
    const s: LanguageModelSession = {
      ...(opts.legacy ? { inputQuota: opts.window ?? 4000 } : { contextWindow: opts.window ?? 4000 }),
      ...(opts.legacy ? { measureInputUsage: async (t: string) => Math.ceil(t.length / 4) } : { measureContextUsage: async (t: string) => Math.ceil(t.length / 4) }),
      prompt: async (t: string) => {
        prompts.push(t);
        return answer;
      },
      ...(opts.streaming === 'none'
        ? {}
        : {
            promptStreaming: (t: string, o?: LanguageModelPromptOptions) => {
              prompts.push(t);
              const parts = ['Costs fell ', '6% ', '[p. 2].'];
              let i = 0;
              let sent = '';
              return new ReadableStream<string>({
                pull(controller) {
                  if (o?.signal?.aborted) return controller.error(new DOMException('Aborted', 'AbortError'));
                  if (i >= parts.length) return controller.close();
                  sent += parts[i++];
                  controller.enqueue(opts.streaming === 'cumulative' ? sent : parts[i - 1]!);
                },
              });
            },
          }),
      clone: async () => {
        stats.cloned++;
        return session();
      },
      destroy: () => {
        stats.destroyed++;
      },
    };
    return s;
  };
  const api: LanguageModelStatic = {
    availability: async () => opts.availability ?? 'available',
    create: async () => {
      if (opts.failCreate) throw new DOMException('x', opts.failCreate);
      return session();
    },
  };
  return { api, prompts, stats };
}

describe('DocumentChat', () => {
  const index = buildIndex(buildPassages(longDocument()));
  const ask = { question: 'How much did operating costs fall?', history: [], index, fileName: 'report.pdf', pageCount: 40 };

  it('answers in a cloned session with streamed text and destroys it', async () => {
    for (const streaming of ['delta', 'cumulative', 'none'] as const) {
      const { api, prompts, stats } = fakeLanguageModel({ streaming });
      const chat = new DocumentChat(api);
      const texts: string[] = [];
      const stages: string[] = [];
      const result = await chat.ask(ask, { onText: (t) => texts.push(t), onStage: (s) => stages.push(s.kind) });
      expect(result.answer).toBe('Costs fell 6% [p. 2].');
      expect(texts.at(-1)).toBe(result.answer);
      expect(stages).toEqual(['reading', 'writing']);
      expect(result.mode).toBe('search');
      expect(result.ranked[0]!.passage.text).toMatch(/Operating costs fell/);
      expect(prompts[0]).toContain('Question: How much did operating costs fall?');
      expect(stats.cloned).toBe(1);
      expect(stats.destroyed).toBe(1); // the clone; the base stays for the next question
      chat.destroy();
      expect(stats.destroyed).toBe(2);
    }
  });

  it('keeps the prompt within the context window, with old and new member names', async () => {
    for (const legacy of [false, true]) {
      const { api, prompts } = fakeLanguageModel({ legacy, window: 1200 });
      const chat = new DocumentChat(api);
      await chat.ask(ask);
      expect(Math.ceil(prompts[0]!.length / 4)).toBeLessThanOrEqual(1200 * 0.62);
      expect(contextWindow((await chat.prepare()) as LanguageModelSession)).toBe(1200);
    }
  });

  it('includes the previous question when retrieving for a follow-up', async () => {
    const { api, prompts } = fakeLanguageModel();
    const chat = new DocumentChat(api);
    await chat.ask({ ...ask, question: 'And by how much?', history: [{ role: 'user', content: 'What happened to operating costs?' }, { role: 'assistant', content: 'They fell [p. 2].' }] });
    expect(prompts[0]).toContain('Operating costs fell');
    expect(prompts[0]).toContain('User: What happened to operating costs?');
  });

  it('maps cancellation and API errors', async () => {
    const { api } = fakeLanguageModel();
    const ac = new AbortController();
    ac.abort();
    await expect(new DocumentChat(api).ask(ask, {}, ac.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(new DocumentChat(fakeLanguageModel({ failCreate: 'NotSupportedError' }).api).ask(ask)).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    // A failed setup can be retried.
    const flaky = fakeLanguageModel({ failCreate: 'NotAllowedError' });
    const chat = new DocumentChat(flaky.api);
    await expect(chat.ask(ask)).rejects.toMatchObject({ message: expect.stringContaining('click') });
  });

  it('reports availability and a missing API', async () => {
    expect(await checkChatStatus('en', undefined)).toBe('no-api');
    expect(await checkChatStatus('en', fakeLanguageModel({ availability: 'downloadable' }).api)).toBe('downloadable');
  });

  it('falls back to matching passages without AI', () => {
    const results = searchAnswer(index, 'share buyback');
    expect(results[0]!.passage.text).toMatch(/buyback/);
    expect(searchAnswer(index, 'zzz qqq').map((r) => r.passage.id)).toEqual([0, 1]);
  });
});
