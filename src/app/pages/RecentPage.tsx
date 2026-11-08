import { useState } from 'react';
import { ArrowRight, History, Trash2 } from 'lucide-react';
import { clearHistory, removeHistoryEntry, useHistory } from '../../services/history-service/history';
import { updateSettings, useSettings } from '../../services/settings-service/settings';
import { getTool } from '../../features/registry';
import { accentStyle } from '../../features/categories';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/Feedback';
import { Switch } from '../../components/ui/Form';
import { formatBytes, formatDateTime, relativeTime } from '../../utils/format';
import { routeHref } from '../router';

export function RecentPage() {
  const history = useHistory();
  const settings = useSettings();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Recent files"
        description="Only file names, sizes and the tool used are remembered — never the documents themselves."
        icon={<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-fg-muted shadow-card"><History size={20} aria-hidden /></span>}
        actions={
          history.length > 0 ? (
            <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(true)}>
              Clear history
            </Button>
          ) : null
        }
      />
      <Card className="enter mt-7 p-4" style={{ ['--i' as string]: 1 }}>
        <Switch checked={settings.historyEnabled} onChange={(v) => void updateSettings({ historyEnabled: v })} label="Remember recent tasks" description="Stored only in this browser profile. Turn off to stop recording new tasks." />
      </Card>
      <Card className="enter mt-4 overflow-hidden" style={{ ['--i' as string]: 2 }}>
        {history.length === 0 ? (
          <EmptyState icon={History} title="No recent tasks" action={<a href="#/" className="text-sm font-medium text-primary hover:underline">Browse tools</a>}>
            Files you process will be listed here so you can quickly repeat a task.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line" aria-label="Recent tasks">
            {history.map((entry) => {
              const tool = getTool(entry.toolId);
              const Icon = tool?.icon ?? History;
              return (
                <li key={entry.id} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/50" style={tool ? accentStyle(tool.category) : undefined}>
                  <div className={tool ? 'tint-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl' : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-muted'}>
                    <Icon size={17} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {entry.toolName} <span className="font-normal text-fg-subtle" title={formatDateTime(entry.createdAt)}>· {relativeTime(entry.createdAt)}</span>
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {entry.inputs.map((f) => f.name).join(', ') || '—'}
                      {entry.outputs.length ? (
                        <>
                          {' '}
                          <ArrowRight size={11} className="inline" aria-label="produced" /> {entry.outputs.map((f) => `${f.name} (${formatBytes(f.size)})`).join(', ')}
                        </>
                      ) : null}
                    </p>
                  </div>
                  {tool ? (
                    <a href={routeHref({ name: 'tool', id: tool.id })} className="hidden rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft sm:block">
                      Open tool
                    </a>
                  ) : null}
                  <IconButton icon={Trash2} label="Remove from history" variant="danger-ghost" size="sm" onClick={() => void removeHistoryEntry(entry.id)} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={() => { void clearHistory(); setConfirm(false); }} title="Clear history?" message="This removes the list of recent tasks from this browser. Your files are not affected." confirmLabel="Clear history" tone="danger" />
    </div>
  );
}
