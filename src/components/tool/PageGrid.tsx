/**
 * Thumbnail grid used by every page-level tool. Supports click/shift-click
 * selection, keyboard operation, drag-and-drop reordering (moving the whole
 * selection when a selected page is dragged), and per-page actions.
 */
import { memo, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
        {...attributes}
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
          'group relative flex select-none flex-col rounded-xl border p-2 outline-none transition-[border-color,box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-primary',
          selected ? 'border-primary bg-primary-soft shadow-raised' : 'border-transparent hover:border-line hover:bg-surface',
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
                'absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md border shadow-sm transition-colors',
                selected ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong bg-surface/90 text-transparent group-hover:text-fg-subtle',
              )}
              aria-hidden
            >
              <Check size={13} strokeWidth={3} />
            </span>
          ) : null}
          {page.badge ? <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2">{page.badge}</div> : null}
          {actions ? (
            <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {actions(page)}
            </div>
          ) : null}
        </div>
        <span className="mt-1.5 truncate text-center text-xs font-medium text-fg-muted">{page.label}</span>
      </div>
    </div>
  );
});

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
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );
  const keys = useMemo(() => pages.map((p) => p.key), [pages]);

  const handleSelect = (key: string, mode: SelectMode) => {
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
  };

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

  const activePage = activeKey ? pages.find((p) => p.key === activeKey) : undefined;
  const dragCount = activeKey && selected.has(activeKey) ? selected.size : 1;

  const grid = (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbWidth}px, 1fr))` }} data-testid="page-grid">
      {pages.map((page) => (
        <PageCard key={page.key} page={page} selected={selected.has(page.key)} sortable={sortable} selectable={selectable && !!onSelect} thumbWidth={thumbWidth} onSelect={handleSelect} actions={actions} />
      ))}
    </div>
  );

  if (!sortable) return grid;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveKey(null)}>
      <SortableContext items={keys} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
      <DragOverlay>
        {activePage ? (
          <div className="relative w-full rotate-2 rounded-xl border border-primary bg-surface p-2 shadow-pop" style={{ width: thumbWidth + 16 }}>
            <PageThumbnail docId={activePage.docId} pageIndex={activePage.pageIndex} rotation={activePage.rotation} width={thumbWidth} />
            {dragCount > 1 ? <span className="absolute -right-2 -top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg shadow">{dragCount}</span> : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
