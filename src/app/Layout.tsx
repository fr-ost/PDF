import { useEffect, useState, type ReactNode } from 'react';
import { FileImage, History, House, Info, LayoutGrid, Menu, PenLine, Search, Settings, ShieldCheck, Sparkles, X, type LucideIcon } from 'lucide-react';
import { cn } from '../utils/cn';
import { BrandMark } from '../components/BrandMark';
import { routeHref, useRoute, type Category, type Route } from './router';
import { getTool } from '../features/registry';
import { accentStyle } from '../features/categories';
import { AmbientBackground } from './shell/AmbientBackground';
import { ThemeToggle } from './shell/ThemeToggle';
import { isMac, openCommandPalette } from './shell/CommandPalette';

interface NavItem {
  label: string;
  icon: LucideIcon;
  route: Route;
  match: (r: Route) => boolean;
  category?: Category;
}

const NAV: NavItem[] = [
  { label: 'Home', icon: House, route: { name: 'home' }, match: (r) => r.name === 'home' },
  { label: 'Organize PDF', icon: LayoutGrid, route: { name: 'category', category: 'organize' }, match: (r) => inCategory(r, 'organize'), category: 'organize' },
  { label: 'Convert PDF', icon: FileImage, route: { name: 'category', category: 'convert' }, match: (r) => inCategory(r, 'convert'), category: 'convert' },
  { label: 'Edit PDF', icon: PenLine, route: { name: 'category', category: 'edit' }, match: (r) => inCategory(r, 'edit'), category: 'edit' },
  { label: 'Security', icon: ShieldCheck, route: { name: 'category', category: 'security' }, match: (r) => inCategory(r, 'security'), category: 'security' },
  { label: 'AI tools', icon: Sparkles, route: { name: 'category', category: 'ai' }, match: (r) => inCategory(r, 'ai'), category: 'ai' },
];
const NAV_SECONDARY: NavItem[] = [
  { label: 'Recent files', icon: History, route: { name: 'recent' }, match: (r) => r.name === 'recent' },
  { label: 'Settings', icon: Settings, route: { name: 'settings' }, match: (r) => r.name === 'settings' },
  { label: 'About Unique PDF', icon: Info, route: { name: 'about' }, match: (r) => r.name === 'about' || r.name === 'privacy' },
];

function inCategory(r: Route, category: string): boolean {
  if (r.name === 'category') return r.category === category;
  if (r.name === 'tool') return getTool(r.id)?.category === category;
  return false;
}

function NavLink({ item, route, onNavigate, pill }: { item: NavItem; route: Route; onNavigate: () => void; pill: boolean }) {
  const active = item.match(route);
  const Icon = item.icon;
  return (
    <a
      href={routeHref(item.route)}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      style={item.category ? accentStyle(item.category) : undefined}
      className={cn(
        'group relative flex h-9 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors duration-200',
        active ? 'text-fg' : 'text-fg-muted hover:bg-surface-2/80 hover:text-fg',
      )}
    >
      {active ? (
        // Only the persistent sidebar's pill morphs between items (one element may own a view-transition name).
        <span aria-hidden className="absolute inset-0 rounded-xl bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_var(--color-line)] dark:bg-surface-2" style={pill ? { viewTransitionName: 'nav-pill' } : undefined} />
      ) : null}
      <span
        className={cn(
          'relative flex h-6 w-6 items-center justify-center rounded-lg transition-all duration-300',
          active && item.category ? 'tint-tile' : active ? 'text-primary' : 'text-fg-subtle group-hover:text-fg',
        )}
      >
        <Icon size={15} strokeWidth={active ? 2.3 : 2} aria-hidden />
      </span>
      <span className="relative">{item.label}</span>
      {item.category === 'ai' ? <span className="relative ml-auto rounded-full bg-[linear-gradient(135deg,var(--c1),var(--c2))] px-1.5 py-px text-[10px] font-semibold text-white">New</span> : null}
    </a>
  );
}

function SearchButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Open command palette"
      className={cn('group flex h-9 w-full items-center gap-2.5 rounded-xl border border-line bg-surface/70 px-3 text-left text-[13px] text-fg-subtle shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-colors hover:border-line-strong hover:text-fg-muted', className)}
    >
      <Search size={15} aria-hidden />
      <span className="flex-1">Search…</span>
      <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[10.5px] text-fg-subtle">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [route]);

  const sidebar = (inDrawer: boolean) => (
    <div className="flex h-full flex-col">
      <a href="#/" className="flex h-[68px] shrink-0 items-center px-5" aria-label="Unique PDF home">
        <BrandMark />
      </a>
      <div className="px-3 pb-2">
        <SearchButton />
      </div>
      <nav aria-label={inDrawer ? 'Main (menu)' : 'Main'} className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Tools</p>
        {NAV.map((item) => (
          <NavLink key={item.label} item={item} route={route} onNavigate={() => setOpen(false)} pill={!inDrawer} />
        ))}
        <p className="px-3 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Workspace</p>
        {NAV_SECONDARY.map((item) => (
          <NavLink key={item.label} item={item} route={route} onNavigate={() => setOpen(false)} pill={!inDrawer} />
        ))}
      </nav>
      <div className="space-y-3 p-3">
        <a href="#/privacy" className="group block rounded-2xl border border-line bg-surface/70 p-3.5 transition-colors hover:border-line-strong">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold">
            <span className="live-dot" aria-hidden /> Private by design
          </p>
          <p className="mt-1 text-[12px] leading-snug text-fg-muted">Files are processed in this tab and never uploaded.</p>
        </a>
        <ThemeToggle />
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-screen">
      <AmbientBackground still={route.name === 'tool'} />
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <aside className="sticky top-0 z-20 hidden h-screen w-[264px] shrink-0 border-r border-line lg:block" style={{ background: 'var(--sidebar-bg)' }}>
        {sidebar(false)}
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[284px] animate-pop-in border-r border-line bg-surface shadow-pop">
            <button type="button" className="absolute right-3 top-5 rounded-lg p-1.5 text-fg-muted hover:bg-surface-2" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X size={18} />
            </button>
            {sidebar(true)}
          </div>
        </div>
      ) : null}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line px-3 lg:hidden">
          <button type="button" className="rounded-lg p-2 text-fg-muted hover:bg-surface-2" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <a href="#/" aria-label="Unique PDF home" className="mr-auto">
            <BrandMark />
          </a>
          <button type="button" className="rounded-lg p-2 text-fg-muted hover:bg-surface-2" onClick={openCommandPalette} aria-label="Open search">
            <Search size={19} />
          </button>
        </header>
        <main id="main" className="flex-1" style={{ viewTransitionName: 'main-content' }}>
          {children}
        </main>
        <footer className="px-6 py-6 text-xs text-fg-subtle">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 border-t border-line pt-5">
            <span>
              Unique PDF <span aria-hidden>·</span> By Unique Labs <span aria-hidden>·</span> Useful technology. Accessible to everyone.
            </span>
            <span className="flex items-center gap-4">
              <a href="#/privacy" className="hover:text-fg">Privacy</a>
              <a href="#/about" className="hover:text-fg">About</a>
              <span className="rounded-md border border-line px-1.5 py-px font-mono">v{__APP_VERSION__}</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
