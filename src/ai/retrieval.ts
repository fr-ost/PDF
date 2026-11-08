/**
 * Lexical retrieval for document chat. Pages are split into sentence-aligned
 * passages that never cross a page boundary (so every passage has one page
 * number to cite), indexed with BM25, and selected to fit a token budget.
 * Small documents are sent whole; questions without any lexical match (such
 * as "summarize this") get an evenly spread overview of the document.
 */
import { estimateTokens } from './chunk';
import { STOPWORDS } from './extractive';
import { splitSentences, wordTokens } from './text';

export interface Passage {
  id: number;
  /** 1-based page number. */
  page: number;
  text: string;
  /** Estimated tokens. */
  tokens: number;
}

export interface SearchIndex {
  passages: Passage[];
  /** Term frequencies per passage. */
  tf: Map<string, number>[];
  lengths: number[];
  df: Map<string, number>;
  avgLength: number;
  totalTokens: number;
}

export interface ScoredPassage {
  passage: Passage;
  score: number;
}

export interface QueryPart {
  text: string;
  weight: number;
}

export type ContextMode = 'full' | 'search' | 'overview';

export interface SelectedContext {
  mode: ContextMode;
  /** In document order. */
  passages: Passage[];
  /** The best matches first (empty in full/overview mode). */
  ranked: ScoredPassage[];
}

const K1 = 1.2;
const B = 0.75;

/** Light, language-tolerant normalisation: lower case, no diacritics, simple English suffix folding. */
export function normalizeTerm(word: string): string {
  let w = word.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
  if (w.length > 5 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 6 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith('ed') && !w.endsWith('eed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es') && /(?:ch|sh|ss|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1);
  return w;
}

/** Search terms of a text: word-like segments without stop words. */
export function terms(text: string): string[] {
  const out: string[] = [];
  for (const raw of wordTokens(text)) {
    if (STOPWORDS.has(raw)) continue;
    if (raw.length < 2 && !/\d/.test(raw) && !/[぀-ヿ㐀-鿿가-힯]/.test(raw)) continue;
    out.push(normalizeTerm(raw));
  }
  return out;
}

/**
 * Size units: words in spaced scripts; Chinese and Japanese characters count one
 * each (they carry about a word's worth of meaning and tokens), so passages of
 * unspaced text are cut to a similar size as English ones.
 */
const UNIT = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]|[^\s\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+/g;
const countUnits = (text: string): number => text.match(UNIT)?.length ?? 0;
const UNSPACED_END = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]$/;
const UNSPACED_START = /^[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Joins sentences with a space, except between Chinese/Japanese sentences. */
function joinSentences(parts: string[]): string {
  let out = '';
  for (const part of parts) out += out && !(UNSPACED_END.test(out) && UNSPACED_START.test(part)) ? ` ${part}` : part;
  return out;
}

/** Splits pages into passages of roughly `targetWords` words (sentence-aligned, never crossing pages). */
export function buildPassages(pages: string[], { targetWords = 140, maxWords = 220 }: { targetWords?: number; maxWords?: number } = {}): Passage[] {
  const passages: Passage[] = [];
  const push = (page: number, parts: string[]) => {
    const text = joinSentences(parts).replace(/\s+/g, ' ').trim();
    if (text) passages.push({ id: passages.length, page, text, tokens: estimateTokens(text) });
  };
  pages.forEach((pageText, index) => {
    const page = index + 1;
    let current: string[] = [];
    let words = 0;
    for (const sentence of splitSentences(pageText)) {
      const count = countUnits(sentence);
      if (count > maxWords) {
        // A run-on "sentence" (tables, lists without punctuation): cut it by size units.
        if (current.length) push(page, current);
        current = [];
        words = 0;
        const units = [...sentence.matchAll(UNIT)];
        for (let i = 0; i < units.length; i += targetWords) {
          const last = units[Math.min(i + targetWords, units.length) - 1]!;
          push(page, [sentence.slice(units[i]!.index, last.index + last[0].length)]);
        }
        continue;
      }
      if (words + count > maxWords || (words >= targetWords && current.length)) {
        push(page, current);
        current = [];
        words = 0;
      }
      current.push(sentence);
      words += count;
    }
    if (current.length) push(page, current);
  });
  return passages;
}

export function buildIndex(passages: Passage[]): SearchIndex {
  const tf: Map<string, number>[] = [];
  const lengths: number[] = [];
  const df = new Map<string, number>();
  let total = 0;
  let totalTokens = 0;
  for (const p of passages) {
    const counts = new Map<string, number>();
    const list = terms(p.text);
    for (const t of list) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(counts);
    lengths.push(list.length);
    total += list.length;
    totalTokens += p.tokens;
  }
  return { passages, tf, lengths, df, avgLength: passages.length ? total / passages.length : 0, totalTokens };
}

/** BM25 ranking. Several weighted query parts can be combined (e.g. the question and the previous one). */
export function search(index: SearchIndex, query: string | QueryPart[], limit = 12): ScoredPassage[] {
  const parts = typeof query === 'string' ? [{ text: query, weight: 1 }] : query;
  const weights = new Map<string, number>();
  for (const part of parts) for (const t of terms(part.text)) weights.set(t, Math.max(weights.get(t) ?? 0, part.weight));
  if (weights.size === 0 || index.passages.length === 0) return [];
  const n = index.passages.length;
  const scored: ScoredPassage[] = [];
  index.passages.forEach((passage, i) => {
    const counts = index.tf[i]!;
    const length = index.lengths[i]!;
    let score = 0;
    for (const [term, weight] of weights) {
      const f = counts.get(term);
      if (!f) continue;
      const df = index.df.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += weight * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * length) / (index.avgLength || 1))));
    }
    if (score > 0) scored.push({ passage, score });
  });
  scored.sort((a, b) => b.score - a.score || a.passage.id - b.passage.id);
  return scored.slice(0, limit);
}

