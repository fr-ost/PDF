import { useMemo, useState } from 'react';
import { ArrowRight, ArrowUp, BadgeCheck, CloudOff, MessagesSquare, Search, Sparkles, UserX, WifiOff } from 'lucide-react';
import { CATEGORY_INFO, TOOLS, getTool, toolsIn, type ToolDefinition } from '../../features/registry';
import { accentStyle } from '../../features/categories';
import { Dropzone } from '../../components/tool/Dropzone';
import { Dialog } from '../../components/ui/Dialog';
import { TextInput } from '../../components/ui/Form';
import { Alert, Kbd } from '../../components/ui/Feedback';
import { detectKind } from '../../services/file-service/files';
import { handOffFiles, navigate, routeHref, type Category } from '../router';
import { pluralize } from '../../utils/format';
import { cn } from '../../utils/cn';
import { ToolCard, trackSpotlight } from './ToolCard';
import { isMac, openCommandPalette } from '../shell/CommandPalette';
import { UniqueAiMark } from '../../features/ai-shared/UniqueAiMark';

const CATEGORIES: Category[] = ['organize', 'convert', 'edit', 'security', 'ai'];
type Filter = 'all' | Category;

/** Decorative preview of a Unique AI conversation (aria-hidden). */
function ChatPreview() {
  return (
    <div aria-hidden className="relative w-full max-w-sm shrink-0 space-y-2.5 rounded-2xl border border-line bg-surface/90 p-4 text-left shadow-raised dark:bg-surface-2/80 lg:w-[360px]">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2 text-[13px] text-fg dark:bg-surface-3">What are the payment terms?</div>
      <div className="flex gap-2.5">
        <UniqueAiMark size="xs" className="mt-0.5" />
        <p className="text-[13px] leading-relaxed text-fg/90">
          Invoices are due within <strong className="font-semibold">30 days</strong>
          <span className="mx-1 inline-flex h-[17px] items-center rounded-md bg-primary-soft px-1.5 align-middle text-[10.5px] font-semibold text-primary">p. 4</span>
          and late payments add 1.5% interest per month
          <span className="mx-1 inline-flex h-[17px] items-center rounded-md bg-primary-soft px-1.5 align-middle text-[10.5px] font-semibold text-primary">p. 5</span>
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] text-fg-subtle dark:bg-surface-2">
        Ask anything about this PDF…
        <span className="ml-auto grid h-6 w-6 place-items-center rounded-lg bg-[image:var(--brand-gradient)] text-white">
          <ArrowUp size={13} strokeWidth={2.6} />
        </span>
      </div>
    </div>
  );
}

function FeaturedAi() {
  const chat = getTool('ai-chat');
  const summary = getTool('ai-summary');
  if (!chat || !summary) return null;
  return (
    <section
      onPointerMove={trackSpotlight}
      style={{ ...accentStyle('ai'), ['--i' as string]: 4 }}
      data-testid="featured-ai"
      className="spotlight gradient-border enter group relative mt-12 flex flex-col gap-8 overflow-hidden rounded-3xl border border-line bg-surface/80 p-7 shadow-card sm:p-8 lg:flex-row lg:items-center dark:bg-surface/60"
    >
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--c2)_28%,transparent),transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--c1)_18%,transparent),transparent)]" />
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <UniqueAiMark size="md" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--c1)] dark:text-[color:color-mix(in_srgb,var(--c1)_65%,white)]">New · Unique AI</p>
        </div>
        <h2 className="mt-4 text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[30px]">
          Chat with any PDF. <span className="text-gradient">Get answers in seconds.</span>
        </h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-fg-muted">
          Ask questions in plain language and Unique AI answers with page references you can click — or turn a 100-page report into five key points. Built by Unique Labs.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={routeHref({ name: 'tool', id: chat.id })} onPointerEnter={chat.preload} className="btn-primary inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[15px] font-medium" data-testid="featured-ai-chat">
            <MessagesSquare size={17} aria-hidden /> Chat with a PDF
          </a>
          <a href={routeHref({ name: 'tool', id: summary.id })} onPointerEnter={summary.preload} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[15px] font-medium text-fg shadow-card transition-colors hover:bg-surface-2 dark:bg-surface-2">
            <Sparkles size={16} aria-hidden /> Summarize a PDF
          </a>
        </div>
      </div>
      <ChatPreview />
    </section>
  );
}

