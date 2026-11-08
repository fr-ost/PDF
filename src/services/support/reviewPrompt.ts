/**
 * When to ask for a store review. Only a count of completed tasks and the
 * answer to the prompt are stored, on this device. The prompt never offers
 * anything in return and shows the same choices to everyone.
 */
import { useSyncExternalStore } from 'react';
import { storageGet, storageRemove, storageSet, storageSubscribe } from '../storage/storage';

export interface ReviewState {
  /** Tasks finished successfully (files saved, summaries, chat answers). */
  tasks: number;
  /** Ask when `tasks` reaches this number. */
  nextAskAt: number;
  /** How many times the prompt was answered. */
  asked: number;
  /** Rated, or asked not to be asked again. */
  done: boolean;
}

export const FIRST_ASK = 3;
export const ASK_AGAIN_AFTER = 12;
export const MAX_ASKS = 3;
export const INITIAL_REVIEW_STATE: ReviewState = { tasks: 0, nextAskAt: FIRST_ASK, asked: 0, done: false };

export const shouldAsk = (s: ReviewState): boolean => !s.done && s.asked < MAX_ASKS && s.tasks >= s.nextAskAt;
export const afterTask = (s: ReviewState): ReviewState => ({ ...s, tasks: s.tasks + 1 });
export const afterLater = (s: ReviewState): ReviewState => ({ ...s, asked: s.asked + 1, nextAskAt: s.tasks + ASK_AGAIN_AFTER });
export const afterFinal = (s: ReviewState): ReviewState => ({ ...s, asked: s.asked + 1, done: true });

const KEY = 'reviewPrompt';
let state: ReviewState = INITIAL_REVIEW_STATE;
let loaded: Promise<void> | null = null;
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((fn) => fn());

function sanitize(value: unknown): ReviewState {
  if (!value || typeof value !== 'object') return INITIAL_REVIEW_STATE;
  const v = value as Partial<ReviewState>;
  const count = (n: unknown, fallback: number) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback);
  return { tasks: count(v.tasks, 0), nextAskAt: count(v.nextAskAt, FIRST_ASK), asked: count(v.asked, 0), done: v.done === true };
}

function load(): Promise<void> {
  loaded ??= storageGet(KEY).then((value) => {
    state = sanitize(value);
    emit();
  });
  return loaded;
}

async function update(next: (s: ReviewState) => ReviewState): Promise<void> {
  await load();
  state = next(state);
  emit();
  await storageSet(KEY, state);
}

/** Call when a task finished successfully. */
export function noteSuccessfulTask(): Promise<void> {
  return update(afterTask);
}

export const answerLater = (): Promise<void> => update(afterLater);
/** Rated, or "don't ask again". */
export const answerFinal = (): Promise<void> => update(afterFinal);

/** For "Clear all local data". */
export async function resetReviewPrompt(): Promise<void> {
  state = INITIAL_REVIEW_STATE;
  emit();
  await storageRemove([KEY]);
}

storageSubscribe(KEY, (value) => {
  state = sanitize(value);
  emit();
});

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  void load();
  return () => subscribers.delete(fn);
}

export function useReviewState(): ReviewState {
  return useSyncExternalStore(subscribe, () => state);
}
