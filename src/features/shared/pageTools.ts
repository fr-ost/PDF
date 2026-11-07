import type { FileEntry } from '../../hooks/useFileList';
import type { WorkspacePage } from './usePageWorkspace';
import type { GridPage } from '../../components/tool/PageGrid';

export function toGridPages(pages: WorkspacePage[], entries: FileEntry[], options: { colors?: string[]; labelWithFile?: boolean } = {}): GridPage[] {
  const fileIndex = new Map(entries.map((e, i) => [e.id, i]));
  return pages.map((p, i) => {
    const fi = fileIndex.get(p.fileId) ?? 0;
    return {
      key: p.key,
      docId: p.fileId,
      pageIndex: p.pageIndex,
      rotation: p.rotation,
      label: options.labelWithFile ? `${i + 1} · ${entries[fi]?.name ?? ''} p.${p.pageIndex + 1}` : `Page ${p.pageIndex + 1}`,
      ...(options.colors ? { color: options.colors[fi % options.colors.length] } : {}),
    };
  });
}