export function HomePage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [chooser, setChooser] = useState<{ files: File[]; tools: ToolDefinition[]; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return TOOLS.filter((t) => [t.name, t.description, ...t.keywords].some((s) => s.toLowerCase().includes(q)));
  }, [query]);

  const openTool = (tool: ToolDefinition, files: File[]) => {
    handOffFiles(files);
    setChooser(null);
    navigate(routeHref({ name: 'tool', id: tool.id }));
  };

  const onFiles = async (files: File[]) => {
    setError(null);
    const kinds = await Promise.all(files.map((f) => detectKind(f).catch(() => null)));
    const pdfs = files.filter((_, i) => kinds[i] === 'pdf');
    const images = files.filter((_, i) => kinds[i] === 'image');
    if (pdfs.length === 0 && images.length === 0) {
      setError('None of those files are PDFs or supported images (JPEG, PNG, WebP, GIF, BMP, AVIF).');
      return;
    }
    if (images.length > 0 && pdfs.length === 0) {
      openTool(TOOLS.find((t) => t.id === 'images-to-pdf')!, images);
      return;
    }
    if (pdfs.length > 1) {
      const ids = ['merge', 'organize'];
      setChooser({ files: pdfs, title: `What would you like to do with ${pluralize(pdfs.length, 'PDF')}?`, tools: ids.map((id) => TOOLS.find((t) => t.id === id)!) });
      return;
    }
    setChooser({ files: pdfs, title: `What would you like to do with “${pdfs[0]!.name}”?`, tools: TOOLS.filter((t) => t.accepts === 'pdf') });
  };

  const visibleCategories = filter === 'all' ? CATEGORIES : [filter];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-10 lg:pt-14">
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <a href={routeHref({ name: 'tool', id: 'ai-chat' })} className="enter group inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pl-1 pr-3 text-xs font-medium text-fg-muted shadow-card transition-colors hover:text-fg" style={{ ['--i' as string]: 0 }}>
            <span className="rounded-full bg-[image:var(--brand-gradient)] px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
            Unique AI — chat with any PDF
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
          </a>
          <h1 className="display enter mt-6 text-[40px] leading-[1.04] text-balance sm:text-[56px] lg:text-[64px]" style={{ ['--i' as string]: 1 }}>
            Everything you need to{' '}
            <br className="hidden sm:block" />
            work with <span className="text-gradient">PDFs.</span>
          </h1>
          <p className="enter mt-5 max-w-lg text-[17px] leading-relaxed text-fg-muted text-pretty" style={{ ['--i' as string]: 2 }}>
            Powerful PDF tools. Completely free. Your files stay on your device.
          </p>
          <div className="enter mt-7 flex flex-wrap items-center gap-3" style={{ ['--i' as string]: 3 }}>
            <a href="#all-tools" onClick={(e) => { e.preventDefault(); document.getElementById('all-tools')?.scrollIntoView({ behavior: 'smooth' }); }} className="btn-primary inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[15px] font-medium">
              Explore tools <ArrowRight size={16} className="relative" />
            </a>
            <button type="button" onClick={openCommandPalette} className="btn-press inline-flex h-11 items-center gap-2.5 rounded-xl border border-line-strong/80 bg-surface px-4 text-[14px] font-medium text-fg-muted shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:text-fg dark:bg-surface-2">
              <Search size={15} aria-hidden /> Find a tool <Kbd>{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
            </button>
          </div>
          <ul className="enter mt-9 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3 text-[13.5px] text-fg-muted" style={{ ['--i' as string]: 4 }}>
            {[
              [CloudOff, 'No uploads, ever'],
              [BadgeCheck, 'No watermarks or limits'],
              [UserX, 'No account needed'],
              [WifiOff, 'Works offline'],
            ].map(([Icon, label]) => {
              const I = Icon as typeof CloudOff;
              return (
                <li key={label as string} className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <I size={13} aria-hidden strokeWidth={2.4} />
                  </span>
                  {label as string}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="enter" style={{ ['--i' as string]: 2 }}>
          <Dropzone variant="hero" accept={['pdf', 'image']} multiple onFiles={(f) => void onFiles(f)} title="Drop PDFs or images here" hint="We’ll suggest the right tool. Nothing leaves your computer." />
        </div>
      </section>
      {error ? <Alert tone="warning" className="mt-6" title="Unsupported files">{error}</Alert> : null}

      <FeaturedAi />

      <div id="all-tools" className="mt-16 scroll-mt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="display text-[26px]">All tools</h2>
            <p className="mt-1 text-sm text-fg-muted">{TOOLS.length} tools, all running locally in your browser.</p>
          </div>
          <div className="relative lg:w-72">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <TextInput type="search" placeholder="Search tools…" aria-label="Search tools" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
          </div>
        </div>
        {!filtered ? (
          <div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by category">
            {(['all', ...CATEGORIES] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                style={f === 'all' ? undefined : accentStyle(f)}
                className={cn(
                  'btn-press inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-all duration-300',
                  filter === f ? 'border-transparent bg-fg text-canvas shadow-[0_6px_16px_-8px_rgb(0_0_0/0.5)]' : 'border-line bg-surface/70 text-fg-muted hover:border-line-strong hover:text-fg',
                )}
              >
                {f !== 'all' ? <span className="h-1.5 w-1.5 rounded-full bg-[linear-gradient(135deg,var(--c1),var(--c2))]" aria-hidden /> : null}
                {f === 'all' ? 'All' : CATEGORY_INFO[f].title}
              </button>
            ))}
          </div>
        ) : null}

        {filtered ? (
          <div className="mt-6">
            {filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-fg-muted">No tools match “{query}”.</p>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((t, i) => (
                  <ToolCard key={t.id} tool={t} showCategory index={i} />
                ))}
              </div>
            )}
          </div>
        ) : (
          visibleCategories.map((category) => (
            <section key={`${filter}-${category}`} className="mt-9" aria-labelledby={`cat-${category}`}>
              <div className="mb-3.5 flex items-baseline gap-3" style={accentStyle(category)}>
                <span className="h-2 w-2 translate-y-[-1px] rounded-full bg-[linear-gradient(135deg,var(--c1),var(--c2))]" aria-hidden />
                <h3 id={`cat-${category}`} className="text-[15px] font-semibold tracking-[-0.015em]">{CATEGORY_INFO[category].title}</h3>
                <p className="hidden text-sm text-fg-subtle sm:block">{CATEGORY_INFO[category].description}</p>
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {toolsIn(category).map((t, i) => (
                  <ToolCard key={t.id} tool={t} index={i} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <Dialog open={!!chooser} onClose={() => setChooser(null)} title={chooser?.title ?? ''} size="lg">
        <div className="grid gap-2 pb-2 sm:grid-cols-2">
          {chooser?.tools.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" onClick={() => openTool(t, chooser.files)} style={accentStyle(t.category)} className="group flex items-start gap-3 rounded-xl border border-line p-3 text-left transition-all duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-card" data-testid={`choose-${t.id}`}>
                <span className="tint-tile tint-fill flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon size={17} aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="block text-xs leading-relaxed text-fg-muted">{t.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}
