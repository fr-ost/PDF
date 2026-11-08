/**
 * Thin wrapper around the View Transitions API.
 *
 * While a transition runs, Chrome routes pointer events to <html>, so
 * transitions are kept short, and <html data-transition> marks the running
 * period (tests wait for it to clear before interacting).
 */
export interface ViewTransitionHandle {
  ready: Promise<void>;
  finished: Promise<void>;
}

type TransitionDoc = Document & { startViewTransition?: (update: () => void) => ViewTransitionHandle };

let running = 0;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs `update` inside a view transition when supported, visible and allowed by
 * the user's motion preference; otherwise runs it immediately and returns null.
 */
export function runViewTransition(update: () => void): ViewTransitionHandle | null {
  const doc = document as TransitionDoc;
  if (!doc.startViewTransition || prefersReducedMotion() || document.visibilityState !== 'visible') {
    update();
    return null;
  }
  const root = document.documentElement;
  running++;
  root.setAttribute('data-transition', '');
  const transition = doc.startViewTransition(update);
  // `ready` rejects when a newer transition skips this one; that is expected.
  transition.ready.catch(() => undefined);
  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      running = Math.max(0, running - 1);
      if (running === 0) root.removeAttribute('data-transition');
    });
  return transition;
}
