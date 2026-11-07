/** User preferences, persisted locally. No settings ever leave the device. */
import { useSyncExternalStore } from 'react';
import { storageGet, storageRemove, storageSet, storageSubscribe } from '../storage/storage';
import type { CompressionLevel } from '../../pdf/compressionPresets';
import type { PaperSize } from '../../pdf/paper';

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  imageFormat: 'png' | 'jpeg';
  imageDpi: number;
  jpegQuality: number;
  pageSize: PaperSize;
  compressionLevel: CompressionLevel;
  historyEnabled: boolean;
  askWhereToSave: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  imageFormat: 'png',
  imageDpi: 150,
  jpegQuality: 0.9,
  pageSize: 'a4',
  compressionLevel: 'balanced',
  historyEnabled: true,
  askWhereToSave: false,
};

const KEY = 'settings';
let current: Settings = { ...DEFAULT_SETTINGS };
let loaded = false;
const subscribers = new Set<() => void>();

function sanitize(value: unknown): Settings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Settings>;
  const pick = <K extends keyof Settings>(key: K, valid: (x: unknown) => boolean): Settings[K] => (valid(v[key]) ? (v[key] as Settings[K]) : DEFAULT_SETTINGS[key]);
  return {
    theme: pick('theme', (x) => x === 'system' || x === 'light' || x === 'dark'),
    imageFormat: pick('imageFormat', (x) => x === 'png' || x === 'jpeg'),
    imageDpi: pick('imageDpi', (x) => typeof x === 'number' && x >= 36 && x <= 600),
    jpegQuality: pick('jpegQuality', (x) => typeof x === 'number' && x >= 0.3 && x <= 1),
    pageSize: pick('pageSize', (x) => ['a3', 'a4', 'a5', 'letter', 'legal'].includes(String(x))),
    compressionLevel: pick('compressionLevel', (x) => x === 'low' || x === 'balanced' || x === 'high'),
    historyEnabled: pick('historyEnabled', (x) => typeof x === 'boolean'),
    askWhereToSave: pick('askWhereToSave', (x) => typeof x === 'boolean'),
  };
}

function emit(): void {
  subscribers.forEach((fn) => fn());
}

export async function loadSettings(): Promise<Settings> {
  current = sanitize(await storageGet<Settings>(KEY));
  loaded = true;
  emit();
  return current;
}

export function getSettings(): Settings {
  return current;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  current = sanitize({ ...current, ...patch });
  emit();
  await storageSet(KEY, current);
}

export async function resetSettings(): Promise<void> {
  current = { ...DEFAULT_SETTINGS };
  emit();
  await storageRemove([KEY]);
}

storageSubscribe(KEY, (value) => {
  current = sanitize(value);
  emit();
});

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  if (!loaded) void loadSettings();
  return () => subscribers.delete(fn);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
