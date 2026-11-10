import { useEffect, useRef, useState } from 'react';
import type { ToolDefinition } from '../../features/registry';
import { useFileList, type FileEntry } from '../../hooks/useFileList';
import { addHistoryEntry } from '../../services/history-service/history';
import { noteSuccessfulTask } from '../../services/support/reviewPrompt';
import { noteToolUsed } from '../../services/telemetry/usageStats';
import type { OutputFile } from '../../services/export-service/download';
import { readBytes } from '../../services/file-service/files';
import type { PdfSource } from '../../pdf/engines/load';
import { parsePageRanges } from '../../pdf/pageRanges';
import { Field, TextInput } from '../ui/Form';

/** File list configured from the tool definition, pre-filled with handed-off files. */
export function useToolFiles(tool: ToolDefinition, initialFiles: File[], options: { max?: number } = {}) {
  const files = useFileList({ accept: [tool.accepts], multiple: tool.multiple, ...(options.max ? { max: options.max } : {}) });
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || initialFiles.length === 0) return;
    seeded.current = true;
    void files.add(initialFiles);
  }, [files, initialFiles]);
  return files;
}

/** Reads a selected file into a worker-ready source (fresh copy each time). */
export async function toSource(entry: FileEntry): Promise<PdfSource> {
  const bytes = await readBytes(entry.file);
  return entry.password ? { bytes, name: entry.name, password: entry.password } : { bytes, name: entry.name };
}

export function recordHistory(tool: ToolDefinition, inputs: { name: string; size: number }[], outputs: OutputFile[]): void {
  void noteSuccessfulTask();
  void noteToolUsed(tool.id);
  void addHistoryEntry({ toolId: tool.id, toolName: tool.name, inputs, outputs: outputs.map((o) => ({ name: o.name, size: o.size })) });
}

/** Text field for page ranges with live validation. */
export function PageRangeField({ value, onChange, pageCount, label = 'Pages', hint, id = 'page-range' }: { value: string; onChange: (v: string) => void; pageCount: number; label?: string; hint?: string; id?: string }) {
  const [touched, setTouched] = useState(false);
  const result = value.trim() ? parsePageRanges(value, pageCount) : null;
  const error = touched && result && !result.ok ? result.error : null;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint ?? `Examples: 1-3, 5, 8-  ·  odd  ·  even  ·  last (${pageCount} pages)`}>
      <TextInput id={id} value={value} placeholder="e.g. 1-3, 5" onChange={(e) => onChange(e.target.value)} onBlur={() => setTouched(true)} invalid={!!error} autoComplete="off" spellCheck={false} />
    </Field>
  );
}

export const SOURCE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#0891b2', '#65a30d', '#dc2626'];
