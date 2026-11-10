/**
 * Optional, anonymous usage stats. OFF until the user turns them on
 * (Settings → Privacy, or the one-time "Help improve Unique PDF" card).
 *
 * While on, the extension sends small counters to the Unique PDF tracker
 * (tracker/worker.js, a Cloudflare Worker): which tools finished a task and
 * how often, how many Unique AI questions were asked, minutes the app tab was
 * open, plus the extension version, OS, browser language, whether Chrome's
 * built-in AI is available, the install age in days and a random install id.
 *
 * Never sent: documents or any of their content, file names, file sizes,
 * page counts, passwords, AI questions or answers, settings, history, or
 * anything about websites. Turning stats off deletes the id and the
 * unsent counters, and nothing is sent again.
 */
import { useSyncExternalStore } from 'react';
import { storageGet, storageRemove, storageSet, storageSubscribe } from '../storage/storage';

import { USAGE_STATS_ENDPOINT } from './endpoint';

export { USAGE_STATS_ENDPOINT };
/** Counters are sent at most this often (plus once a day, and on install/update). */
export const USAGE_INTERVAL = 30 * 60 * 1000;
const DAY = 86_400_000;

export type Consent = 'unset' | 'on' | 'off';

export interface UsageCounts {
  /** Finished tasks per tool id. */
  t: Record<string, number>;
  /** Unique AI chat questions. */
  q: number;
  /** Minutes the app tab was open and visible. */
  um: number;
}

export interface UsageState {
  consent: Consent;
  /** The one-time card was answered (or the switch was used). */
  asked: boolean;
  /** Random install id, only while stats are on. */
  id: string;
  /** The tracker already knows this install. */
  registered: boolean;
  /** UTC day of the last "active" event. */
  lastActiveDay: string;
  /** Time of the last successful send. */
  lastSent: number;
  /** Version reported last, to send "update" when it changes. */
  reportedVersion: string;
  counts: UsageCounts;
}

export interface UsageEvent {
  ev: 'install' | 'update' | 'active' | 'usage';
  id: string;
  v: string;
  pv?: string;
  p?: string;
  l?: string;
  ag?: number;
  ai?: string;
  t?: Record<string, number>;
  q?: number;
  um?: number;
}

export interface Environment {
  version: string;
  platform?: string;
  language?: string;
  ai?: string;
  /** When the extension was installed (stored locally by the background worker). */
  installedAt?: number;
}

const emptyCounts = (): UsageCounts => ({ t: {}, q: 0, um: 0 });
export const INITIAL_USAGE_STATE: UsageState = { consent: 'unset', asked: false, id: '', registered: false, lastActiveDay: '', lastSent: 0, reportedVersion: '', counts: emptyCounts() };

const TOOL_ID = /^[a-z][a-z0-9-]{0,23}$/;
const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const count = (n: unknown, max = 1_000_000) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : 0);

export function sanitizeUsageState(value: unknown): UsageState {
  if (!value || typeof value !== 'object') return { ...INITIAL_USAGE_STATE, counts: emptyCounts() };
  const v = value as Partial<UsageState>;
  const consent: Consent = v.consent === 'on' || v.consent === 'off' ? v.consent : 'unset';
  const id = consent === 'on' && typeof v.id === 'string' && /^[a-f0-9]{32}$/.test(v.id) ? v.id : '';
  const t: Record<string, number> = {};
  const rawT = v.counts?.t;
  if (rawT && typeof rawT === 'object') for (const [k, n] of Object.entries(rawT)) if (TOOL_ID.test(k) && count(n)) t[k] = count(n);
  return {
    consent: consent === 'on' && !id ? 'unset' : consent,
    asked: v.asked === true,
    id,
    registered: id ? v.registered === true : false,
    lastActiveDay: typeof v.lastActiveDay === 'string' ? v.lastActiveDay : '',
    lastSent: count(v.lastSent, Number.MAX_SAFE_INTEGER),
    reportedVersion: typeof v.reportedVersion === 'string' ? v.reportedVersion : '',
    counts: id ? { t, q: count(v.counts?.q), um: count(v.counts?.um) } : emptyCounts(),
  };
}

const hasCounts = (c: UsageCounts) => c.q > 0 || c.um > 0 || Object.keys(c.t).length > 0;

