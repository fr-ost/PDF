import { Monitor, Moon, Sun } from 'lucide-react';
import { useSettings, type Settings } from '../../services/settings-service/settings';
import { setTheme } from '../theme';
import { cn } from '../../utils/cn';

const OPTIONS: { value: Settings['theme']; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
  { value: 'system', label: 'Match system theme', icon: Monitor },
];

/** Compact three-way theme switch with a sliding indicator. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme } = useSettings();
  const index = OPTIONS.findIndex((o) => o.value === theme);
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('relative grid grid-cols-3 rounded-xl border border-line bg-surface-2/70 p-0.5', className)}>
      <span
        aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 w-[calc((100%-4px)/3)] rounded-[10px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12)] ring-1 ring-line transition-transform duration-300 ease-[var(--ease-out-expo)] dark:bg-surface-3"
        style={{ transform: `translateX(${Math.max(0, index) * 100}%)` }}
      />
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={(e) => setTheme(value, { x: e.clientX, y: e.clientY })}
          className={cn('relative z-10 flex h-7 items-center justify-center rounded-[10px] transition-colors', theme === value ? 'text-fg' : 'text-fg-subtle hover:text-fg')}
        >
          <Icon size={14} strokeWidth={2.2} aria-hidden />
        </button>
      ))}
    </div>
  );
}
