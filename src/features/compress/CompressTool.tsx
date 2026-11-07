import { useState } from 'react';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { PageThumbnail } from '../../components/tool/PageThumbnail';
import { recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Card } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Feedback';
import { Checkbox, Field, Select, Slider, Switch } from '../../components/ui/Form';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import type { CompressReport } from '../../pdf/engines/compress';
import type { CompressionLevel } from '../../pdf/compressionPresets';
import { getDocumentProxy } from '../../pdf/renderers/documents';
import { canvasToBlob, releaseCanvas, renderPageToCanvas } from '../../pdf/renderers/render';
import { PdfToolError } from '../../pdf/errors';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { useSettings } from '../../services/settings-service/settings';
import { outputName } from '../../utils/filenames';
import { formatBytes, percentSaved, pluralize } from '../../utils/format';
import { cn } from '../../utils/cn';

const LEVELS: { value: CompressionLevel; title: string; text: string }[] = [
  { value: 'low', title: 'Light', text: 'Best quality. Only oversized images (above 300 DPI) are reduced.' },
  { value: 'balanced', title: 'Balanced', text: 'Recommended. Images are optimised to about 150 DPI.' },
  { value: 'high', title: 'Strong', text: 'Smallest size. Images at about 100 DPI with stronger JPEG compression.' },
];

interface CompressResult {
  outputs: OutputFile[];
  originalSize: number;
  report?: CompressReport;
  rasterized: boolean;
}

