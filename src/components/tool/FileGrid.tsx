/** Sortable grid of selected files (used by Merge and Images to PDF). */
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle, ChevronLeft, ChevronRight, GripVertical, Lock, Trash2 } from 'lucide-react';
import type { FileEntry, FileListApi } from '../../hooks/useFileList';
import { formatBytes, pluralize } from '../../utils/format';
import { cn } from '../../utils/cn';
import { IconButton } from '../ui/Button';
import { Spinner } from '../ui/Feedback';
import { PageThumbnail } from './PageThumbnail';

function FileTile({ entry, index, count, files }: { entry: FileEntry; index: number; count: number; files: FileListApi }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative flex flex-col rounded-2xl border border-line bg-surface/90 p-2.5 shadow-card transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-raised', isDragging && 'z-10 scale-[1.02] opacity-80 shadow-pop')}
      data-testid="file-tile"
    >
      <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-surface-2/80 p-2.5">
        {entry.status === 'ready' && entry.kind === 'pdf' ? (
          <PageThumbnail docId={entry.id} pageIndex={0} width={150} className="max-h-full" />
        ) : entry.status === 'ready' && entry.previewUrl ? (
          <img src={entry.previewUrl} alt="" className="page-shadow max-h-full max-w-full object-contain" draggable={false} />
        ) : entry.status === 'checking' ? (
          <Spinner className="text-fg-subtle" />
        ) : entry.status === 'locked' ? (
          <Lock size={22} className="text-fg-subtle" aria-label="Password protected" />
        ) : (
          <AlertCircle size={22} className="text-danger" aria-label="Error" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur-sm">{index + 1}</span>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${entry.name}`}
          className="absolute right-1.5 top-1.5 cursor-grab rounded-md bg-surface/90 p-1 text-fg-muted shadow-sm active:cursor-grabbing"
        >
          <GripVertical size={14} aria-hidden />
        </button>
      </div>
      <div className="mt-2 min-w-0 px-0.5">
        <p className="truncate text-[13px] font-medium" title={entry.name}>
          {entry.name}
        </p>
        <p className={cn('truncate text-xs', entry.status === 'error' ? 'text-danger' : 'text-fg-muted')} title={entry.error}>
          {entry.status === 'error'
            ? entry.error
            : entry.status === 'locked'
              ? 'Password required'
              : [entry.pageCount !== undefined ? pluralize(entry.pageCount, 'page') : entry.width ? `${entry.width}×${entry.height}` : null, formatBytes(entry.size)].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex">
          <IconButton icon={ChevronLeft} label={`Move ${entry.name} earlier`} size="sm" disabled={index === 0} onClick={() => files.move(index, index - 1)} />
          <IconButton icon={ChevronRight} label={`Move ${entry.name} later`} size="sm" disabled={index === count - 1} onClick={() => files.move(index, index + 1)} />
        </div>
        <IconButton icon={Trash2} label={`Remove ${entry.name}`} size="sm" variant="danger-ghost" onClick={() => files.remove(entry.id)} />
      </div>
    </li>
  );
}

export function FileGrid({ files }: { files: FileListApi }) {
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = files.entries.map((e) => e.id);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    files.setOrder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Selected files">
          {files.entries.map((entry, i) => (
            <FileTile key={entry.id} entry={entry} index={i} count={files.entries.length} files={files} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
