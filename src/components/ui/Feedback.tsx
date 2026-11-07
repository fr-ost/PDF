import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressBar({ value, label, className }: { value: number | null; label?: string; className?: string }) {
  const pct = value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={className}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label={label ?? 'Progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(pct !== null ? { 'aria-valuenow': pct } : {})}
      >
        <div
          className={cn('h-full rounded-full bg-primary transition-[width] duration-300 ease-out', pct === null && 'w-1/3 animate-pulse')}
          style={pct !== null ? { width: `${Math.max(3, pct)}%` } : undefined}
        />
      </div>
    </div>
  );
}

type Tone = 'info' | 'success' | 'warning' | 'danger';
const TONES: Record<Tone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'bg-primary-soft border-primary-line text-fg [&_svg.alert-icon]:text-primary' },
  success: { icon: CheckCircle2, className: 'bg-success-soft border-success-line text-fg [&_svg.alert-icon]:text-success' },
  warning: { icon: AlertTriangle, className: 'bg-warning-soft border-warning-line text-fg [&_svg.alert-icon]:text-warning' },
  danger: { icon: XCircle, className: 'bg-danger-soft border-danger-line text-fg [&_svg.alert-icon]:text-danger' },
};

export function Alert({ tone = 'info', title, children, action, className, icon, 'data-testid': testId }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; icon?: LucideIcon; 'data-testid'?: string }) {
  const Icon = icon ?? TONES[tone].icon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} data-testid={testId} className={cn('flex gap-3 rounded-lg border px-3.5 py-3 text-sm', TONES[tone].className, className)}>
      <Icon size={18} className="alert-icon mt-px shrink-0" aria-hidden />
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
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4',
        tone === 'neutral' && 'bg-surface-2 text-fg-muted',
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
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-fg-subtle">
        <Icon size={22} aria-hidden />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {children ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[11px] text-fg-muted">{children}</kbd>;
}
