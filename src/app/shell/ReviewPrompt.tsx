/**
 * Asks happy users for a store rating, at a moment of success (after a few
 * finished tasks). Shown only in copies installed from a store, never more than
 * three times, never offering anything in return; everyone gets the same
 * choices. Toasts use the bottom-right corner, so this card sits bottom-left
 * (below the header on phones).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { answerFinal, answerLater, shouldAsk, useReviewState } from '../../services/support/reviewPrompt';
import { storeListing } from '../../services/support/support';

/** Five gold stars (decorative). */
export function FiveStars({ size = 18, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <span className={className ?? 'flex gap-0.5'} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} fill="currentColor" strokeWidth={1.5} className={animated ? 'review-star text-amber-400' : 'text-amber-400'} style={animated ? { ['--i' as string]: i } : undefined} />
      ))}
    </span>
  );
}

export function ReviewPrompt() {
  const state = useReviewState();
  const [listing] = useState(storeListing);
  const eligible = !!listing && shouldAsk(state);
  const [shown, setShown] = useState(false);

  // Let the result of the task appear first.
  useEffect(() => {
    if (!eligible) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), 1400);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  if (!listing || !eligible || !shown) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="review-prompt-title"
      aria-describedby="review-prompt-text"
      data-testid="review-prompt"
      className="fixed inset-x-3 top-[4.25rem] z-40 mx-auto max-w-[400px] animate-pop-in lg:inset-x-auto lg:bottom-6 lg:left-[calc(264px+1.5rem)] lg:top-auto lg:mx-0 lg:w-[380px]"
    >
      <div className="relative overflow-hidden rounded-[20px] border border-line bg-surface p-5 shadow-pop">
        <div aria-hidden className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full bg-[radial-gradient(closest-side,rgb(251_191_36/0.3),transparent)]" />
        <button type="button" onClick={() => void answerLater()} aria-label="Close, ask me later" className="absolute right-3 top-3 rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg">
          <X size={16} aria-hidden />
        </button>
        <FiveStars size={24} animated className="relative flex gap-1" />
        <h2 id="review-prompt-title" className="relative mt-3 text-[16px] font-semibold tracking-tight">
          Enjoying Unique PDF?
        </h2>
        <p id="review-prompt-text" className="relative mt-1 text-[13.5px] leading-relaxed text-fg-muted">
          If it saved you time, please rate it 5 stars on the {listing.storeName}. It takes ten seconds and helps more people find free, private PDF tools.
        </p>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <a
            href={listing.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void answerFinal()}
            className="btn-primary btn-press inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[14px] font-medium"
            data-testid="review-rate"
          >
            <Star size={15} fill="currentColor" aria-hidden className="relative" />
            <span className="relative">Rate 5 stars</span>
          </a>
          <Button variant="ghost" onClick={() => void answerLater()}>
            Maybe later
          </Button>
        </div>
        <button type="button" onClick={() => void answerFinal()} className="relative mt-3 text-[12px] text-fg-subtle underline-offset-2 transition-colors hover:text-fg hover:underline">
          Don’t ask again
        </button>
      </div>
    </div>,
    document.body,
  );
}
