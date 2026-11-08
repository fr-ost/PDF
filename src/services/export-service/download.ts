/**
 * Saving output files. Uses a regular browser download (no extension
 * permission required), or the native "Save as" picker when the user enables
 * it in Settings. Object URLs are revoked shortly after use.
 */
import { getSettings } from '../settings-service/settings';
import { sanitizeFileName } from '../../utils/filenames';

export interface OutputFile {
  id: string;
  name: string;
  blob: Blob;
  size: number;
  pageCount?: number;
  kind: 'pdf' | 'zip' | 'image' | 'text';
}

const MIME: Record<OutputFile['kind'], string> = { pdf: 'application/pdf', zip: 'application/zip', image: 'image/png', text: 'text/markdown' };

export function makeOutput(name: string, data: Uint8Array | Blob, kind: OutputFile['kind'], extra: { pageCount?: number; mime?: string } = {}): OutputFile {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: extra.mime ?? MIME[kind] });
  return { id: crypto.randomUUID(), name: safeName(name, kind), blob, size: blob.size, kind, ...(extra.pageCount !== undefined ? { pageCount: extra.pageCount } : {}) };
}

function safeName(name: string, kind: OutputFile['kind']): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : kind === 'image' ? 'png' : kind === 'text' ? 'md' : kind;
  const stem = sanitizeFileName(dot > 0 ? name.slice(0, dot) : name, 'output');
  return `${stem}.${ext || kind}`;
}

type SavePicker = (options: { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<{
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}>;

/** Returns false if the user cancelled the save dialog. */
export async function saveOutput(output: Pick<OutputFile, 'name' | 'blob'>): Promise<boolean> {
  const picker = (globalThis as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (getSettings().askWhereToSave && picker) {
    try {
      const ext = output.name.split('.').pop() ?? 'pdf';
      const handle = await picker({ suggestedName: output.name, types: [{ description: ext.toUpperCase(), accept: { [output.blob.type || 'application/octet-stream']: [`.${ext}`] } }] });
      const writable = await handle.createWritable();
      await writable.write(output.blob);
      await writable.close();
      return true;
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return false;
      // Fall back to a normal download if the picker is unavailable.
    }
  }
  const url = URL.createObjectURL(output.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = output.name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** Opens a PDF output in a new tab using Chrome's built-in viewer. */
export function openInViewer(output: Pick<OutputFile, 'blob'>): void {
  const url = URL.createObjectURL(output.blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}