/** The event to send now, or null. Pure, so the rules are unit-tested. */
export function nextEvent(s: UsageState, env: Environment, now: number): UsageEvent | null {
  if (s.consent !== 'on' || !s.id) return null;
  let ev: UsageEvent['ev'];
  if (!s.registered) ev = 'install';
  else if (s.reportedVersion && s.reportedVersion !== env.version) ev = 'update';
  else if (s.lastActiveDay !== dayOf(now)) ev = 'active';
  else if (hasCounts(s.counts) && now - s.lastSent >= USAGE_INTERVAL) ev = 'usage';
  else return null;
  const event: UsageEvent = { ev, id: s.id, v: env.version };
  if (ev === 'update') event.pv = s.reportedVersion;
  if (ev !== 'usage') {
    if (env.platform) event.p = env.platform;
    if (env.language) event.l = env.language;
    if (env.ai) event.ai = env.ai;
    event.ag = env.installedAt ? Math.max(0, Math.floor((now - env.installedAt) / DAY)) : 0;
  }
  if (Object.keys(s.counts.t).length) event.t = { ...s.counts.t };
  if (s.counts.q) event.q = s.counts.q;
  if (s.counts.um) event.um = s.counts.um;
  return event;
}

/** State after `event` was delivered: its counters are subtracted (new ones made meanwhile stay). */
export function afterSent(s: UsageState, event: UsageEvent, env: Environment, now: number): UsageState {
  if (s.id !== event.id) return s;
  const t: Record<string, number> = {};
  for (const [k, n] of Object.entries(s.counts.t)) {
    const left = n - (event.t?.[k] ?? 0);
    if (left > 0) t[k] = left;
  }
  return {
    ...s,
    registered: true,
    reportedVersion: env.version,
    lastActiveDay: event.ev === 'usage' ? s.lastActiveDay : dayOf(now),
    lastSent: now,
    counts: { t, q: Math.max(0, s.counts.q - (event.q ?? 0)), um: Math.max(0, s.counts.um - (event.um ?? 0)) },
  };
}

export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- store ---------------------------------------------------------------------
const KEY = 'usageStats';
/** Written by the background worker on install (local only, used for the install age). */
export const INSTALLED_AT_KEY = 'installedAt';

let state: UsageState = INITIAL_USAGE_STATE;
let loaded: Promise<void> | null = null;
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((fn) => fn());

function load(): Promise<void> {
  loaded ??= storageGet(KEY).then((value) => {
    state = sanitizeUsageState(value);
    emit();
  });
  return loaded;
}

/** Serializes read-modify-write across the app tab and the popup. */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  return locks ? locks.request('unique-pdf-usage-stats', fn) : fn();
}

async function update(next: (s: UsageState) => UsageState): Promise<UsageState> {
  return withLock(async () => {
    await load();
    // Re-read: another page (the popup or a second tab) may have changed it.
    state = sanitizeUsageState((await storageGet(KEY)) ?? state);
    state = next(state);
    emit();
    await storageSet(KEY, state);
    return state;
  });
}

storageSubscribe(KEY, (value) => {
  state = sanitizeUsageState(value);
  emit();
});

export function useUsageStats(): UsageState {
  void load();
  return useSyncExternalStore(
    (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    () => state,
    () => state,
  );
}

// ---- environment ----------------------------------------------------------------
async function aiStatus(): Promise<string | undefined> {
  const api = (globalThis as { LanguageModel?: { availability?: (o?: unknown) => Promise<string> } }).LanguageModel;
  if (!api || typeof api.availability !== 'function') return 'unavailable';
  try {
    const status = await Promise.race([api.availability(), new Promise<string>((r) => setTimeout(() => r(''), 3000))]);
    return ['available', 'downloadable', 'downloading', 'unavailable'].includes(status) ? status : undefined;
  } catch {
    return undefined;
  }
}

async function environment(): Promise<Environment> {
  const env: Environment = { version: __APP_VERSION__ };
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getPlatformInfo) env.platform = (await chrome.runtime.getPlatformInfo()).os;
  } catch {
    /* not in the extension */
  }
  const lang = (globalThis.navigator?.language || '').split('-')[0]?.toLowerCase();
  if (lang && /^[a-z]{2,3}$/.test(lang)) env.language = lang;
  const ai = await aiStatus();
  if (ai) env.ai = ai;
  const installedAt = await storageGet<number>(INSTALLED_AT_KEY);
  if (typeof installedAt === 'number' && installedAt > 0) env.installedAt = installedAt;
  return env;
}

