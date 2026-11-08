import { ArrowUpRight, History, Search, Settings } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { getTool } from '../features/registry';
import { accentStyle } from '../features/categories';
import { useHistory } from '../services/history-service/history';
import { useApplyTheme } from '../hooks/useTheme';
import { relativeTime } from '../utils/format';
import { ThemeToggle } from '../app/shell/ThemeToggle';

const QUICK = ['merge', 'compress', 'ai-summary', 'split', 'images-to-pdf', 'pdf-to-images', 'edit', 'sign', 'protect'];

async function open(hash = '#/'): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      await chrome.runtime.sendMessage({ type: 'open-app', hash });
      window.close();
      return;
    }
  } catch {
    /* fall back below */
  }
  window.open(`/app.html${hash}`, '_blank');
}

export function Popup() {
  useApplyTheme();
  const history = useHistory().slice(0, 3);
  return (
    <div className="relative overflow-hidden bg-canvas">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-28 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,var(--blob-a),transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,var(--blob-b),transparent)]" />
      <div className="relative flex items-center justify-between px-4 pb-3 pt-4">
        <BrandMark />
        <button type="button" onClick={() => void open('#/settings')} className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Settings">
          <Settings size={17} />
        </button>
      </div>
      <div className="relative space-y-4 px-4 pb-4">
        <button type="button" onClick={() => void open('#/')} className="btn-primary flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-medium" data-testid="popup-open-app">
          <span className="relative">Open Unique PDF</span>
          <ArrowUpRight size={16} className="relative" />
        </button>
        <div>
          <h2 className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
            Quick tools
            <button type="button" className="inline-flex items-center gap-1 normal-case tracking-normal text-fg-subtle hover:text-fg" onClick={() => void open('#/')}>
              <Search size={11} aria-hidden /> All
            </button>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {QUICK.map((id) => {
              const tool = getTool(id);
              if (!tool) return null;
              const Icon = tool.icon;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => void open(`#/tool/${id}`)}
                  style={accentStyle(tool.category)}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-line bg-surface/80 px-1.5 py-3 text-center text-[11.5px] font-medium leading-tight shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised"
                >
                  <span className="tint-tile tint-fill flex h-8 w-8 items-center justify-center rounded-lg">
                    <Icon size={15} aria-hidden />
                  </span>
                  {tool.name}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <h2 className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
            Recent
            {history.length ? (
              <button type="button" className="normal-case tracking-normal text-primary hover:underline" onClick={() => void open('#/recent')}>
                View all
              </button>
            ) : null}
          </h2>
          {history.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-xs text-fg-muted">
              <History size={14} aria-hidden /> Recent tasks will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface/80">
              {history.map((h) => {
                const tool = getTool(h.toolId);
                const Icon = tool?.icon ?? History;
                return (
                  <li key={h.id}>
                    <button type="button" onClick={() => void open(tool ? `#/tool/${tool.id}` : '#/recent')} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2" style={tool ? accentStyle(tool.category) : undefined}>
                      <span className="tint-tile flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                        <Icon size={12} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">{h.outputs[0]?.name ?? h.inputs[0]?.name ?? h.toolName}</span>
                        <span className="block text-[11px] text-fg-subtle">{h.toolName} · {relativeTime(h.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="relative flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] text-fg-subtle">
          <span className="live-dot" aria-hidden /> Processed on your device
        </p>
        <ThemeToggle className="w-28" />
      </div>
    </div>
  );
}
