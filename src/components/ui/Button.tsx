import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Spinner } from './Feedback';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-press bg-surface text-fg border border-line-strong/80 shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:bg-surface-2 hover:border-line-strong dark:bg-surface-2 dark:hover:bg-surface-3',
  ghost: 'btn-press text-fg-muted hover:text-fg hover:bg-surface-2',
  subtle: 'btn-press bg-surface-2 text-fg hover:bg-surface-3',
  danger: 'btn-press text-white bg-[linear-gradient(135deg,#f0464a,#d6283c)] shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_6px_18px_-8px_rgb(229_56_59/0.6)] hover:brightness-110',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const iconSize = size === 'sm' ? 15 : 16;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'group/btn inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background,color,border-color,box-shadow,filter,transform] duration-200 disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : Icon ? <Icon size={iconSize} aria-hidden strokeWidth={2} className="relative" /> : null}
      {children !== undefined ? <span className="relative">{children}</span> : null}
      {IconRight && !loading ? <IconRight size={iconSize} aria-hidden strokeWidth={2} className="relative transition-transform duration-300 group-hover/btn:translate-x-0.5" /> : null}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'secondary' | 'danger-ghost' | 'solid';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'md', variant = 'ghost', active, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'btn-press inline-flex shrink-0 items-center justify-center rounded-lg transition-[background,color,box-shadow,transform] duration-200 disabled:cursor-not-allowed disabled:opacity-35',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
        variant === 'ghost' && 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        variant === 'secondary' && 'border border-line bg-surface text-fg-muted shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:bg-surface-2 hover:text-fg dark:bg-surface-2',
        variant === 'danger-ghost' && 'text-fg-muted hover:bg-danger-soft hover:text-danger',
        variant === 'solid' && 'bg-black/65 text-white backdrop-blur-sm hover:bg-black/80',
        active && 'bg-primary-soft text-primary shadow-[inset_0_0_0_1px_var(--color-primary-line)] hover:bg-primary-soft hover:text-primary',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 15 : 18} aria-hidden strokeWidth={2} />
    </button>
  );
});