function setUninstallUrl(s: UsageState): void {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.setUninstallURL) return;
    const url = s.consent === 'on' && s.id ? `${USAGE_STATS_ENDPOINT}/u?id=${s.id}&v=${encodeURIComponent(__APP_VERSION__)}` : '';
    void chrome.runtime.setUninstallURL(url).catch(() => {});
  } catch {
    /* ignore */
  }
}

// ---- sending --------------------------------------------------------------------
let sending = false;

/** Sends the next due event, if any. Never throws; failures are retried later. */
export async function flushUsageStats(now = Date.now()): Promise<void> {
  if (sending) return;
  await load();
  if (state.consent !== 'on') return;
  sending = true;
  try {
    const env = await environment();
    await withLock(async () => {
      const current = sanitizeUsageState((await storageGet(KEY)) ?? state);
      const event = nextEvent(current, env, now);
      if (!event) return;
      const res = await fetch(`${USAGE_STATS_ENDPOINT}/e`, {
        method: 'POST',
        // text/plain keeps it a "simple" request (no CORS preflight); the Worker parses JSON.
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(event),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        keepalive: true,
      });
      if (!res.ok) return;
      const latest = sanitizeUsageState((await storageGet(KEY)) ?? current);
      state = afterSent(latest, event, env, now);
      emit();
      await storageSet(KEY, state);
    });
  } catch {
    /* offline or blocked: keep the counters for the next try */
  } finally {
    sending = false;
  }
}

/** A tool finished a task. Counted only while stats are on. */
export async function noteToolUsed(toolId: string): Promise<void> {
  await load();
  if (state.consent !== 'on' || !TOOL_ID.test(toolId)) return;
  await update((s) => (s.consent === 'on' ? { ...s, counts: { ...s.counts, t: { ...s.counts.t, [toolId]: Math.min(1_000_000, (s.counts.t[toolId] ?? 0) + 1) } } } : s));
  void flushUsageStats();
}

/** A Unique AI chat question was asked. */
export async function noteAiQuestion(): Promise<void> {
  await load();
  if (state.consent !== 'on') return;
  await update((s) => (s.consent === 'on' ? { ...s, counts: { ...s.counts, q: s.counts.q + 1 } } : s));
}

/** Turns stats on or off (also answers the one-time card). */
export async function setUsageStatsConsent(on: boolean): Promise<void> {
  const next = await update((s) =>
    on
      ? { ...s, consent: 'on', asked: true, id: s.id || randomId() }
      : { ...INITIAL_USAGE_STATE, counts: emptyCounts(), consent: 'off', asked: true },
  );
  setUninstallUrl(next);
  if (on) void flushUsageStats();
}

/** "Not now" on the one-time card: stays off, the card doesn't come back. */
export async function dismissUsageStatsAsk(): Promise<void> {
  await update((s) => ({ ...s, asked: true }));
}

/** For "Clear all local data". */
export async function resetUsageStats(): Promise<void> {
  await withLock(async () => {
    state = { ...INITIAL_USAGE_STATE, counts: emptyCounts() };
    emit();
    await storageRemove([KEY, INSTALLED_AT_KEY]);
  });
  setUninstallUrl(state);
}

let started = false;
/**
 * Call once per page. Sends what is due, and in the app tab (`trackTime`)
 * counts whole minutes while the tab is visible.
 */
export function startUsageStats({ trackTime = false }: { trackTime?: boolean } = {}): void {
  if (started) return;
  started = true;
  void load().then(() => {
    setUninstallUrl(state);
    void flushUsageStats();
  });
  if (!trackTime) return;
  setInterval(() => {
    if (state.consent !== 'on' || document.visibilityState !== 'visible') return;
    void update((s) => (s.consent === 'on' ? { ...s, counts: { ...s.counts, um: Math.min(1440 * 7, s.counts.um + 1) } } : s)).then(() => flushUsageStats());
  }, 60_000);
}
