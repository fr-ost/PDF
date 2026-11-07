/**
 * Common layout for every tool: header, file intake, workspace, options
 * panel with the primary action, progress, errors and results.
 */
import { useEffect, type ReactNode } from 'react';
import { ChevronRight, ShieldCheck, X } from 'lucide-react';
import { CATEGORY_INFO, type ToolDefinition } from '../../features/registry';
import { routeHref, setLeaveGuard } from '../../app/router';
import type { FileListApi } from '../../hooks/useFileList';
import type { TaskStatus } from '../../hooks/useTask';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Alert } from '../ui/Feedback';
import { Dropzone } from './Dropzone';
import { PasswordPrompt } from './PasswordPrompt';
import { ErrorPanel, TaskProgress } from './TaskPanels';

export interface TaskView {
  status: TaskStatus;
  progress: number | null;
  label?: string;
  error?: unknown;
  cancel: () => void;
  reset: () => void;
}

export interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: ReactNode;
  tone?: 'primary' | 'danger';
}

export function ToolHeader({ tool }: { tool: ToolDefinition }) {
  const Icon = tool.icon;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icon size={22} aria-hidden />
        </div>
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs font-medium text-fg-subtle">
            <a href={routeHref({ name: 'category', category: tool.category })} className="hover:text-fg">
              {CATEGORY_INFO[tool.category].title}
            </a>
            <ChevronRight size={12} aria-hidden />
            <span aria-current="page">{tool.name}</span>
          </nav>
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight">{tool.name}</h1>
          <p className="mt-0.5 text-sm text-fg-muted">{tool.description}</p>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
        <ShieldCheck size={14} className="text-success" aria-hidden /> Processed locally on this device
      </p>
    </header>
  );
}

export function ToolShell({
  tool,
  files,
  task,
  children,
  options,
  primary,
  result,
  emptyHint,
  onRetry,
  intake,
}: {
  tool: ToolDefinition;
  files: FileListApi;
  task: TaskView;
  children: ReactNode;
  options?: ReactNode;
  primary?: PrimaryAction;
  result?: ReactNode;
  emptyHint?: ReactNode;
  onRetry?: () => void;
  /** Replaces the default dropzone shown before any file is added. */
  intake?: ReactNode;
}) {
  const hasFiles = files.entries.length > 0;
  const showResult = task.status === 'success' && !!result;

  useEffect(() => {
    setLeaveGuard(hasFiles && !showResult ? 'Your selected files and changes in this tool will be discarded.' : null);
    return () => setLeaveGuard(null);
  }, [hasFiles, showResult]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <ToolHeader tool={tool} />
      {files.rejections.length > 0 ? (
        <Alert
          tone="warning"
          className="mt-5"
          title={files.rejections.length === 1 ? `“${files.rejections[0]!.name}” was not added` : `${files.rejections.length} files were not added`}
          action={<Button size="sm" variant="ghost" icon={X} onClick={files.dismissRejections} aria-label="Dismiss" />}
        >
          <ul className="space-y-0.5">
            {files.rejections.slice(0, 5).map((r, i) => (
              <li key={i}>
                {files.rejections.length > 1 ? <strong className="font-medium text-fg">{r.name}: </strong> : null}
                {r.reason}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {tool.id !== 'pdf-to-images' && files.entries.some((e) => e.signed) && !showResult ? (
        <Alert tone="warning" className="mt-5" title="This PDF is digitally signed" data-testid="signed-warning">
          Any change creates a new file, and the existing digital signatures will no longer be valid in it. Your signed original stays untouched.
        </Alert>
      ) : null}
      {files.entries.some((e) => e.large) && !showResult ? (
        <Alert tone="info" className="mt-5" title="Large file">
          Large documents can take a while and use a lot of memory. Keep this tab open until processing finishes.
        </Alert>
      ) : null}

      <div className="mt-6">
        {showResult ? (
          result
        ) : !hasFiles ? (
          (intake ?? <Dropzone accept={[tool.accepts]} multiple={tool.multiple} onFiles={(f) => void files.add(f)} hint={emptyHint} />)
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">{children}</div>
            <aside className="lg:sticky lg:top-6">
              <Card className="overflow-hidden">
                {options ? <div className="space-y-5 p-5">{options}</div> : null}
                <div className="space-y-3 border-t border-line bg-surface-2/50 p-5 first:border-t-0">
                  {task.status === 'error' ? <ErrorPanel error={task.error} onRetry={onRetry ?? primary?.onClick} onDismiss={task.reset} /> : null}
                  {task.status === 'running' ? (
                    <TaskProgress progress={task.progress} label={task.label} onCancel={task.cancel} />
                  ) : primary ? (
                    <>
                      <Button variant={primary.tone === 'danger' ? 'danger' : 'primary'} size="lg" className="w-full" onClick={primary.onClick} disabled={primary.disabled || files.busy} data-testid="primary-action">
                        {primary.label}
                      </Button>
                      {primary.hint ? <p className="text-center text-xs text-fg-subtle">{primary.hint}</p> : null}
                    </>
                  ) : null}
                </div>
              </Card>
            </aside>
          </div>
        )}
      </div>
      <PasswordPrompt files={files} />
    </div>
  );
}
