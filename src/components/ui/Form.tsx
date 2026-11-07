import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

const control =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg shadow-sm transition-colors placeholder:text-fg-subtle hover:border-fg-subtle/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20';

export function Field({ label, hint, error, children, htmlFor, className, inline }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string; inline?: boolean }) {
  return (
    <div className={cn(inline ? 'flex items-center justify-between gap-3' : 'space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] leading-snug text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(control, 'h-9', className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-20 py-2 leading-relaxed', className)} {...rest} />;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <div className={cn('relative', className)}>
      <input
        type="number"
        inputMode="decimal"
        className={cn(control, 'h-9 tabular-nums', suffix && 'pr-10')}
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v)) onChange(v);
        }}
        onBlur={(e) => {
          let v = e.target.valueAsNumber;
          if (!Number.isFinite(v)) v = min ?? 0;
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          onChange(v);
        }}
        {...rest}
      />
      {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg-subtle">{suffix}</span> : null}
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(control, 'h-9 cursor-pointer appearance-none pr-9')} {...rest}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string }) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={switchId} className={cn('min-w-0 cursor-pointer', disabled && 'cursor-not-allowed opacity-60')}>
        <span className="block text-[13.5px] font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-muted">{description}</span> : null}
      </label>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-primary' : 'bg-line-strong')}
      >
        <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong accent-[var(--color-primary)]" />
      <label htmlFor={id} className="cursor-pointer text-[13.5px] leading-5">
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-[12.5px] leading-snug text-fg-muted">{description}</span> : null}
      </label>
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: string;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: { value: T; onChange: (v: T) => void; options: SegmentOption<T>[]; label: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex w-full rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          title={opt.description}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => {
            const idx = options.findIndex((o) => o.value === value);
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(options[(idx + 1) % options.length]!.value);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              onChange(options[(idx - 1 + options.length) % options.length]!.value);
            }
          }}
          tabIndex={value === opt.value ? 0 : -1}
          className={cn(
            'flex-1 whitespace-nowrap rounded-md px-2.5 font-medium transition-all',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
            value === opt.value ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ value, onChange, min, max, step = 1, label, format, id }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; format?: (v: number) => string; id?: string }) {
  const autoId = useId();
  const sliderId = id ?? autoId;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={sliderId} className="text-[13px] font-medium">
          {label}
        </label>
        <span className="text-[12.5px] tabular-nums text-fg-muted">{format ? format(value) : value}</span>
      </div>
      <input id={sliderId} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full cursor-pointer" />
    </div>
  );
}

export function ColorField({ value, onChange, label, swatches = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#6b7280'] }: { value: string; onChange: (v: string) => void; label: string; swatches?: string[] }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {swatches.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`Colour ${s}`}
            aria-pressed={value.toLowerCase() === s.toLowerCase()}
            onClick={() => onChange(s)}
            className={cn('h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110', value.toLowerCase() === s.toLowerCase() && 'ring-2 ring-primary ring-offset-2 ring-offset-surface')}
            style={{ backgroundColor: s }}
          />
        ))}
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line bg-surface p-0.5" aria-label={`${label} (custom)`} />
      </div>
    </div>
  );
}
