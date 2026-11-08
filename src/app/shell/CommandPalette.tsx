/**
 * ⌘K / Ctrl+K command palette: jump to any tool or page, or switch theme.
 * Built on <dialog> (focus trap, Escape) with combobox/listbox semantics.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CornerDownLeft, FileText, History, Home, Info, Moon, Search, Settings as SettingsIcon, ShieldCheck, Sun, type LucideIcon } from 'lucide-react';
import { CATEGORY_INFO, TOOLS } from '../../features/registry';
import { accentStyle } from '../../features/categories';
import { navigate, routeHref, type Route } from '../router';
import { setTheme } from '../theme';
import { cn } from '../../utils/cn';

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
export function openCommandPalette(): void {
  open = true;
  emit();
}
export function closeCommandPalette(): void {
  open = false;
  emit();
}
export function toggleCommandPalette(): void {
  open = !open;
  emit();
}
function usePaletteOpen(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => open,
  );
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

interface Item {
  id: string;
  group: 'Tools' | 'Pages' | 'Actions';
  title: string;
  subtitle: string;
  icon: LucideIcon;
  keywords: string;
  style?: React.CSSProperties;
  run: () => void;
}

const page = (id: string, title: string, subtitle: string, icon: LucideIcon, route: Route): Item => ({
  id,
  group: 'Pages',
  title,
  subtitle,
  icon,
  keywords: `${title} ${subtitle}`.toLowerCase(),
  run: () => navigate(routeHref(route)),
});

function buildItems(): Item[] {
  const tools: Item[] = TOOLS.map((t) => ({
    id: `tool-${t.id}`,
    group: 'Tools',
    title: t.name,
    subtitle: t.description,
    icon: t.icon,
    keywords: [t.name, t.description, CATEGORY_INFO[t.category].title, ...t.keywords].join(' ').toLowerCase(),
    style: accentStyle(t.category),
    run: () => navigate(routeHref({ name: 'tool', id: t.id })),
  }));
  return [
    ...tools,
    page('home', 'Home', 'All tools and quick start', Home, { name: 'home' }),
    page('recent', 'Recent files', 'Your recent tasks on this device', History, { name: 'recent' }),
    page('settings', 'Settings', 'Theme, defaults and local data', SettingsIcon, { name: 'settings' }),
    page('privacy', 'Privacy', 'How your files are handled', ShieldCheck, { name: 'privacy' }),
    page('about', 'About Unique PDF', 'Version, licences and shortcuts', Info, { name: 'about' }),
    { id: 'theme-dark', group: 'Actions', title: 'Switch to dark theme', subtitle: 'Easy on the eyes', icon: Moon, keywords: 'dark theme night mode appearance', run: () => setTheme('dark') },
    { id: 'theme-light', group: 'Actions', title: 'Switch to light theme', subtitle: 'Bright and crisp', icon: Sun, keywords: 'light theme day mode appearance', run: () => setTheme('light') },
  ];
}

function score(item: Item, q: string): number {
  if (!q) return 1;
  const title = item.title.toLowerCase();
  if (title.startsWith(q)) return 100 - title.length / 100;
  if (title.includes(q)) return 60;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.every((w) => item.keywords.includes(w))) return 30;
  return 0;
}

export function CommandPalette() {
  const isOpen = usePaletteOpen();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const items = useMemo(buildItems, []);
  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      items
        .map((item) => ({ item, s: score(item, q) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => (q ? b.s - a.s : 0))
        .map((r) => r.item)
        .slice(0, q ? 12 : items.length),
    [items, q],
  );

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (isOpen && !el.open) {
      setQuery('');
      setActive(0);
      el.showModal();
    }
    if (!isOpen && el.open) el.close();
  }, [isOpen]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    closeCommandPalette();
    item.run();
  };

  let lastGroup = '';
  const rows: ReactNode[] = [];
  results.forEach((item, index) => {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      rows.push(
        <li key={`g-${item.group}`} role="presentation" className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
          {item.group}
        </li>,
      );
    }
    const Icon = item.icon;
    const selected = index === active;
    rows.push(
      <li
        key={item.id}
        id={`cmd-${item.id}`}
        role="option"
        aria-selected={selected}
        data-index={index}
        onMouseMove={() => setActive(index)}
        onClick={() => choose(item)}
        className={cn('mx-1.5 flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors', selected ? 'bg-surface-3/70 dark:bg-surface-3' : '')}
        style={item.style}
      >
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.style ? 'tint-tile' : 'bg-surface-2 text-fg-muted ring-1 ring-line')}>
          <Icon size={16} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span className="block truncate text-xs text-fg-subtle">{item.subtitle}</span>
        </span>
        {selected ? <CornerDownLeft size={14} className="shrink-0 text-fg-subtle" aria-hidden /> : null}
      </li>,
    );
  });

  return (
    <dialog
      ref={dialogRef}
      aria-label="Command palette"
      onCancel={(e) => {
        e.preventDefault();
        closeCommandPalette();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) closeCommandPalette();
      }}
      className="m-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-pop open:animate-pop-in"
    >
      {isOpen ? (
        <div>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search size={18} className="shrink-0 text-fg-subtle" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(results.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  choose(results[active]);
                }
              }}
              role="combobox"
              aria-expanded
              aria-controls="command-results"
              aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
              aria-label="Search tools, pages and actions"
              placeholder="Search tools, pages and actions…"
              className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-fg-subtle"
              data-testid="command-input"
            />
            <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-subtle sm:block">Esc</kbd>
          </div>
          <ul ref={listRef} id="command-results" role="listbox" aria-label="Results" className="max-h-[min(60vh,440px)] overflow-y-auto pb-2">
            {results.length ? (
              rows
            ) : (
              <li className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-fg-muted">
                <FileText size={20} className="text-fg-subtle" aria-hidden />
                No results for “{query}”.
              </li>
            )}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-surface-2/60 px-4 py-2 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-3">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
            </span>
            <span>Unique PDF</span>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
