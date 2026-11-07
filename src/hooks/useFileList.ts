/**
 * Manages the files selected in a tool: validation, inspection (page count,
 * password detection), previews, ordering and memory clean-up. Files are
 * kept as File references (disk-backed) — their bytes are only read when a
 * job runs, so large documents are not held in React state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError, PdfToolError } from '../pdf/errors';
import { loadDocument, releaseDocument } from '../pdf/renderers/documents';
import { screenFiles, type FileKind, type Rejection, LARGE_FILE_BYTES } from '../services/file-service/files';

export interface FileEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  kind: FileKind;
  status: 'checking' | 'ready' | 'locked' | 'error';
  error?: string;
  pageCount?: number;
  /** Held in memory only for this session; never stored. */
  password?: string;
  encrypted?: boolean;
  large: boolean;
  width?: number;
  height?: number;
  previewUrl?: string;
}

export interface UseFileListOptions {
  accept: FileKind[];
  multiple: boolean;
  max?: number;
}

async function makeImagePreview(file: File): Promise<{ url: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Preview failed');
    return { url: URL.createObjectURL(blob), width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export function useFileList({ accept, multiple, max }: UseFileListOptions) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const update = useCallback((id: string, patch: Partial<FileEntry>) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const inspect = useCallback(
    async (entry: FileEntry, password?: string) => {
      if (entry.kind === 'image') {
        try {
          const preview = await makeImagePreview(entry.file);
          if (!entriesRef.current.some((e) => e.id === entry.id)) {
            URL.revokeObjectURL(preview.url);
            return;
          }
          update(entry.id, { status: 'ready', previewUrl: preview.url, width: preview.width, height: preview.height });
        } catch {
          update(entry.id, { status: 'error', error: 'This image could not be decoded. It may be damaged or use an unsupported variant.' });
        }
        return;
      }
      try {
        const doc = await loadDocument(entry.id, entry.file, entry.name, password);
        let encrypted = !!password;
        try {
          const meta = await doc.getMetadata();
          encrypted = encrypted || !!(meta.info as Record<string, unknown> | undefined)?.EncryptFilterName;
        } catch {
          /* metadata is optional */
        }
        update(entry.id, { status: 'ready', pageCount: doc.numPages, encrypted, ...(password ? { password } : {}), error: undefined });
      } catch (err) {
        if (err instanceof PdfToolError && (err.code === 'ENCRYPTED' || err.code === 'WRONG_PASSWORD')) {
          update(entry.id, { status: 'locked', encrypted: true, error: err.code === 'WRONG_PASSWORD' ? 'Incorrect password. Try again.' : undefined });
        } else {
          update(entry.id, { status: 'error', error: describeError(err).message });
        }
      }
    },
    [update],
  );

  const add = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const limit = multiple ? Math.max(0, (max ?? 200) - entriesRef.current.length) : 1;
      const { accepted, rejected } = await screenFiles(multiple ? files : files.slice(0, 1), accept, limit);
      setRejections(rejected);
      if (accepted.length === 0) return;
      const created: FileEntry[] = accepted.map(({ file, kind }) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name || (kind === 'pdf' ? 'document.pdf' : 'image'),
        size: file.size,
        kind,
        status: 'checking',
        large: file.size > LARGE_FILE_BYTES,
      }));
      setEntries((list) => {
        if (!multiple) {
          list.forEach((e) => {
            releaseDocument(e.id);
            if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
          });
          return created;
        }
        return [...list, ...created];
      });
      entriesRef.current = multiple ? [...entriesRef.current, ...created] : created;
      created.forEach((entry) => void inspect(entry));
    },
    [accept, inspect, max, multiple],
  );

  const unlock = useCallback(
    (id: string, password: string) => {
      const entry = entriesRef.current.find((e) => e.id === id);
      if (!entry) return;
      update(id, { status: 'checking', error: undefined });
      void inspect(entry, password);
    },
    [inspect, update],
  );

  const remove = useCallback((id: string) => {
    setEntries((list) => {
      const entry = list.find((e) => e.id === id);
      if (entry) {
        releaseDocument(entry.id);
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      }
      return list.filter((e) => e.id !== id);
    });
  }, []);

  const move = useCallback((from: number, to: number) => {
    setEntries((list) => {
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  }, []);

  const setOrder = useCallback((ids: string[]) => {
    setEntries((list) => ids.map((id) => list.find((e) => e.id === id)).filter((e): e is FileEntry => !!e));
  }, []);

  const clear = useCallback(() => {
    entriesRef.current.forEach((e) => {
      releaseDocument(e.id);
      if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
    });
    setEntries([]);
    setRejections([]);
  }, []);

  useEffect(
    () => () => {
      entriesRef.current.forEach((e) => {
        releaseDocument(e.id);
        if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
      });
    },
    [],
  );

  const ready = entries.filter((e) => e.status === 'ready');
  return {
    entries,
    ready,
    allReady: entries.length > 0 && entries.every((e) => e.status === 'ready'),
    busy: entries.some((e) => e.status === 'checking'),
    rejections,
    dismissRejections: () => setRejections([]),
    add,
    unlock,
    remove,
    move,
    setOrder,
    clear,
  };
}

export type FileListApi = ReturnType<typeof useFileList>;
