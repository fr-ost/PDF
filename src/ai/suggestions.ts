/**
 * Suggested first questions for document chat, chosen from what the document
 * looks like (contract, report with figures, research paper, schedule…).
 * Instant and deterministic: no model call needed.
 */
export type SuggestionKind = 'summary' | 'takeaways' | 'dates' | 'numbers' | 'obligations' | 'findings' | 'people' | 'simple';

export interface Suggestion {
  kind: SuggestionKind;
  text: string;
}

// Month names only count next to a day or a year: "may" and "march" are also common words.
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const DAY = String.raw`\d{1,2}(?:st|nd|rd|th)?`;
const MONTHS = new RegExp(String.raw`\b${MONTH}\s+${DAY}\b|\b${DAY}\s+(?:of\s+)?${MONTH}(?![a-z])|\b${MONTH}\s+(?:19|20)\d{2}\b`, 'gi');

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function suggestQuestions(text: string, max = 4): Suggestion[] {
  const sample = text.slice(0, 200_000);
  const lower = sample.toLowerCase();
  const out: Suggestion[] = [{ kind: 'summary', text: 'Summarize this document in 5 bullet points' }];

  const contract = count(lower, /\b(?:agreement|party|parties|shall|hereby|termination|liabilit(?:y|ies)|clause|obligations?)\b/g);
  const research = count(lower, /\b(?:abstract|methods?|methodology|results|findings|conclusions?|hypothes[ie]s|participants|dataset)\b/g);
  const dates = count(sample, MONTHS) + count(sample, /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g) + count(lower, /\b(?:deadline|due date|due by|no later than|schedule)\b/g);
  const numbers = count(sample, /(?:[$€£¥]\s?\d|\d\s?%|\b\d[\d,.]*\s?(?:million|billion|thousand|usd|eur|gbp)\b)/gi);
  const people = count(sample, /\b(?:mr|mrs|ms|dr|prof)\.\s+[A-Z]/g) + count(lower, /\b(?:ceo|director|manager|author|chair(?:man|woman)?|president)\b/g);

  if (contract >= 6) out.push({ kind: 'obligations', text: 'What are the key obligations and deadlines?' });
  if (research >= 4) out.push({ kind: 'findings', text: 'What are the main findings?' });
  if (numbers >= 3) out.push({ kind: 'numbers', text: 'What are the most important numbers?' });
  if (dates >= 3 && contract < 6) out.push({ kind: 'dates', text: 'What are the important dates and deadlines?' });
  out.push({ kind: 'takeaways', text: 'What are the key takeaways?' });
  if (people >= 3) out.push({ kind: 'people', text: 'Who are the people and organizations mentioned?' });
  out.push({ kind: 'simple', text: 'Explain this document in simple terms' });

  const seen = new Set<SuggestionKind>();
  return out.filter((s) => !seen.has(s.kind) && seen.add(s.kind)).slice(0, max);
}
