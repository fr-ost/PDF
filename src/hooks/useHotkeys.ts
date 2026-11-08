import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Keyboard shortcuts. Keys look like "mod+z", "shift+mod+z", "delete", "v".
 * "mod" is Ctrl on Windows/Linux and Cmd on macOS. Shortcuts are ignored
 * while typing in form fields (except those using "mod").
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const mod = e.ctrlKey || e.metaKey;
      // Fields keep their own keys, including Ctrl/⌘+Z for text undo.
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      const combo = `${e.shiftKey ? 'shift+' : ''}${mod ? 'mod+' : ''}${e.altKey ? 'alt+' : ''}${key}`;
      const fn = ref.current[combo];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}
