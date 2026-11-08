import { useId, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

const control =
  'w-full rounded-xl border border-line-strong/80 bg-surface px-3 text-sm text-fg shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow,background] duration-200 placeholder:text-fg-subtle hover:border-line-strong focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 dark:bg-surface-2/60';

export function Field({ label, hint, error, children, htmlFor, className, inline }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string; inline?: boolean }) {
  return (
    <div className={cn(inline ? 'flex items-center justify-between gap-3' : 'space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="animate-fade-in text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] leading-snug text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(control, 'h-10', className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-20 py-2.5 leading-relaxed', className)} {...rest} />;
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
  // What the user is typing (may be empty or partial); the number is applied as it becomes valid.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className={cn('relative', className)}>
      <input
        type="number"
        inputMode="decimal"
        className={cn(control, 'h-10 tabular-nums', suffix && 'pr-11')}
        value={draft ?? (Number.isFinite(value) ? String(value) : '')}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v)) onChange(v);
        }}
        onBlur={(e) => {
          setDraft(null);
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
      <select className={cn(control, 'h-10 cursor-pointer appearance-none pr-9')} {...rest}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
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
        className={cn(
          'relative mt-0.5 inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-[background,box-shadow] duration-300 disabled:opacity-50',
          checked ? 'bg-[image:var(--brand-gradient)] shadow-[0_4px_12px_-4px_var(--glow)]' : 'bg-line-strong dark:bg-surface-3',
        )}
      >
        <span className={cn('inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-[var(--ease-spring)]', checked ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[6px] border border-line-strong bg-surface transition-all checked:border-transparent checked:bg-[image:var(--brand-gradient)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surface-2"
        />
        <Check size={13} strokeWidth={3} className="pointer-events-none absolute inset-0 m-auto scale-50 text-white opacity-0 transition-all duration-200 ease-[var(--ease-spring)] peer-checked:scale-100 peer-checked:opacity-100" aria-hidden />
      </span>
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

/** Radio group with a sliding selection indicator. */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: { value: T; onChange: (v: T) => void; options: SegmentOption<T>[]; label: string; size?: 'sm' | 'md'; className?: string }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const thumb: CSSProperties = { width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` };
  return (
    <div role="radiogroup" aria-label={label} className={cn('relative flex w-full rounded-xl border border-line bg-surface-2/80 p-0.5', className)}>
      <span aria-hidden className="absolute bottom-0.5 left-0.5 top-0.5 rounded-[10px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.1)] ring-1 ring-line transition-transform duration-300 ease-[var(--ease-out-expo)] dark:bg-surface-3" style={thumb} />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          title={opt.description}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(options[(index + 1) % options.length]!.value);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              onChange(options[(index - 1 + options.length) % options.length]!.value);
            }
          }}
          tabIndex={value === opt.value ? 0 : -1}
          className={cn(
            'relative z-10 min-w-0 flex-1 truncate whitespace-nowrap rounded-[10px] px-2 font-medium transition-colors duration-200',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
            value === opt.value ? 'text-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: LucideIcon;
}

/** Radio group rendered as a grid of cards (icon, label, one-line description). */
export function ChoiceCards<T extends string>({ value, onChange, options, label, columns = 2 }: { value: T; onChange: (v: T) => void; options: ChoiceOption<T>[]; label: string; columns?: 2 | 3 }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (to: number) => {
    const next = (to + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(index + 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(index - 1);
              }
            }}
            className={cn(
              'btn-press group relative flex min-w-0 flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-[border-color,background-color,box-shadow] duration-200',
              selected ? 'border-primary/45 bg-primary-soft shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_10%,transparent)]' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2/60 dark:bg-surface-2/40',
            )}
          >
            <span className="flex w-full items-center gap-2">
              {Icon ? (
                <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors duration-200', selected ? 'bg-[image:var(--brand-gradient)] text-white' : 'bg-surface-2 text-fg-muted group-hover:text-fg dark:bg-surface-3')}>
                  <Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={2.2} />
                </span>
              ) : null}
              <span className={cn('truncate text-[13px] font-medium', selected ? 'text-fg' : 'text-fg-muted group-hover:text-fg')}>{opt.label}</span>
            </span>
            {opt.description ? <span className="line-clamp-2 text-[11.5px] leading-snug text-fg-subtle">{opt.description}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({ value, onChange, min, max, step = 1, label, format, id }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; format?: (v: number) => string; id?: string }) {
  const autoId = useId();
  const sliderId = id ?? autoId;
  const fill = `${((value - min) / (max - min || 1)) * 100}%`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={sliderId} className="text-[13px] font-medium">
          {label}
        </label>
        <span className="rounded-md bg-surface-2 px-1.5 py-px text-[12px] tabular-nums text-fg-muted">{format ? format(value) : value}</span>
      </div>
      <input id={sliderId} type="range" className="range w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--fill' as string]: fill } as CSSProperties} />
    </div>
  );
}

export function ColorField({ value, onChange, label, swatches = ['#111827', '#3d5afe', '#e5383b', '#16a34a', '#f59e0b', '#8b5cf6', '#6b7280'] }: { value: string; onChange: (v: string) => void; label: string; swatches?: string[] }) {
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
            className={cn('h-6 w-6 rounded-full border border-black/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-transform duration-200 ease-[var(--ease-spring)] hover:scale-115', value.toLowerCase() === s.toLowerCase() && 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-surface')}
            style={{ backgroundColor: s }}
          />
        ))}
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded-lg border border-line bg-surface p-0.5" aria-label={`${label} (custom)`} />
      </div>
    </div>
  );
}
