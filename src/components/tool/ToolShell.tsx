/**
 * Common layout for every tool: header, file intake, workspace, options
 * panel with the primary action, progress, errors and results.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { CATEGORY_INFO, type ToolDefinition } from '../../features/registry';
import { accentStyle } from '../../features/categories';
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
    <header className="enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" style={accentStyle(tool.category)}>
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div aria-hidden className="absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,var(--c1),var(--c2))] opacity-45 blur-xl" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--c1),var(--c2))] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] ring-1 ring-white/15">
            <Icon size={22} aria-hidden />
          </div>
        </div>
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs font-medium text-fg-subtle">
            <a href={routeHref({ name: 'category', category: tool.category })} className="transition-colors hover:text-fg">
              {CATEGORY_INFO[tool.category].title}
            </a>
            <ChevronRight size={12} aria-hidden />
            <span aria-current="page">{tool.name}</span>
          </nav>
          <h1 className="display mt-0.5 text-[26px] leading-tight">{tool.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">{tool.description}</p>
        </div>
      </div>
      <p className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs font-medium text-fg-muted shadow-card sm:self-auto">
        <span className="live-dot" aria-hidden /> On-device · nothing uploaded
      </p>
    </header>
  );
}

/**
 * Keeps the options panel within the visible part of the viewport (from its
 * current top edge, or the sticky offset once scrolled) so the primary action
 * is never pushed below the fold; the options scroll inside the panel instead.
 */
function useFitToViewport(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = Math.max(24, el.getBoundingClientRect().top);
      el.style.setProperty('--panel-max', `${Math.round(Math.max(320, window.innerHeight - top - 24))}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    el.addEventListener('animationend', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      el.removeEventListener('animationend', schedule);
    };
  }, [ref, active]);
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
  const asideRef = useRef<HTMLElement>(null);
  useFitToViewport(asideRef, hasFiles && !showResult);

  useEffect(() => {
    setLeaveGuard(hasFiles && !showResult ? 'Your selected files and changes in this tool will be discarded.' : null);
    return () => setLeaveGuard(null);
  }, [hasFiles, showResult]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10" data-tool={tool.id}>
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
          <div className="enter" style={{ ['--i' as string]: 1 }}>{intake ?? <Dropzone accept={[tool.accepts]} multiple={tool.multiple} onFiles={(f) => void files.add(f)} hint={emptyHint} />}</div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_348px]">
            <div className="enter min-w-0" style={{ ['--i' as string]: 1 }}>{children}</div>
            <aside ref={asideRef} className="enter lg:sticky lg:top-6" style={{ ['--i' as string]: 2 }}>
              {/* On large screens the panel fits the viewport: options scroll inside it and the action stays visible. */}
              <Card className="flex flex-col overflow-hidden lg:max-h-[var(--panel-max,calc(100vh-3rem))]">
                {options ? <div className="scroll-fade min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">{options}</div> : null}
                <div className="shrink-0 space-y-3 border-t border-line bg-surface-2/40 p-5 first:border-t-0 dark:bg-surface-2/30">
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
