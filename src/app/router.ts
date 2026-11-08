/**
 * Minimal hash router (extension pages are static files, so hash routing is
 * the robust choice). Includes a leave guard so users don't lose selected
 * files by navigating away accidentally.
 */
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { runViewTransition } from './viewTransition';

export type Category = 'organize' | 'convert' | 'edit' | 'security' | 'ai';
export type Route =
  | { name: 'home' }
  | { name: 'category'; category: Category }
  | { name: 'tool'; id: string }
  | { name: 'recent' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'privacy' }
  | { name: 'donate' }
  | { name: 'not-found' };

const CATEGORIES: Category[] = ['organize', 'convert', 'edit', 'security', 'ai'];

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  const [first, second] = parts;
  if (parts.length === 1 && CATEGORIES.includes(first as Category)) return { name: 'category', category: first as Category };
  if (first === 'tool' && second && /^[a-z0-9-]+$/.test(second)) return { name: 'tool', id: second };
  if (parts.length === 1 && (first === 'recent' || first === 'settings' || first === 'about' || first === 'privacy' || first === 'donate')) return { name: first };
  return { name: 'not-found' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'category':
      return `#/${route.category}`;
    case 'tool':
      return `#/tool/${route.id}`;
    case 'not-found':
      return '#/';
    default:
      return `#/${route.name}`;
  }
}

// ---- view transitions --------------------------------------------------------
export { prefersReducedMotion } from './viewTransition';

/** Runs a route update inside a View Transition when supported and allowed. */
export function withViewTransition(update: () => void): void {
  runViewTransition(() => flushSync(update));
}

// ---- leave guard -----------------------------------------------------------
let guardMessage: string | null = null;
let pendingHash: string | null = null;
let currentHash = typeof location !== 'undefined' ? location.hash : '';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function setLeaveGuard(message: string | null): void {
  guardMessage = message;
}

export function getPendingNavigation(): { hash: string; message: string } | null {
  return pendingHash !== null && guardMessage ? { hash: pendingHash, message: guardMessage } : null;
}

export function confirmPendingNavigation(): void {
  const target = pendingHash;
  const delta = pendingDelta;
  pendingHash = null;
  pendingDelta = 0;
  guardMessage = null;
  if (target !== null) {
    // Replay the step through history that was held back, or follow the link.
    if (delta !== 0) history.go(delta);
    else location.hash = target;
  }
  emit();
}

export function cancelPendingNavigation(): void {
  pendingHash = null;
  pendingDelta = 0;
  emit();
}

export function navigate(hash: string): void {
  if (hash === location.hash) return;
  if (guardMessage) {
    pendingHash = hash;
    emit();
    return;
  }
  location.hash = hash;
}

/** Index of the current session-history entry (Navigation API, Chrome 102+), or -1. */
function historyIndex(): number {
  return (globalThis as { navigation?: { currentEntry?: { index: number } | null } }).navigation?.currentEntry?.index ?? -1;
}
let committedIndex = typeof window !== 'undefined' ? historyIndex() : -1;
let pendingDelta = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const hash = location.hash;
    // In-page anchors (e.g. "#main") are not routes: keep the current page.
    if (hash && !hash.startsWith('#/')) {
      history.replaceState(null, '', currentHash || '#/');
      return;
    }
    const index = historyIndex();
    if (hash === currentHash) {
      committedIndex = index; // returned to the page after a held-back step
      return;
    }
    if (guardMessage) {
      // A link, Back or Forward while work is in progress: step back to this
      // page without rewriting history entries, and ask first.
      const delta = index >= 0 && committedIndex >= 0 ? index - committedIndex : 0;
      pendingHash = hash;
      pendingDelta = delta;
      if (delta !== 0) history.go(-delta);
      else history.replaceState(null, '', currentHash || '#/');
      emit();
      return;
    }
    currentHash = hash;
    committedIndex = index;
    withViewTransition(emit);
  });
  window.addEventListener('beforeunload', (e) => {
    if (guardMessage) {
      e.preventDefault();
    }
  });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let cachedHash = '';
let cachedRoute: Route = { name: 'home' };
function getRoute(): Route {
  // The committed location, not location.hash: while the leave guard holds a
  // navigation back (history.go is asynchronous), the URL briefly shows the target.
  const hash = currentHash;
  if (hash !== cachedHash) {
    cachedHash = hash;
    cachedRoute = parseHash(hash);
  }
  return cachedRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute, getRoute);
}

let cachedPending: { hash: string; message: string } | null = null;
function getPendingSnapshot() {
  const next = getPendingNavigation();
  if (next?.hash !== cachedPending?.hash || next?.message !== cachedPending?.message) cachedPending = next;
  return cachedPending;
}
export function usePendingNavigation() {
  return useSyncExternalStore(subscribe, getPendingSnapshot, getPendingSnapshot);
}

// ---- files handed from the home screen to a tool ---------------------------
let handoff: File[] = [];
export function handOffFiles(files: File[]): void {
  handoff = files;
}
export function takeHandedOffFiles(): File[] {
  const files = handoff;
  handoff = [];
  return files;
}