export default function CompressTool({ tool, initialFiles }: ToolProps) {
  const settings = useSettings();
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<CompressResult>();
  const [level, setLevel] = useState<CompressionLevel>(settings.compressionLevel);
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [rasterize, setRasterize] = useState(false);
  const [rasterDpi, setRasterDpi] = useState(110);
  const [rasterQuality, setRasterQuality] = useState(0.7);
  const entry = files.ready[0];

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const e = entry!;
      if (!rasterize) {
        const { bytes, report } = await runInWorker('compress', { source: await toSource(e), options: { level, removeMetadata } }, { signal, onProgress: progress });
        const outputs = [makeOutput(outputName(e.name, 'compressed'), bytes, 'pdf', { pageCount: e.pageCount })];
        recordHistory(tool, [e], outputs);
        return { outputs, originalSize: e.size, report, rasterized: false };
      }
      const doc = await getDocumentProxy(e.id);
      if (!doc) throw new PdfToolError('UNKNOWN', 'The document is no longer open. Please add it again.');
      const pages = [];
      for (let i = 0; i < doc.numPages; i++) {
        if (signal.aborted) throw new PdfToolError('CANCELLED', 'Cancelled');
        progress((i / doc.numPages) * 0.85, `Rendering page ${i + 1} of ${doc.numPages}`);
        const page = await doc.getPage(i + 1);
        const vp = page.getViewport({ scale: 1 });
        const { canvas } = await renderPageToCanvas(page, rasterDpi / 72, { signal });
        const blob = await canvasToBlob(canvas, 'image/jpeg', rasterQuality);
        releaseCanvas(canvas);
        page.cleanup();
        pages.push({ kind: 'jpeg' as const, bytes: new Uint8Array(await blob.arrayBuffer()), width: vp.width, height: vp.height });
      }
      const bytes = await runInWorker('rasterToPdf', { pages }, { signal, onProgress: (v, l) => progress(0.85 + v * 0.15, l) });
      const outputs = [makeOutput(outputName(e.name, 'compressed'), bytes, 'pdf', { pageCount: pages.length })];
      recordHistory(tool, [e], outputs);
      return { outputs, originalSize: e.size, rasterized: true };
    });

  const result = task.result;
  const saved = result ? percentSaved(result.originalSize, result.outputs[0]!.size) : 0;

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: 'Compress PDF', onClick: () => void apply(), disabled: !entry }}
      result={
        result ? (
          <ResultPanel outputs={result.outputs} title={saved > 0 ? `Reduced by ${saved}%` : 'Compression finished'} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }}>
            <div className="grid grid-cols-3 gap-3" data-testid="compression-stats">
              {[
                ['Original', formatBytes(result.originalSize)],
                ['Compressed', formatBytes(result.outputs[0]!.size)],
                ['Saved', saved > 0 ? `${formatBytes(result.originalSize - result.outputs[0]!.size)} (${saved}%)` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
                  <p className="text-xs text-fg-muted">{k}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            {saved <= 0 ? (
              <Alert tone="info" className="mt-3" title="This PDF is already well optimised">
                The compressed version isn’t smaller than the original. We recommend keeping your original file{rasterize ? '' : ', or trying the Strong level'}.
              </Alert>
            ) : null}
            {result.report ? (
              <p className="mt-3 text-xs text-fg-subtle">
                {pluralize(result.report.imagesRecompressed, 'image')} optimised of {result.report.imagesFound}
                {result.report.duplicateStreamsRemoved ? ` · ${pluralize(result.report.duplicateStreamsRemoved, 'duplicate')} merged` : ''}
                {result.report.objectsRemoved ? ` · ${pluralize(result.report.objectsRemoved, 'unused object')} removed` : ''}. Text and vector graphics were preserved.
              </p>
            ) : (
              <p className="mt-3 text-xs text-fg-subtle">Pages were converted to images; text is no longer selectable.</p>
            )}
          </ResultPanel>
        ) : null
      }
      options={
        <>
          <fieldset className={cn('space-y-2', rasterize && 'pointer-events-none opacity-50')} disabled={rasterize}>
            <legend className="mb-2 text-[13px] font-medium">Compression level</legend>
            {LEVELS.map((l) => (
              <label key={l.value} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors', level === l.value ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-2')}>
                <input type="radio" name="level" className="mt-0.5 accent-[var(--color-primary)]" checked={level === l.value} onChange={() => setLevel(l.value)} />
                <span>
                  <span className="block text-sm font-medium">{l.title}</span>
                  <span className="block text-xs text-fg-muted">{l.text}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Checkbox checked={removeMetadata} onChange={setRemoveMetadata} label="Remove metadata" description="Strips title, author and other document properties." disabled={rasterize} />
          <div className="space-y-3 rounded-lg border border-line p-3">
            <Switch checked={rasterize} onChange={setRasterize} label="Maximum compression" description="Converts every page to an image. Best for scans." />
            {rasterize ? (
              <>
                <Alert tone="warning" icon={AlertTriangle} title="Quality trade-off">
                  Text will no longer be selectable or searchable, and links, forms and vector sharpness are lost.
                </Alert>
                <Field label="Resolution" htmlFor="raster-dpi">
                  <Select id="raster-dpi" value={rasterDpi} onChange={(e) => setRasterDpi(Number(e.target.value))}>
                    <option value={72}>72 DPI — screen, smallest</option>
                    <option value={110}>110 DPI — readable</option>
                    <option value={150}>150 DPI — good print</option>
                    <option value={200}>200 DPI — high</option>
                  </Select>
                </Field>
                <Slider label="Image quality" min={0.3} max={0.95} step={0.05} value={rasterQuality} onChange={setRasterQuality} format={(v) => `${Math.round(v * 100)}%`} />
              </>
            ) : null}
          </div>
        </>
      }
    >
      {entry ? (
        <Card className="flex items-center gap-5 p-5">
          <div className="w-24 shrink-0">
            <PageThumbnail docId={entry.id} pageIndex={0} width={96} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{entry.name}</p>
            <p className="text-sm text-fg-muted">{formatBytes(entry.size)} · {pluralize(entry.pageCount ?? 0, 'page')}</p>
            <p className="mt-3 flex items-start gap-2 text-sm text-fg-muted">
              <TrendingDown size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              Compression optimises embedded images and removes unused data. Documents that are mostly text are usually already compact.
            </p>
          </div>
        </Card>
      ) : null}
    </ToolShell>
  );
}
