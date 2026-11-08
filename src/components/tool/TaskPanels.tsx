import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, ExternalLink, FileArchive, FileText, Image as ImageIcon, RefreshCw, RotateCcw, ScrollText } from 'lucide-react';
import { describeError } from '../../pdf/errors';
import { openPdfDocument, destroyPdfDocument } from '../../pdf/renderers/pdfjs';
import { renderPageToCanvas } from '../../pdf/renderers/render';
import { openInViewer, saveOutput, type OutputFile } from '../../services/export-service/download';
import { runInWorker } from '../../pdf/workers/client';
import { formatBytes, pluralize } from '../../utils/format';
import { Button } from '../ui/Button';
import { Alert, ProgressBar, Spinner } from '../ui/Feedback';
import { Card } from '../ui/Card';
import { useToast } from '../ui/Toast';

export function TaskProgress({ progress, label, onCancel, title = 'Processing…' }: { progress: number | null; label?: string; onCancel: () => void; title?: string }) {
  return (
    <div className="animate-fade-in space-y-3" data-testid="task-progress">
      <div className="flex items-center gap-2.5">
        <Spinner size={16} className="text-primary" />
        <p className="text-sm font-medium">{title}</p>
        {progress !== null ? <span className="ml-auto font-mono text-xs tabular-nums text-fg-muted">{Math.round(progress * 100)}%</span> : null}
      </div>
      <ProgressBar value={progress} label={title} />
      <div className="flex items-center justify-between gap-3">
        <p className="min-h-4 truncate text-xs text-fg-subtle">{label ?? 'Working on your device — nothing is uploaded.'}</p>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ErrorPanel({ error, onRetry, onDismiss }: { error: unknown; onRetry?: () => void; onDismiss?: () => void }) {
  const info = describeError(error);
  return (
    <Alert
      tone="danger"
      title={info.title}
      action={
        onRetry || onDismiss ? (
          <div className="flex gap-1.5">
            {onDismiss ? (
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                Dismiss
              </Button>
            ) : null}
            {onRetry ? (
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <span data-testid="error-message">{info.message}</span> <span className="text-fg-subtle">{info.recovery}</span>
    </Alert>
  );
}

/** Animated success badge: a ring burst and a check mark that draws itself. */
export function SuccessBadge({ size = 44 }: { size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      <span className="absolute inset-0 rounded-full bg-success/30" style={{ animation: 'ring-burst 1100ms var(--ease-out-expo) both' }} />
      <svg viewBox="0 0 44 44" className="relative" width={size} height={size}>
        <circle cx="22" cy="22" r="21" fill="var(--color-success)" />
        <path d="M13.5 22.5l5.8 5.8L31 16.6" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30" strokeDashoffset="30" style={{ animation: 'check-draw 520ms 160ms var(--ease-out-expo) forwards' }} />
      </svg>
    </span>
  );
}

function OutputIcon({ kind }: { kind: OutputFile['kind'] }) {
  const Icon = kind === 'zip' ? FileArchive : kind === 'image' ? ImageIcon : kind === 'text' ? ScrollText : FileText;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
      <Icon size={18} aria-hidden />
    </div>
  );
}

function PdfPreview({ blob }: { blob: Blob }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let docRef: Awaited<ReturnType<typeof openPdfDocument>> | null = null;
    (async () => {
      try {
        const doc = await openPdfDocument(new Uint8Array(await blob.arrayBuffer()));
        if (cancelled) {
          // Unmounted while opening: the cleanup had nothing to destroy yet.
          void destroyPdfDocument(doc);
          return;
        }
        docRef = doc;
        const page = await doc.getPage(1);
        const scale = 240 / page.getViewport({ scale: 1 }).width;
        if (canvasRef.current && !cancelled) await renderPageToCanvas(page, scale * Math.min(2, devicePixelRatio || 1), { canvas: canvasRef.current });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (docRef) void destroyPdfDocument(docRef);
    };
  }, [blob]);
  if (failed) return null;
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-4 rounded-3xl bg-[radial-gradient(closest-side,var(--blob-a),transparent)]" />
      <canvas ref={canvasRef} className="page-shadow relative w-[128px] -rotate-2 rounded-md bg-white transition-transform duration-500 hover:rotate-0" aria-label="Preview of the first page" />
    </div>
  );
}

export function ResultPanel({
  outputs,
  title = 'Your file is ready',
  zipName,
  onBack,
  onStartOver,
  children,
}: {
  outputs: OutputFile[];
  title?: string;
  zipName?: string;
  onBack?: () => void;
  onStartOver: () => void;
  children?: ReactNode;
}) {
  const toast = useToast();
  const [zipping, setZipping] = useState(false);
  const single = outputs.length === 1 ? outputs[0] : undefined;

  const download = async (output: OutputFile) => {
    try {
      if (await saveOutput(output)) toast.show(`Saved ${output.name}`, 'success');
    } catch {
      toast.show('The file could not be saved.', 'error');
    }
  };

  const downloadAll = async () => {
    setZipping(true);
    try {
      const entries = await Promise.all(outputs.map(async (o) => ({ name: o.name, bytes: new Uint8Array(await o.blob.arrayBuffer()) })));
      const zip = await runInWorker('zip', { entries });
      const name = zipName ?? 'unique-pdf-files.zip';
      await saveOutput({ name, blob: new Blob([zip as BlobPart], { type: 'application/zip' }) });
      toast.show(`Saved ${name}`, 'success');
    } catch (err) {
      toast.show(describeError(err).message, 'error');
    } finally {
      setZipping(false);
    }
  };

  return (
    <Card className="relative animate-pop-in overflow-hidden" data-testid="result-panel">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--color-success),transparent)] opacity-60" />
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-success)_14%,transparent),transparent)]" />
      <div className="relative flex flex-col gap-8 p-7 sm:flex-row sm:items-start">
        {single?.kind === 'pdf' ? (
          <div className="hidden shrink-0 pt-1 sm:block">
            <PdfPreview blob={single.blob} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3.5">
            <SuccessBadge />
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-fg">{title}</h2>
              <p className="mt-0.5 text-sm text-fg-muted">
                {outputs.length === 1 ? 'Processed entirely on your device.' : `${pluralize(outputs.length, 'file')} processed entirely on your device.`}
              </p>
            </div>
          </div>

          {single ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" icon={Download} onClick={() => void download(single)} data-testid="download-button">
                Download
              </Button>
              {single.kind === 'pdf' ? (
                <Button variant="secondary" size="lg" icon={ExternalLink} onClick={() => openInViewer(single)}>
                  Open
                </Button>
              ) : null}
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface-2/60 py-2 pl-2 pr-4">
                <OutputIcon kind={single.kind} />
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium" data-testid="output-name">
                    {single.name}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {formatBytes(single.size)}
                    {single.pageCount ? ` · ${pluralize(single.pageCount, 'page')}` : ''}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <Button variant="primary" size="lg" icon={Download} loading={zipping} onClick={() => void downloadAll()} data-testid="download-all-button">
                Download all as ZIP
              </Button>
              <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line" aria-label="Output files">
                {outputs.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2/60">
                    <OutputIcon kind={o.kind} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">{o.name}</p>
                      <p className="text-xs text-fg-muted">
                        {formatBytes(o.size)}
                        {o.pageCount ? ` · ${pluralize(o.pageCount, 'page')}` : ''}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" icon={Download} onClick={() => void download(o)} aria-label={`Download ${o.name}`}>
                      Save
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
      </div>
      <div className="relative flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/40 px-7 py-3.5">
        {onBack ? (
          <Button variant="ghost" icon={RotateCcw} onClick={onBack}>
            Back to options
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onStartOver} data-testid="start-over">
          Start over
        </Button>
      </div>
    </Card>
  );
}
