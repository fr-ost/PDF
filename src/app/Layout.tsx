import { useEffect, useState, type ReactNode } from 'react';
import { FileImage, History, House, Info, LayoutGrid, Menu, PenLine, Settings, ShieldCheck, X, type LucideIcon } from 'lucide-react';
import { cn } from '../utils/cn';
import { BrandMark } from '../components/BrandMark';
import { routeHref, useRoute, type Route } from './router';
import { getTool } from '../features/registry';

interface NavItem {
  label: string;
  icon: LucideIcon;
  route: Route;
  match: (r: Route) => boolean;
}

const NAV: NavItem[] = [
  { label: 'Home', icon: House, route: { name: 'home' }, match: (r) => r.name === 'home' },
  { label: 'Organize PDF', icon: LayoutGrid, route: { name: 'category', category: 'organize' }, match: (r) => inCategory(r, 'organize') },
  { label: 'Convert PDF', icon: FileImage, route: { name: 'category', category: 'convert' }, match: (r) => inCategory(r, 'convert') },
  { label: 'Edit PDF', icon: PenLine, route: { name: 'category', category: 'edit' }, match: (r) => inCategory(r, 'edit') },
  { label: 'Security', icon: ShieldCheck, route: { name: 'category', category: 'security' }, match: (r) => inCategory(r, 'security') },
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

function NavLink({ item, route, onNavigate }: { item: NavItem; route: Route; onNavigate: () => void }) {
  const active = item.match(route);
  const Icon = item.icon;
  return (
    <a
      href={routeHref(item.route)}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
        active ? 'bg-primary-soft text-primary' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <Icon size={17} aria-hidden strokeWidth={active ? 2.25 : 2} />
      {item.label}
    </a>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [route]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <a href="#/" className="flex h-16 shrink-0 items-center px-5" aria-label="Unique PDF home">
        <BrandMark />
      </a>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((item) => (
          <NavLink key={item.label} item={item} route={route} onNavigate={() => setOpen(false)} />
        ))}
        <div className="my-3 h-px bg-line" role="separator" />
        {NAV_SECONDARY.map((item) => (
          <NavLink key={item.label} item={item} route={route} onNavigate={() => setOpen(false)} />
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-line bg-surface-2/60 p-3.5">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
          <ShieldCheck size={14} className="text-success" aria-hidden /> Private by design
        </p>
        <p className="mt-1 text-[12px] leading-snug text-fg-muted">Your files are processed in this browser tab and never uploaded.</p>
        <a href="#/privacy" className="mt-1.5 inline-block text-[12px] font-medium text-primary hover:underline">
          How it works
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-pop-in border-r border-line bg-surface shadow-pop">
            <button type="button" className="absolute right-3 top-4 rounded-md p-1.5 text-fg-muted hover:bg-surface-2" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
          <button type="button" className="rounded-md p-1.5 text-fg-muted hover:bg-surface-2" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <a href="#/" aria-label="Unique PDF home">
            <BrandMark />
          </a>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-line px-6 py-4 text-xs text-fg-subtle">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span>
              Unique PDF <span aria-hidden>·</span> By Unique Labs <span aria-hidden>·</span> Useful technology. Accessible to everyone.
            </span>
            <span className="flex items-center gap-3">
              <a href="#/privacy" className="hover:text-fg">
                Privacy
              </a>
              <a href="#/about" className="hover:text-fg">
                About
              </a>
              <span>v{__APP_VERSION__}</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

