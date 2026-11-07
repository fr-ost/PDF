/**
 * Page-level workspace state shared by Rotate, Reorder, Delete, Extract and
 * Organize: an ordered list of page references (file + page index + extra
 * rotation) plus a selection. Nothing here touches PDF bytes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FileEntry } from '../../hooks/useFileList';
import type { PagePlanItem } from '../../pdf/engines/assemble';
import { normalizeQuarter } from './rotation';

export interface WorkspacePage {
  key: string;
  fileId: string;
  pageIndex: number;
  /** Clockwise rotation added on top of the page's own rotation. */
  rotation: number;
}

function pagesFor(entry: FileEntry): WorkspacePage[] {
  return Array.from({ length: entry.pageCount ?? 0 }, (_, i) => ({ key: `${entry.id}:${i}`, fileId: entry.id, pageIndex: i, rotation: 0 }));
}

export function usePageWorkspace(entries: FileEntry[]) {
  const ready = useMemo(() => entries.filter((e) => e.status === 'ready' && e.kind === 'pdf'), [entries]);
  const readyKey = ready.map((e) => `${e.id}:${e.pageCount}`).join('|');
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Keep pages in sync with the files: add pages of new files, drop pages of removed files.
  useEffect(() => {
    setPages((current) => {
      const ids = new Set(ready.map((e) => e.id));
      const kept = current.filter((p) => ids.has(p.fileId));
      const present = new Set(kept.map((p) => p.fileId));
      const added = ready.filter((e) => !present.has(e.id)).flatMap(pagesFor);
      return [...kept, ...added];
    });
    setSelected((sel) => {
      const ids = new Set(ready.map((e) => e.id));
      const next = new Set([...sel].filter((k) => ids.has(k.split(':')[0]!)));
      return next.size === sel.size ? sel : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyKey]);

  const rotate = useCallback((keys: Iterable<string>, delta: number) => {
    const set = new Set(keys);
    setPages((list) => list.map((p) => (set.has(p.key) ? { ...p, rotation: normalizeQuarter(p.rotation + delta) } : p)));
  }, []);

  const remove = useCallback((keys: Iterable<string>) => {
    const set = new Set(keys);
    setPages((list) => list.filter((p) => !set.has(p.key)));
    setSelected((sel) => new Set([...sel].filter((k) => !set.has(k))));
  }, []);

  const reorder = useCallback((keys: string[]) => {
    setPages((list) => {
      const byKey = new Map(list.map((p) => [p.key, p]));
      return keys.map((k) => byKey.get(k)).filter((p): p is WorkspacePage => !!p);
    });
  }, []);

  const reset = useCallback(() => {
    setPages(ready.flatMap(pagesFor));
    setSelected(new Set());
  }, [ready]);

  const plan = useCallback(
    (list: WorkspacePage[] = pages): { files: FileEntry[]; plan: PagePlanItem[] } => {
      const files: FileEntry[] = [];
      const index = new Map<string, number>();
      const items = list.map((p) => {
        if (!index.has(p.fileId)) {
          index.set(p.fileId, files.length);
          files.push(ready.find((e) => e.id === p.fileId)!);
        }
        return { source: index.get(p.fileId)!, page: p.pageIndex, rotate: p.rotation };
      });
      return { files, plan: items };
    },
    [pages, ready],
  );

  const modified = useMemo(() => {
    const original = ready.flatMap(pagesFor);
    return original.length !== pages.length || pages.some((p, i) => p.key !== original[i]?.key || p.rotation !== 0);
  }, [pages, ready]);

  return { ready, pages, selected, setSelected, rotate, remove, reorder, reset, plan, modified };
}

export type PageWorkspace = ReturnType<typeof usePageWorkspace>;