function inDocumentOrder(list: Passage[]): Passage[] {
  return [...list].sort((a, b) => a.id - b.id);
}

/** Evenly spread passages (always including the opening) that fit the budget. */
function overview(index: SearchIndex, budget: number): Passage[] {
  const all = index.passages;
  if (all.length === 0) return [];
  const picked: Passage[] = [];
  let used = 0;
  const take = (p: Passage | undefined) => {
    if (!p || picked.includes(p) || used + p.tokens > budget) return;
    picked.push(p);
    used += p.tokens;
  };
  take(all[0]);
  take(all[1]);
  const average = index.totalTokens / all.length || 1;
  const slots = Math.max(1, Math.floor(budget / average));
  const step = all.length / slots;
  for (let i = 0; i < slots; i++) take(all[Math.min(all.length - 1, Math.floor(i * step))]);
  return inDocumentOrder(picked);
}

/** Chooses the passages to show the model for a question, within `budgetTokens`. */
export function selectContext(index: SearchIndex, query: string | QueryPart[], budgetTokens: number): SelectedContext {
  if (index.totalTokens <= budgetTokens) return { mode: 'full', passages: [...index.passages], ranked: [] };
  const ranked = search(index, query, 40);
  if (ranked.length === 0) return { mode: 'overview', passages: overview(index, budgetTokens), ranked: [] };
  const picked: Passage[] = [];
  const ids = new Set<number>();
  let used = 0;
  const add = (p: Passage | undefined) => {
    if (!p || ids.has(p.id) || used + p.tokens > budgetTokens) return;
    ids.add(p.id);
    picked.push(p);
    used += p.tokens;
  };
  ranked.forEach(({ passage }, rank) => {
    add(passage);
    // The passage after a top match (same page) often continues the answer.
    if (rank < 3) {
      const next = index.passages[passage.id + 1];
      if (next && next.page === passage.page) add(next);
    }
  });
  return { mode: 'search', passages: inDocumentOrder(picked), ranked };
}
