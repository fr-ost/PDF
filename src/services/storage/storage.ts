/**
 * Small key-value storage adapter.
 * Uses chrome.storage.local inside the extension (shared by the app tab and
 * popup, with change notifications) and falls back to localStorage when the
 * app runs in a normal page during development.
 */
type Listener = (value: unknown) => void;

const hasChromeStorage = (): boolean => typeof chrome !== 'undefined' && !!chrome.storage?.local;
const listeners = new Map<string, Set<Listener>>();
let chromeListenerAttached = false;

function attachChromeListener(): void {
  if (chromeListenerAttached || !hasChromeStorage()) return;
  chromeListenerAttached = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      listeners.get(key)?.forEach((fn) => fn(change.newValue));
    }
  });
}

export async function storageGet<T>(key: string): Promise<T | undefined> {
  try {
    if (hasChromeStorage()) {
      const result = await chrome.storage.local.get(key);
      return result[key] as T | undefined;
    }
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  globalThis.localStorage?.setItem(key, JSON.stringify(value));
  listeners.get(key)?.forEach((fn) => fn(value));
}

export async function storageRemove(keys: string[]): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(keys);
    return;
  }
  for (const key of keys) {
    globalThis.localStorage?.removeItem(key);
    listeners.get(key)?.forEach((fn) => fn(undefined));
  }
}

export function storageSubscribe(key: string, fn: Listener): () => void {
  attachChromeListener();
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) fn(e.newValue ? JSON.parse(e.newValue) : undefined);
  };
  if (!hasChromeStorage()) globalThis.addEventListener?.('storage', onStorage);
  return () => {
    set.delete(fn);
    if (!hasChromeStorage()) globalThis.removeEventListener?.('storage', onStorage);
  };
}
