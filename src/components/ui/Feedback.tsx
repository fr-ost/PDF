import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressBar({ value, label, className }: { value: number | null; label?: string; className?: string }) {
  const pct = value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={className}>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label={label ?? 'Progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(pct !== null ? { 'aria-valuenow': pct } : {})}
      >
        {pct === null ? (
          <div className="absolute inset-y-0 w-2/5 rounded-full bg-[image:var(--brand-gradient)]" style={{ animation: 'progress-indeterminate 1.3s var(--ease-out-expo) infinite' }} />
        ) : (
          <div className="relative h-full overflow-hidden rounded-full bg-[image:var(--brand-gradient)] transition-[width] duration-500 ease-[var(--ease-out-expo)]" style={{ width: `${Math.max(3, pct)}%` }}>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.45),transparent)] bg-[length:200%_100%]" style={{ animation: 'shimmer 1.8s linear infinite' }} />
          </div>
        )}
      </div>
    </div>
  );
}

type Tone = 'info' | 'success' | 'warning' | 'danger';
const TONES: Record<Tone, { icon: LucideIcon; box: string; icon_: string }> = {
  info: { icon: Info, box: 'bg-primary-soft/70 border-primary-line/70', icon_: 'text-primary' },
  success: { icon: CheckCircle2, box: 'bg-success-soft border-success-line', icon_: 'text-success' },
  warning: { icon: AlertTriangle, box: 'bg-warning-soft border-warning-line', icon_: 'text-warning' },
  danger: { icon: XCircle, box: 'bg-danger-soft border-danger-line', icon_: 'text-danger' },
};

export function Alert({ tone = 'info', title, children, action, className, icon, 'data-testid': testId }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; icon?: LucideIcon; 'data-testid'?: string }) {
  const Icon = icon ?? TONES[tone].icon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} data-testid={testId} className={cn('flex animate-fade-in gap-3 rounded-xl border px-3.5 py-3 text-sm text-fg', TONES[tone].box, className)}>
      <Icon size={17} className={cn('mt-px shrink-0', TONES[tone].icon_)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium leading-5">{title}</p> : null}
        {children ? <div className={cn('leading-5 text-fg-muted', title ? 'mt-0.5' : '')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
        tone === 'neutral' && 'bg-surface-2 text-fg-muted ring-1 ring-line',
        tone === 'primary' && 'bg-primary-soft text-primary',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'danger' && 'bg-danger-soft text-danger',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-[radial-gradient(closest-side,var(--blob-a),transparent)]" />
        <div className="flex h-14 w-14 animate-float items-center justify-center rounded-2xl border border-line bg-surface text-fg-muted shadow-raised">
          <Icon size={24} aria-hidden />
        </div>
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {children ? <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line border-b-2 bg-surface-2 px-1 font-mono text-[11px] text-fg-muted">{children}</kbd>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} aria-hidden />;
}
