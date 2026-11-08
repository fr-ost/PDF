import { memo, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import { PageThumbnail } from '../../components/tool/PageThumbnail';
import { pluralize } from '../../utils/format';
import { cn } from '../../utils/cn';

export interface PageFocus {
  page: number;
  /** Changes on every request, so the same page can be shown again. */
  nonce: number;
}

const RAIL_THUMB = 196;

/** Scrollable list of pages beside the chat; citations scroll to and flash a page. */
export const DocumentRail = memo(function DocumentRail({ docId, name, pageCount, words, focus, onSelect, className }: { docId: string; name: string; pageCount: number; words: number | null; focus: PageFocus | null; onSelect: (page: number) => void; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-rail-page="${focus.page}"]`);
    if (!list || !el) return;
    // Scroll the rail only (scrollIntoView would also move the page).
    const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - (list.clientHeight - el.clientHeight) / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.remove('page-flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('page-flash');
  }, [focus]);

  return (
    <aside className={cn('flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-line bg-surface/85 shadow-card dark:bg-surface/70', className)} aria-label="Document pages" data-testid="document-rail">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <FileText size={17} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold" title={name}>{name}</p>
          <p className="text-[12px] text-fg-muted">
            {pluralize(pageCount, 'page')}
            {words !== null ? ` · ${pluralize(words, 'word')}` : ''}
          </p>
        </div>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
        {Array.from({ length: pageCount }, (_, i) => {
          const page = i + 1;
          const active = focus?.page === page;
          return (
            <button
              key={page}
              type="button"
              data-rail-page={page}
              data-active={active || undefined}
              aria-label={`Page ${page}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(page)}
              className={cn('lazy-section group relative block w-full rounded-xl border p-2 text-left transition-[border-color,background-color] duration-200', active ? 'border-primary/50 bg-primary-soft' : 'border-transparent hover:border-line hover:bg-surface-2/60')}
              style={{ containIntrinsicSize: `${RAIL_THUMB}px ${Math.round(RAIL_THUMB * 1.45)}px` }}
            >
              <div className="overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line),0_6px_14px_-8px_rgb(0_0_0/0.25)]">
                <PageThumbnail docId={docId} pageIndex={i} width={RAIL_THUMB} />
              </div>
              <span className={cn('mt-1.5 block text-center text-[11px] font-medium tabular-nums', active ? 'text-primary' : 'text-fg-subtle')}>{page}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
});
