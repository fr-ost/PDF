import { useEffect, useState } from 'react';
import { Eraser } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Field, TextArea, TextInput } from '../../components/ui/Form';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import type { EditableMetadata, PdfMetadata } from '../../pdf/engines/metadata';
import { describeError } from '../../pdf/errors';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { outputName } from '../../utils/filenames';
import { formatBytes } from '../../utils/format';

const FIELDS: { key: keyof Pick<EditableMetadata, 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer'>; label: string; hint?: string; multiline?: boolean }[] = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'subject', label: 'Subject', multiline: true },
  { key: 'keywords', label: 'Keywords', hint: 'Separate keywords with commas or spaces.' },
  { key: 'creator', label: 'Creator application' },
  { key: 'producer', label: 'PDF producer' },
];

/** ISO string → value for <input type="datetime-local"> (local time). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function MetadataTable({ meta }: { meta: PdfMetadata }) {
  const rows: [string, string][] = [
    ['Title', meta.title], ['Author', meta.author], ['Subject', meta.subject], ['Keywords', meta.keywords], ['Creator', meta.creator], ['Producer', meta.producer],
    ['Created', meta.creationDate ? new Date(meta.creationDate).toLocaleString() : ''], ['Modified', meta.modificationDate ? new Date(meta.modificationDate).toLocaleString() : ''],
    ['XMP metadata', meta.hasXmp ? 'Present' : 'None'],
  ];
  return (
    <dl className="divide-y divide-line rounded-lg border border-line text-sm" data-testid="metadata-table">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[130px_1fr] gap-3 px-3 py-2">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v || <span className="text-fg-subtle">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function MetadataTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<{ outputs: OutputFile[]; metadata: PdfMetadata; stripped: boolean }>();
  const [original, setOriginal] = useState<PdfMetadata | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [values, setValues] = useState<EditableMetadata | null>(null);
  const [confirmStrip, setConfirmStrip] = useState(false);
  const entry = files.ready[0];

  useEffect(() => {
    setOriginal(null);
    setValues(null);
    setLoadError(null);
    if (!entry) return;
    let cancelled = false;
    void (async () => {
      try {
        const meta = await runInWorker('readMetadata', { source: await toSource(entry) });
        if (cancelled) return;
        setOriginal(meta);
        setValues({ title: meta.title, author: meta.author, subject: meta.subject, keywords: meta.keywords, creator: meta.creator, producer: meta.producer, creationDate: meta.creationDate, modificationDate: meta.modificationDate });
      } catch (err) {
        if (!cancelled) setLoadError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const save = (strip: boolean) =>
    task.run(async ({ signal }) => {
      const { bytes, metadata } = await runInWorker('writeMetadata', { source: await toSource(entry!), values: strip ? null : values }, { signal });
      const outputs = [makeOutput(outputName(entry!.name, strip ? 'clean' : 'edited'), bytes, 'pdf', { pageCount: metadata.pageCount })];
      recordHistory(tool, [entry!], outputs);
      return { outputs, metadata, stripped: strip };
    });

  const set = (key: keyof EditableMetadata, value: string | null) => values && setValues({ ...values, [key]: value });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: 'Save metadata', onClick: () => void save(false), disabled: !values }}
      onRetry={() => void save(false)}
      result={
        task.result ? (
          <ResultPanel outputs={task.result.outputs} title={task.result.stripped ? 'Metadata removed' : 'Metadata saved'} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }}>
            <p className="mb-2 text-[13px] font-medium">Metadata in the new file</p>
            <MetadataTable meta={task.result.metadata} />
          </ResultPanel>
        ) : null
      }
      options={
        <>
          {original ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Pages', String(original.pageCount)],
                ['PDF version', original.pdfVersion],
                ['File size', formatBytes(entry?.size ?? 0)],
                ['Encrypted', original.wasEncrypted ? 'Yes' : 'No'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 px-3 py-2"><dt className="text-xs text-fg-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
          ) : null}
          <Button className="w-full" icon={Eraser} onClick={() => setConfirmStrip(true)} disabled={!values || task.running}>Remove all metadata</Button>
          <p className="text-xs text-fg-subtle">Removes the document information dictionary, XMP metadata and application-private data.</p>
        </>
      }
    >
      {loadError ? <Alert tone="danger" title="Could not read metadata">{describeError(loadError).message}</Alert> : null}
      {!values && !loadError ? <p className="flex items-center gap-2 py-10 text-sm text-fg-muted"><Spinner /> Reading metadata…</p> : null}
      {values ? (
        <Card className="space-y-4 p-5">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`meta-${f.key}`} hint={f.hint}>
              {f.multiline ? (
                <TextArea id={`meta-${f.key}`} value={values[f.key]} maxLength={2000} rows={2} onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <TextInput id={`meta-${f.key}`} value={values[f.key]} maxLength={2000} onChange={(e) => set(f.key, e.target.value)} />
              )}
            </Field>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Created" htmlFor="meta-created"><TextInput id="meta-created" type="datetime-local" value={toLocalInput(values.creationDate)} onChange={(e) => set('creationDate', fromLocalInput(e.target.value))} /></Field>
            <Field label="Modified" htmlFor="meta-modified"><TextInput id="meta-modified" type="datetime-local" value={toLocalInput(values.modificationDate)} onChange={(e) => set('modificationDate', fromLocalInput(e.target.value))} /></Field>
          </div>
          <p className="text-xs text-fg-subtle">Leave a field empty to remove it. If the file contains XMP metadata, it is updated to match.</p>
        </Card>
      ) : null}
      <ConfirmDialog
        open={confirmStrip}
        onCancel={() => setConfirmStrip(false)}
        onConfirm={() => { setConfirmStrip(false); void save(true); }}
        title="Remove all metadata?"
        message="The new copy will contain no title, author, dates, creator or producer information."
        confirmLabel="Remove metadata"
        tone="danger"
      />
    </ToolShell>
  );
}
