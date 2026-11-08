/**
 * Non-AI "key sentences" summary that works on every device. It scores
 * sentences by how many of the document's most frequent meaningful words
 * they contain (a classic frequency-based extractive method) and returns the
 * best ones in their original order. It never invents text.
 */
import { splitSentences, wordTokens } from './text';

const STOPWORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves ' +
    'el la los las un una unos unas de del y o en que por para con sin es son se su sus al lo como más pero sus este esta estos estas ' +
    'le les des du et ou en est sont pour par avec sans ce cette ces une un dans sur au aux qui que ' +
    'der die das den dem des ein eine und oder ist sind mit für von zu im auf nicht'
  ).split(/\s+/),
);

export interface ExtractiveOptions {
  sentences: number;
}

export function extractiveSummary(text: string, { sentences }: ExtractiveOptions): string[] {
  const all = splitSentences(text).filter((s) => s.length >= 25 && s.length <= 700);
  if (all.length === 0) return [];
  if (all.length <= sentences) return all;

  const freq = new Map<string, number>();
  const tokenized = all.map((s) => wordTokens(s).filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w)));
  for (const tokens of tokenized) for (const w of new Set(tokens)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const max = Math.max(1, ...freq.values());

  const scored = all.map((s, i) => {
    const unique = new Set(tokenized[i]);
    let score = 0;
    for (const w of unique) score += (freq.get(w) ?? 0) / max;
    score /= Math.pow(Math.max(1, unique.size), 0.6);
    if (i < Math.max(2, all.length * 0.1)) score *= 1.15; // introductions carry the gist
    return { i, s, score };
  });

  const chosen: { i: number; s: string }[] = [];
  for (const candidate of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    // Skip near-duplicates (common with repeated headers/footers).
    if (chosen.some((c) => similarity(c.s, candidate.s) > 0.8)) continue;
    chosen.push(candidate);
    if (chosen.length >= sentences) break;
  }
  return chosen.sort((a, b) => a.i - b.i).map((c) => c.s);
}

function similarity(a: string, b: string): number {
  const A = new Set(wordTokens(a));
  const B = new Set(wordTokens(b));
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(1, Math.min(A.size, B.size));
}
