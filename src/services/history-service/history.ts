/**
 * Local recent-task history. Only file names, sizes and the tool used are
 * recorded — never document contents — and it can be disabled or cleared at
 * any time in Settings.
 */
import { useSyncExternalStore } from 'react';
import { storageGet, storageRemove, storageSet, storageSubscribe } from '../storage/storage';
import { getSettings } from '../settings-service/settings';

export interface HistoryFile {
  name: string;
  size: number;
}

export interface HistoryEntry {
  id: string;
  toolId: string;
  toolName: string;
  createdAt: number;
  inputs: HistoryFile[];
  outputs: HistoryFile[];
}

const KEY = 'history';
const MAX_ENTRIES = 50;
let entries: HistoryEntry[] = [];
let loaded = false;
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((fn) => fn());

function sanitize(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is HistoryEntry => !!e && typeof e === 'object' && typeof (e as HistoryEntry).id === 'string' && typeof (e as HistoryEntry).toolId === 'string')
    .slice(0, MAX_ENTRIES);
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  entries = sanitize(await storageGet(KEY));
  loaded = true;
  emit();
  return entries;
}

export async function addHistoryEntry(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<void> {
  if (!getSettings().historyEnabled) return;
  if (!loaded) await loadHistory();
  const full: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    inputs: entry.inputs.slice(0, 50).map((f) => ({ name: f.name.slice(0, 200), size: f.size })),
    outputs: entry.outputs.slice(0, 50).map((f) => ({ name: f.name.slice(0, 200), size: f.size })),
  };
  entries = [full, ...entries].slice(0, MAX_ENTRIES);
  emit();
  await storageSet(KEY, entries);
}

export async function removeHistoryEntry(id: string): Promise<void> {
  entries = entries.filter((e) => e.id !== id);
  emit();
  await storageSet(KEY, entries);
}

export async function clearHistory(): Promise<void> {
  entries = [];
  emit();
  await storageRemove([KEY]);
}

storageSubscribe(KEY, (value) => {
  entries = sanitize(value);
  emit();
});

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  if (!loaded) void loadHistory();
  return () => subscribers.delete(fn);
}
const snapshot = () => entries;

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
