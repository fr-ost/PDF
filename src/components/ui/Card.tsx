import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function Section({ title, description, children, actions, className }: { title?: ReactNode; description?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      {title || actions ? (
        <div className="flex items-end justify-between gap-3">
          <div>
            {title ? <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Consistent header for top-level pages. */
export function PageHeader({ title, description, icon, actions }: { title: ReactNode; description?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="enter flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-4">
        {icon}
        <div>
          <h1 className="display text-[28px] leading-tight">{title}</h1>
          {description ? <p className="mt-1 text-[15px] text-fg-muted">{description}</p> : null}
        </div>
      </div>
      {actions}
    </div>
  );
}
