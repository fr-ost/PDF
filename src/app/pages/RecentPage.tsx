import { useState } from 'react';
import { ArrowRight, History, Trash2 } from 'lucide-react';
import { clearHistory, removeHistoryEntry, useHistory } from '../../services/history-service/history';
import { updateSettings, useSettings } from '../../services/settings-service/settings';
import { getTool } from '../../features/registry';
import { Card } from '../../components/ui/Card';
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
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recent files</h1>
          <p className="mt-1 text-sm text-fg-muted">Only file names, sizes and the tool used are remembered — never the documents themselves.</p>
        </div>
        {history.length > 0 ? (
          <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(true)}>
            Clear history
          </Button>
        ) : null}
      </div>
      <Card className="mt-6 p-4">
        <Switch checked={settings.historyEnabled} onChange={(v) => void updateSettings({ historyEnabled: v })} label="Remember recent tasks" description="Stored only in this browser profile. Turn off to stop recording new tasks." />
      </Card>
      <Card className="mt-4">
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
                <li key={entry.id} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
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
