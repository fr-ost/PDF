/**
 * Thumbnail grid used by every page-level tool. Supports click/shift-click
 * selection, keyboard operation, drag-and-drop reordering (moving the whole
 * selection when a selected page is dragged), and per-page actions.
 */
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn';
import { PageThumbnail, THUMB_WIDTH } from './PageThumbnail';

export interface GridPage {
  key: string;
  docId: string;
  pageIndex: number;
  rotation: number;
  label: string;
  /** Optional colour stripe identifying the source file. */
  color?: string;
  dimmed?: boolean;
  badge?: ReactNode;
  before?: ReactNode;
}

export type SelectMode = 'toggle' | 'range' | 'only';

export function moveKeys(keys: string[], moving: string[], overKey: string): string[] {
  if (moving.includes(overKey)) return keys;
  const movingSet = new Set(moving);
  const ordered = keys.filter((k) => movingSet.has(k));
  const rest = keys.filter((k) => !movingSet.has(k));
  const overIndexOriginal = keys.indexOf(overKey);
  const firstMovingIndex = keys.findIndex((k) => movingSet.has(k));
  let insertAt = rest.indexOf(overKey);
  if (overIndexOriginal > firstMovingIndex) insertAt += 1;
  rest.splice(insertAt, 0, ...ordered);
  return rest;
}

interface CardProps {
  page: GridPage;
  selected: boolean;
  sortable: boolean;
  selectable: boolean;
  thumbWidth: number;
  onSelect: (key: string, mode: SelectMode) => void;
  actions?: (page: GridPage) => ReactNode;
  dragBadge?: number;
}

/**
 * Cards re-render only when something they show changed. Grid pages are
 * rebuilt on every parent render (new objects, new badge elements), so they
 * are compared by value; badges change together with rotation/dimmed/label.
 */
function sameCard(a: CardProps, b: CardProps): boolean {
  const p = a.page;
  const q = b.page;
  return (
    a.selected === b.selected &&
    a.sortable === b.sortable &&
    a.selectable === b.selectable &&
    a.thumbWidth === b.thumbWidth &&
    a.onSelect === b.onSelect &&
    a.actions === b.actions &&
    p.key === q.key &&
    p.docId === q.docId &&
    p.pageIndex === q.pageIndex &&
    p.rotation === q.rotation &&
    p.label === q.label &&
    p.color === q.color &&
    !!p.dimmed === !!q.dimmed &&
    !!p.badge === !!q.badge &&
    !!p.before === !!q.before
  );
}

const PageCard = memo(function PageCard({ page, selected, sortable, selectable, thumbWidth, onSelect, actions }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.key, disabled: !sortable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handleClick = (e: MouseEvent) => {
    if (!selectable) return;
    onSelect(page.key, e.shiftKey ? 'range' : 'toggle');
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && selectable) {
      e.preventDefault();
      onSelect(page.key, e.shiftKey ? 'range' : 'toggle');
      return;
    }
    listeners?.onKeyDown?.(e);
  };
  return (
    <div className="lazy-section" style={{ containIntrinsicSize: `${thumbWidth}px ${Math.round(thumbWidth * 1.6)}px` }}>
      {page.before}
      <div
        ref={setNodeRef}
        style={style}
        {...(sortable ? attributes : {})}
        {...(sortable ? listeners : {})}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        role={selectable ? 'checkbox' : 'group'}
        aria-checked={selectable ? selected : undefined}
        aria-roledescription={sortable ? 'sortable page' : undefined}
        aria-label={page.label}
        tabIndex={0}
        data-testid="page-card"
        data-selected={selected || undefined}
        className={cn(
          'group relative flex select-none flex-col rounded-2xl border p-2 outline-none transition-[border-color,box-shadow,opacity,transform,background] duration-300 ease-[var(--ease-out-expo)] focus-visible:ring-2 focus-visible:ring-primary',
          selected ? 'border-primary/50 bg-primary-soft shadow-raised ring-1 ring-primary/25' : 'border-transparent hover:-translate-y-0.5 hover:border-line hover:bg-surface hover:shadow-card',
          isDragging && 'opacity-30',
          sortable ? 'cursor-grab active:cursor-grabbing' : selectable ? 'cursor-pointer' : '',
        )}
      >
        {page.color ? <span className="absolute left-2 right-2 top-0.5 h-0.5 rounded-full" style={{ backgroundColor: page.color }} aria-hidden /> : null}
        <div className={cn('relative transition-opacity', page.dimmed && 'opacity-35 grayscale')}>
          <PageThumbnail docId={page.docId} pageIndex={page.pageIndex} rotation={page.rotation} width={thumbWidth} />
          {selectable ? (
            <span
              className={cn(
                'absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md border shadow-sm transition-all duration-300 ease-[var(--ease-spring)]',
                selected ? 'scale-110 border-transparent bg-[image:var(--brand-gradient)] text-white' : 'border-line-strong bg-surface/90 text-transparent group-hover:text-fg-subtle',
              )}
              aria-hidden
            >
              <Check size={13} strokeWidth={3} />
            </span>
          ) : null}
          {page.badge ? <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2">{page.badge}</div> : null}
          {actions ? (
            <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-data-[selected]:opacity-100 [@media(hover:none)]:opacity-100" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {actions(page)}
            </div>
          ) : null}
        </div>
        <span className="mt-1.5 truncate text-center text-xs font-medium text-fg-muted">{page.label}</span>
      </div>
    </div>
  );
}, sameCard);

