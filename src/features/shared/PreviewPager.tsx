import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../../components/ui/Button';

export function PreviewPager({ index, count, onChange }: { index: number; count: number; onChange: (i: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <IconButton icon={ChevronLeft} label="Previous page" size="sm" variant="secondary" disabled={index <= 0} onClick={() => onChange(index - 1)} />
      <span className="min-w-24 text-center text-xs font-medium tabular-nums text-fg-muted">
        Page {index + 1} of {count}
      </span>
      <IconButton icon={ChevronRight} label="Next page" size="sm" variant="secondary" disabled={index >= count - 1} onClick={() => onChange(index + 1)} />
    </div>
  );
}

export function PositionGrid<T extends string>({ value, onChange, positions, label }: { value: T; onChange: (v: T) => void; positions: T[][]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-grid gap-1 rounded-lg border border-line bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${positions[0]?.length ?? 3}, 2rem)` }}>
      {positions.flat().map((pos) => (
        <button
          key={pos}
          type="button"
          role="radio"
          aria-checked={value === pos}
          aria-label={pos.replace('-', ' ')}
          title={pos.replace('-', ' ')}
          onClick={() => onChange(pos)}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${value === pos ? 'bg-primary' : 'bg-surface hover:bg-surface-3'}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${value === pos ? 'bg-primary-fg' : 'bg-fg-subtle'}`} />
        </button>
      ))}
    </div>
  );
}
