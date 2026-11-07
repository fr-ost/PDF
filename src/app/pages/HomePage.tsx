import { useMemo, useState } from 'react';
import { BadgeCheck, CloudOff, Search, Sparkles, UserX } from 'lucide-react';
import { CATEGORY_INFO, TOOLS, toolsIn, type ToolDefinition } from '../../features/registry';
import { Dropzone } from '../../components/tool/Dropzone';
import { Dialog } from '../../components/ui/Dialog';
import { TextInput } from '../../components/ui/Form';
import { Alert } from '../../components/ui/Feedback';
import { detectKind } from '../../services/file-service/files';
import { handOffFiles, navigate, routeHref, type Category } from '../router';
import { pluralize } from '../../utils/format';
import { ToolCard } from './ToolCard';

const CATEGORIES: Category[] = ['organize', 'convert', 'edit', 'security'];

export function HomePage() {
  const [query, setQuery] = useState('');
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

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="grid items-center gap-8 lg:grid-cols-[1fr_440px]">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg-muted shadow-card">
            <Sparkles size={13} className="text-primary" aria-hidden /> Unique PDF by Unique Labs
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-[40px] sm:leading-[1.1]">Everything you need to work with PDFs.</h1>
          <p className="mt-3 max-w-xl text-base text-fg-muted text-pretty sm:text-lg">Powerful PDF tools. Completely free. Your files stay on your device.</p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-muted">
            <li className="flex items-center gap-2"><CloudOff size={16} className="text-primary" aria-hidden /> No uploads</li>
            <li className="flex items-center gap-2"><BadgeCheck size={16} className="text-primary" aria-hidden /> No watermarks or limits</li>
            <li className="flex items-center gap-2"><UserX size={16} className="text-primary" aria-hidden /> No account needed</li>
          </ul>
        </div>
        <Dropzone accept={['pdf', 'image']} multiple onFiles={(f) => void onFiles(f)} title="Drop PDFs or images here" hint="We’ll suggest the right tool. Nothing leaves your computer." />
      </section>
      {error ? <Alert tone="warning" className="mt-6" title="Unsupported files">{error}</Alert> : null}

      <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold tracking-tight">All tools</h2>
        <div className="relative sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <TextInput type="search" placeholder="Search tools…" aria-label="Search tools" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      {filtered ? (
        <div className="mt-5">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-muted">No tools match “{query}”.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filtered.map((t) => <ToolCard key={t.id} tool={t} showCategory />)}</div>
          )}
        </div>
      ) : (
        CATEGORIES.map((category) => (
          <section key={category} className="mt-8" aria-labelledby={`cat-${category}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h3 id={`cat-${category}`} className="text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">{CATEGORY_INFO[category].title}</h3>
                <p className="text-sm text-fg-muted">{CATEGORY_INFO[category].description}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{toolsIn(category).map((t) => <ToolCard key={t.id} tool={t} />)}</div>
          </section>
        ))
      )}

      <Dialog open={!!chooser} onClose={() => setChooser(null)} title={chooser?.title ?? ''} size="lg">
        <div className="grid gap-2 pb-2 sm:grid-cols-2">
          {chooser?.tools.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" onClick={() => openTool(t, chooser.files)} className="flex items-start gap-3 rounded-lg border border-line p-3 text-left transition-colors hover:border-primary-line hover:bg-primary-soft" data-testid={`choose-${t.id}`}>
                <Icon size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="block text-xs text-fg-muted">{t.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}