export function PageGrid({
  pages,
  selected,
  onSelect,
  onReorder,
  sortable = false,
  selectable = true,
  actions,
  thumbWidth = THUMB_WIDTH,
}: {
  pages: GridPage[];
  selected: Set<string>;
  onSelect?: (keys: Set<string>) => void;
  onReorder?: (keys: string[]) => void;
  sortable?: boolean;
  selectable?: boolean;
  actions?: (page: GridPage) => ReactNode;
  thumbWidth?: number;
}) {
  const [anchor, setAnchor] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sensors = useSensors(
    // Mouse drags start after a small move; touch drags after a long press, so swiping still scrolls.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );
  const keys = useMemo(() => pages.map((p) => p.key), [pages]);

  // Stable callbacks (read the latest props from a ref) so memoized cards don't all re-render.
  const latest = useRef({ selected, anchor, keys, onSelect, actions });
  useLayoutEffect(() => {
    latest.current = { selected, anchor, keys, onSelect, actions };
  });
  const handleSelect = useCallback((key: string, mode: SelectMode) => {
    const { selected, anchor, keys, onSelect } = latest.current;
    if (!onSelect) return;
    const next = new Set(mode === 'only' ? [] : selected);
    if (mode === 'range' && anchor && keys.includes(anchor)) {
      const [a, b] = [keys.indexOf(anchor), keys.indexOf(key)].sort((x, y) => x - y) as [number, number];
      for (let i = a; i <= b; i++) next.add(keys[i]!);
    } else if (next.has(key) && mode === 'toggle') {
      next.delete(key);
    } else {
      next.add(key);
    }
    setAnchor(key);
    onSelect(next);
  }, []);
  const hasActions = !!actions;
  const renderActions = useMemo(() => (hasActions ? (page: GridPage) => latest.current.actions?.(page) : undefined), [hasActions]);

  const onDragStart = (e: DragStartEvent) => setActiveKey(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveKey(null);
    if (!e.over || !onReorder) return;
    const active = String(e.active.id);
    const over = String(e.over.id);
    if (active === over) return;
    const moving = selected.has(active) && selected.size > 1 ? keys.filter((k) => selected.has(k)) : [active];
    onReorder(moveKeys(keys, moving, over));
  };

  const labelOf = (id: string | number | undefined) => pages.find((p) => p.key === String(id))?.label ?? 'page';
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up ${labelOf(active.id)}. Use the arrow keys to move it, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${labelOf(active.id)} is over position ${keys.indexOf(String(over.id)) + 1} of ${keys.length}.` : `${labelOf(active.id)} is no longer over a position.`,
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${labelOf(active.id)} was dropped at position ${keys.indexOf(String(over.id)) + 1} of ${keys.length}.` : `${labelOf(active.id)} was dropped.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) => `Moving ${labelOf(active.id)} was cancelled.`,
  };
  const activePage = activeKey ? pages.find((p) => p.key === activeKey) : undefined;
  const dragCount = activeKey && selected.has(activeKey) ? selected.size : 1;

  const grid = (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbWidth}px, 1fr))` }} data-testid="page-grid">
      {pages.map((page) => (
        <PageCard key={page.key} page={page} selected={selected.has(page.key)} sortable={sortable} selectable={selectable && !!onSelect} thumbWidth={thumbWidth} onSelect={handleSelect} actions={renderActions} />
      ))}
    </div>
  );

  if (!sortable) return grid;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveKey(null)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: 'To pick up a page, press Space. Use the arrow keys to move it and press Space again to drop it. Press Enter to select or deselect it.' } }}
    >
      <SortableContext items={keys} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
      {/* Portalled to <body> so ancestors with transforms or filters can't offset the fixed-position preview. */}
      {createPortal(
        <DragOverlay>
          {activePage ? (
            <div className="relative w-full rotate-3 scale-105 rounded-2xl border border-primary/60 bg-surface p-2 shadow-pop" style={{ width: thumbWidth + 16 }}>
              <PageThumbnail docId={activePage.docId} pageIndex={activePage.pageIndex} rotation={activePage.rotation} width={thumbWidth} />
              {dragCount > 1 ? <span className="absolute -right-2 -top-2 rounded-full bg-[image:var(--brand-gradient)] px-2 py-0.5 text-xs font-semibold text-white shadow-[0_6px_14px_-4px_var(--glow)]">{dragCount}</span> : null}
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
