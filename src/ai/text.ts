/** Text helpers for AI features (pure, no browser APIs beyond Intl). */

/** Minimal shape of a PDF.js text item. */
export interface TextItemish {
  str?: string;
  hasEOL?: boolean;
}

/** Joins PDF.js text items the way PDF.js itself does for copy/paste. */
export function pageTextFromItems(items: TextItemish[]): string {
  let out = '';
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    out += item.str;
    if (item.hasEOL) out += '\n';
  }
  return out;
}

/**
 * Normalises extracted PDF text for language models: re-joins words
 * hyphenated across lines, turns soft line breaks into spaces and keeps
 * paragraph breaks after sentence-ending punctuation.
 */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00ad/g, '')
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/[ \t\f\v]*\n[\s]*/g, (_m, offset: number, whole: string) => {
      const prev = whole.slice(Math.max(0, offset - 1), offset);
      return /[.!?:;。！？]/.test(prev) ? '\n' : ' ';
    })
    .replace(/[ \t\f\v\u00a0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let wordSegmenter: Intl.Segmenter | null = null;
function words(): Intl.Segmenter {
  wordSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
  return wordSegmenter;
}

export function countWords(text: string): number {
  let n = 0;
  for (const seg of words().segment(text)) if (seg.isWordLike) n++;
  return n;
}

export function wordTokens(text: string): string[] {
  const out: string[] = [];
  for (const seg of words().segment(text)) if (seg.isWordLike) out.push(seg.segment.toLowerCase());
  return out;
}

let sentenceSegmenter: Intl.Segmenter | null = null;
export function splitSentences(text: string): string[] {
  sentenceSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'sentence' });
  const out: string[] = [];
  for (const seg of sentenceSegmenter.segment(text)) {
    const s = seg.segment.trim();
    if (s) out.push(s);
  }
  return out;
}
