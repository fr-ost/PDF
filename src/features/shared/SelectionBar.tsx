import type { ReactNode } from 'react';
import { parsePageRanges } from '../../pdf/pageRanges';
import { Button } from '../../components/ui/Button';
import { pluralize } from '../../utils/format';

/** Selection helpers above page grids: all / none / invert / odd / even. */
export function SelectionBar({ keys, selected, onChange, children, noun = 'page' }: { keys: string[]; selected: Set<string>; onChange: (s: Set<string>) => void; children?: ReactNode; noun?: string }) {
  const pick = (expr: string) => {
    const r = parsePageRanges(expr, keys.length);
    if (r.ok) onChange(new Set(r.pages.map((i) => keys[i]!)));
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-2xl border border-line bg-surface/90 px-2 py-1.5 shadow-card" role="toolbar" aria-label="Selection">
      <span className="px-2 text-[13px] font-medium tabular-nums" aria-live="polite">
        {selected.size > 0 ? `${pluralize(selected.size, noun)} selected` : `${pluralize(keys.length, noun)}`}
      </span>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <Button size="sm" variant="ghost" onClick={() => onChange(new Set(keys))}>All</Button>
      <Button size="sm" variant="ghost" disabled={selected.size === 0} onClick={() => onChange(new Set())}>None</Button>
      <Button size="sm" variant="ghost" onClick={() => onChange(new Set(keys.filter((k) => !selected.has(k))))}>Invert</Button>
      <Button size="sm" variant="ghost" onClick={() => pick('odd')}>Odd</Button>
      <Button size="sm" variant="ghost" disabled={keys.length < 2} onClick={() => pick('even')}>Even</Button>
      {children ? (
        <>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <div className="flex flex-wrap items-center gap-1">{children}</div>
        </>
      ) : null}
    </div>
  );
}
