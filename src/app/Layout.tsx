import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileImage, Heart, History, House, Info, LayoutGrid, Menu, PenLine, Search, Settings, ShieldCheck, Sparkles, X, type LucideIcon } from 'lucide-react';
import { cn } from '../utils/cn';
import { BrandMark } from '../components/BrandMark';
import { routeHref, useRoute, type Category, type Route } from './router';
import { getTool } from '../features/registry';
import { accentStyle } from '../features/categories';
import { AmbientBackground } from './shell/AmbientBackground';
import { ThemeToggle } from './shell/ThemeToggle';
import { isMac, openCommandPalette } from './shell/CommandPalette';
import { FiveStars } from './shell/ReviewPrompt';
import { storeListing } from '../services/support/support';
import { answerFinal } from '../services/support/reviewPrompt';

interface NavItem {
  label: string;
  icon: LucideIcon;
  route: Route;
  match: (r: Route) => boolean;
  category?: Category;
  /** Rose heart icon (Donate). */
  heart?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Home', icon: House, route: { name: 'home' }, match: (r) => r.name === 'home' },
  { label: 'Organize PDF', icon: LayoutGrid, route: { name: 'category', category: 'organize' }, match: (r) => inCategory(r, 'organize'), category: 'organize' },
  { label: 'Convert PDF', icon: FileImage, route: { name: 'category', category: 'convert' }, match: (r) => inCategory(r, 'convert'), category: 'convert' },
  { label: 'Edit PDF', icon: PenLine, route: { name: 'category', category: 'edit' }, match: (r) => inCategory(r, 'edit'), category: 'edit' },
  { label: 'Security', icon: ShieldCheck, route: { name: 'category', category: 'security' }, match: (r) => inCategory(r, 'security'), category: 'security' },
  { label: 'Unique AI', icon: Sparkles, route: { name: 'category', category: 'ai' }, match: (r) => inCategory(r, 'ai'), category: 'ai' },
];
const NAV_SECONDARY: NavItem[] = [
  { label: 'Recent files', icon: History, route: { name: 'recent' }, match: (r) => r.name === 'recent' },
  { label: 'Settings', icon: Settings, route: { name: 'settings' }, match: (r) => r.name === 'settings' },
  { label: 'About Unique PDF', icon: Info, route: { name: 'about' }, match: (r) => r.name === 'about' || r.name === 'privacy' },
  { label: 'Donate', icon: Heart, route: { name: 'donate' }, match: (r) => r.name === 'donate', heart: true },
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
          active && item.category ? 'tint-tile' : item.heart ? 'text-rose-500' : active ? 'text-primary' : 'text-fg-subtle group-hover:text-fg',
        )}
      >
        <Icon size={15} strokeWidth={active ? 2.3 : 2} fill={item.heart ? 'currentColor' : 'none'} aria-hidden />
      </span>
      <span className="relative">{item.label}</span>
      {item.category === 'ai' ? <span className="relative ml-auto rounded-full bg-[image:var(--btn-gradient)] px-1.5 py-px text-[10px] font-semibold text-white">New</span> : null}
    </a>
  );
}

function SearchButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
      className={cn('group flex h-9 w-full items-center gap-2.5 rounded-xl border border-line bg-surface/70 px-3 text-left text-[13px] text-fg-subtle shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-colors hover:border-line-strong hover:text-fg-muted', className)}
    >
      <Search size={15} aria-hidden />
      <span className="flex-1">Search tools…</span>
      <kbd aria-hidden className="rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[10.5px] text-fg-subtle">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const [listing] = useState(storeListing);
  const drawerRef = useRef<HTMLDialogElement>(null);
  useEffect(() => setOpen(false), [route]);
  // The drawer is hidden on wide screens; a modal dialog that is merely hidden would keep the page inert.
  useEffect(() => {
    const wide = matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    if (open && !drawer.open) drawer.showModal();
    if (!open && drawer.open) drawer.close();
  }, [open]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [route]);

  const sidebar = (inDrawer: boolean) => (
    <div className="flex h-full flex-col">
      <a href="#/" className="flex h-[68px] shrink-0 items-center px-5">
        <BrandMark />
        <span className="sr-only">, home</span>
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
        {listing ? (
          <a
            href={listing.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void answerFinal()}
            className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-[12.5px] font-medium text-fg-muted transition-colors hover:bg-surface-2/80 hover:text-fg"
            data-testid="sidebar-rate"
          >
            Rate Unique PDF
            <FiveStars size={12} />
          </a>
        ) : null}
        <ThemeToggle />
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-screen">
      <AmbientBackground still={route.name === 'tool'} />
      <a
        href="#main"
        onClick={(e) => {
          // Not a route: move focus to the content without touching the URL.
          e.preventDefault();
          const main = document.getElementById('main');
          main?.focus({ preventScroll: true });
          main?.scrollIntoView({ block: 'start' });
        }}
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <aside aria-label="Sidebar" className="sticky top-0 z-20 hidden h-screen w-[264px] shrink-0 border-r border-line lg:block" style={{ background: 'var(--sidebar-bg)' }}>
        {sidebar(false)}
      </aside>
      {/* Native modal dialog: focus moves in and is contained, Escape closes, focus returns to the menu button. */}
      <dialog
        ref={drawerRef}
        aria-label="Navigation"
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === drawerRef.current) setOpen(false);
        }}
        className="m-0 h-dvh max-h-none w-[284px] max-w-[86vw] overflow-hidden border-r border-line bg-surface p-0 text-fg shadow-pop open:animate-pop-in lg:hidden"
      >
        {open ? (
          <div className="relative h-full">
            <button type="button" className="absolute right-3 top-5 z-10 rounded-lg p-1.5 text-fg-muted hover:bg-surface-2" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X size={18} />
            </button>
            {sidebar(true)}
          </div>
        ) : null}
      </dialog>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line px-3 lg:hidden">
          <button type="button" className="rounded-lg p-2 text-fg-muted hover:bg-surface-2" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <a href="#/" className="mr-auto">
            <BrandMark />
            <span className="sr-only">, home</span>
          </a>
          <button type="button" className="rounded-lg p-2 text-fg-muted hover:bg-surface-2" onClick={openCommandPalette} aria-label="Open search">
            <Search size={19} />
          </button>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 outline-none" style={{ viewTransitionName: 'main-content' }}>
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
              <a href="#/donate" className="hover:text-fg">Donate</a>
              <span className="rounded-md border border-line px-1.5 py-px font-mono">v{__APP_VERSION__}</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
