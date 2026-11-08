import { CircleCheck, Cpu, HardDriveDownload } from 'lucide-react';
import { Skeleton } from '../../components/ui/Feedback';
import { cn } from '../../utils/cn';

export type AiState = 'checking' | 'no-api' | AiAvailability;

const FALLBACK = {
  summary: 'You can still get a Quick summary of the key sentences.',
  chat: 'You can still search the document: answers show the best-matching passages.',
} as const;

/** Requirements of Chrome's built-in AI, which Unique AI runs on. */
export function AiRequirements() {
  return (
    <details className="mt-2 text-xs text-fg-subtle">
      <summary className="cursor-pointer select-none font-medium text-fg-muted hover:text-fg">Requirements</summary>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
        <li>Desktop Chrome 138 or newer on Windows, macOS, Linux or a Chromebook Plus</li>
        <li>About 22 GB of free disk space for the AI model</li>
        <li>A graphics card with more than 4 GB of memory, or 16 GB of RAM and 4 CPU cores</li>
      </ul>
    </details>
  );
}

/** Status of Unique AI on this device, shared by the AI tools. */
export function AiStatusCard({ status, feature, className }: { status: AiState; feature: 'summary' | 'chat'; className?: string }) {
  if (status === 'checking') return <Skeleton className={cn('h-[72px] w-full rounded-xl', className)} />;
  const box = cn('rounded-xl border p-3.5 text-[13px] leading-snug', className);
  if (status === 'available')
    return (
      <div className={cn(box, 'border-success-line bg-success-soft')} data-testid="ai-status" data-status={status}>
        <p className="flex items-center gap-2 font-medium text-fg">
          <CircleCheck size={15} className="text-success" aria-hidden /> Unique AI is ready
        </p>
        <p className="mt-1 text-fg-muted">{feature === 'chat' ? 'Ask anything about your document.' : 'Summaries in seconds — your document stays private.'}</p>
      </div>
    );
  if (status === 'downloadable' || status === 'downloading')
    return (
      <div className={cn(box, 'border-primary-line bg-primary-soft/70')} data-testid="ai-status" data-status={status}>
        <p className="flex items-center gap-2 font-medium text-fg">
          <HardDriveDownload size={15} className="text-primary" aria-hidden /> One-time setup
        </p>
        <p className="mt-1 text-fg-muted">
          {status === 'downloading' ? 'Unique AI’s language model is downloading.' : `Unique AI downloads its language model the first time you ${feature === 'chat' ? 'ask a question' : 'summarize'} (several GB, handled by Chrome).`} After that it starts instantly.
        </p>
      </div>
    );
  return (
    <div className={cn(box, 'border-line bg-surface-2/70')} data-testid="ai-status" data-status={status}>
      <p className="flex items-center gap-2 font-medium text-fg">
        <Cpu size={15} className="text-fg-subtle" aria-hidden /> Unique AI isn’t available on this device
      </p>
      <p className="mt-1 text-fg-muted">
        {status === 'no-api' ? 'It needs Chrome 138 or newer on a computer.' : 'This device doesn’t meet the requirements yet.'} {FALLBACK[feature]}
      </p>
      <AiRequirements />
    </div>
  );
}
