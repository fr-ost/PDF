import { ArrowUpRight, History, Settings, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/ui/Button';
import { getTool } from '../features/registry';
import { useHistory } from '../services/history-service/history';
import { useApplyTheme } from '../hooks/useTheme';
import { relativeTime } from '../utils/format';

const QUICK = ['merge', 'split', 'compress', 'images-to-pdf', 'pdf-to-images', 'edit', 'sign', 'protect'];

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
  const history = useHistory().slice(0, 4);
  return (
    <div className="bg-canvas">
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <BrandMark />
        <button type="button" onClick={() => void open('#/settings')} className="rounded-md p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Settings">
          <Settings size={17} />
        </button>
      </div>
      <div className="space-y-4 p-4">
        <Button variant="primary" size="lg" className="w-full" iconRight={ArrowUpRight} onClick={() => void open('#/')} data-testid="popup-open-app">
          Open Unique PDF
        </Button>
        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Quick tools</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK.map((id) => {
              const tool = getTool(id);
              if (!tool) return null;
              const Icon = tool.icon;
              return (
                <button key={id} type="button" onClick={() => void open(`#/tool/${id}`)} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:border-primary-line hover:bg-primary-soft">
                  <Icon size={15} className="shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{tool.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <h2 className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            Recent
            {history.length ? (
              <button type="button" className="normal-case tracking-normal text-primary hover:underline" onClick={() => void open('#/recent')}>
                View all
              </button>
            ) : null}
          </h2>
          {history.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-xs text-fg-muted">
              <History size={14} aria-hidden /> Recent tasks will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {history.map((h) => {
                const tool = getTool(h.toolId);
                const Icon = tool?.icon ?? History;
                return (
                  <li key={h.id}>
                    <button type="button" onClick={() => void open(tool ? `#/tool/${tool.id}` : '#/recent')} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2">
                      <Icon size={14} className="shrink-0 text-primary" aria-hidden />
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
      <p className="flex items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-[11px] text-fg-subtle">
        <ShieldCheck size={12} className="text-success" aria-hidden /> Files are processed on your device · By Unique Labs
      </p>
    </div>
  );
}
