import { useEffect, useState } from 'react';
import { getDocumentProxy } from '../../pdf/renderers/documents';
import { cleanExtractedText, countWords, pageTextFromItems, type TextItemish } from '../../ai/text';

export interface DocumentText {
  pages: string[];
  words: number;
}

export interface DocumentTextState {
  text: DocumentText | null;
  progress: { done: number; total: number } | null;
  error: string | null;
}

/**
 * Extracts the text of every page with PDF.js, once per document, and
 * reports progress. Results from a superseded document are discarded.
 */
export function useDocumentText(docId: string | undefined): DocumentTextState {
  const [state, setState] = useState<DocumentTextState>({ text: null, progress: null, error: null });

  useEffect(() => {
    setState({ text: null, progress: null, error: null });
    if (!docId) return;
    let cancelled = false;
    void (async () => {
      try {
        const doc = await getDocumentProxy(docId);
        if (!doc || cancelled) return;
        const total = doc.numPages;
        const pages: string[] = [];
        setState({ text: null, progress: { done: 0, total }, error: null });
        let lastReport = 0;
        for (let i = 1; i <= total; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          pages.push(cleanExtractedText(pageTextFromItems(content.items as TextItemish[])));
          page.cleanup();
          const now = performance.now();
          if (i === total || now - lastReport > 120) {
            lastReport = now;
            if (!cancelled) setState({ text: null, progress: { done: i, total }, error: null });
          }
        }
        if (!cancelled) setState({ text: { pages, words: countWords(pages.join(' ')) }, progress: null, error: null });
      } catch {
        if (!cancelled) setState({ text: null, progress: null, error: 'The text of this PDF could not be read.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  return state;
}
