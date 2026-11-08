/**
 * Splits long documents into pieces that fit a model's input quota.
 * A cheap estimator packs pages; every finished chunk is then verified with
 * the model's own token counter and halved if it is still too large.
 */
import { splitSentences } from './text';

export type Measure = (text: string) => Promise<number>;

/** Rough token estimate (≈ 4 characters per token for Latin text, 1–2 for CJK). */
export function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) if (/[぀-ヿ㐀-鿿가-힯]/.test(ch)) cjk++;
  return Math.ceil((text.length - cjk) / 4 + cjk * 1.2);
}

/** Breaks a single oversized text into sentence-aligned pieces under `maxTokens` (estimated). */
export function splitOversized(text: string, maxTokens: number): string[] {
  const pieces: string[] = [];
  let current = '';
  const push = () => {
    if (current.trim()) pieces.push(current.trim());
    current = '';
  };
  for (const sentence of splitSentences(text)) {
    if (estimateTokens(sentence) > maxTokens) {
      push();
      const wordsList = sentence.split(/\s+/);
      let part = '';
      for (const w of wordsList) {
        if (estimateTokens(`${part} ${w}`) > maxTokens && part) {
          pieces.push(part.trim());
          part = '';
        }
        part += ` ${w}`;
      }
      if (part.trim()) pieces.push(part.trim());
      continue;
    }
    if (estimateTokens(`${current} ${sentence}`) > maxTokens) push();
    current += ` ${sentence}`;
  }
  push();
  return pieces;
}

export async function chunkTexts(parts: string[], maxTokens: number, measure?: Measure): Promise<string[]> {
  if (maxTokens < 16) throw new Error('Token budget too small');
  const packed: string[] = [];
  let current = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const pieces = estimateTokens(part) > maxTokens ? splitOversized(part, maxTokens) : [part];
    for (const piece of pieces) {
      const candidate = current ? `${current}\n\n${piece}` : piece;
      if (estimateTokens(candidate) > maxTokens && current) {
        packed.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
  }
  if (current) packed.push(current);
  if (!measure) return packed;

  // Verify against the real tokenizer; halve anything that is still too large.
  const verified: string[] = [];
  const queue = [...packed];
  while (queue.length) {
    const chunk = queue.shift()!;
    if ((await measure(chunk)) <= maxTokens || chunk.length < 200) {
      verified.push(chunk);
      continue;
    }
    const halves = splitOversized(chunk, Math.max(16, Math.floor(estimateTokens(chunk) / 2)));
    queue.unshift(...(halves.length > 1 ? halves : [chunk.slice(0, chunk.length >> 1), chunk.slice(chunk.length >> 1)]));
  }
  return verified;
}

/**
 * Streaming APIs have returned either cumulative text or deltas depending on
 * the Chrome version. This accepts both.
 */
export function accumulateStream(previous: string, chunk: string): string {
  if (previous && chunk.startsWith(previous)) return chunk;
  return previous + chunk;
}
