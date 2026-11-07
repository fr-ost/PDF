import { useEffect, useState } from 'react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageGrid } from '../../components/tool/PageGrid';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { recordHistory, useToolFiles } from '../../components/tool/helpers';
import { Alert } from '../../components/ui/Feedback';
import { Field, Segmented, Select, Slider } from '../../components/ui/Form';
import { useTask } from '../../hooks/useTask';
import { PdfToolError } from '../../pdf/errors';
import { getDocumentProxy } from '../../pdf/renderers/documents';
import { canvasToBlob, releaseCanvas, renderPageToCanvas, safeScale } from '../../pdf/renderers/render';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { useSettings } from '../../services/settings-service/settings';
import { baseName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';
import { usePageWorkspace } from '../shared/usePageWorkspace';
import { SelectionBar } from '../shared/SelectionBar';
import { toGridPages } from '../shared/pageTools';

interface ImageResult {
  outputs: OutputFile[];
  clamped: number;
}

function OutputStrip({ outputs }: { outputs: OutputFile[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const list = outputs.slice(0, 8).map((o) => URL.createObjectURL(o.blob));
    setUrls(list);
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, [outputs]);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Preview of exported images">
      {urls.map((u, i) => (
        <img key={u} src={u} alt={`Exported image ${i + 1}`} className="page-shadow h-28 w-auto rounded-sm bg-white" />
      ))}
    </div>
  );
}

export default function PdfToImageTool({ tool, initialFiles }: ToolProps) {
  const settings = useSettings();
  const files = useToolFiles(tool, initialFiles);
  const ws = usePageWorkspace(files.entries);
  const task = useTask<ImageResult>();
  const [format, setFormat] = useState<'png' | 'jpeg'>(settings.imageFormat);
  const [dpi, setDpi] = useState(settings.imageDpi);
  const [quality, setQuality] = useState(settings.jpegQuality);
  const entry = ws.ready[0];
  const keys = ws.pages.map((p) => p.key);

  // Select all pages by default once the document is ready.
  useEffect(() => {
    if (keys.length && ws.selected.size === 0) ws.setSelected(new Set(keys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.length]);

  const selectedIndices = ws.pages.filter((p) => ws.selected.has(p.key)).map((p) => p.pageIndex);

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const doc = await getDocumentProxy(entry!.id);
      if (!doc) throw new PdfToolError('UNKNOWN', 'The document is no longer open. Please add it again.');
      const stem = baseName(entry!.name);
      const outputs: OutputFile[] = [];
      let clamped = 0;
      for (let n = 0; n < selectedIndices.length; n++) {
        if (signal.aborted) throw new PdfToolError('CANCELLED', 'Cancelled');
        const index = selectedIndices[n]!;
        progress(n / selectedIndices.length, `Rendering page ${index + 1} (${n + 1} of ${selectedIndices.length})`);
        const page = await doc.getPage(index + 1);
        const { scale, clamped: wasClamped } = safeScale(page, dpi / 72);
        if (wasClamped) clamped++;
        const { canvas } = await renderPageToCanvas(page, scale, { signal });
        const blob = await canvasToBlob(canvas, format === 'png' ? 'image/png' : 'image/jpeg', format === 'jpeg' ? quality : undefined);
        releaseCanvas(canvas);
        page.cleanup();
        outputs.push(makeOutput(`${stem}-page-${index + 1}.${format === 'png' ? 'png' : 'jpg'}`, blob, 'image'));
        await new Promise((r) => setTimeout(r, 0)); // keep the interface responsive
      }
      recordHistory(tool, [entry!], outputs);
      return { outputs, clamped };
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: selectedIndices.length ? `Export ${pluralize(selectedIndices.length, 'image')}` : 'Export images', onClick: () => void apply(), disabled: !entry || selectedIndices.length === 0 }}
      result={
        task.result ? (
          <ResultPanel outputs={task.result.outputs} title={task.result.outputs.length === 1 ? 'Your image is ready' : 'Your images are ready'} zipName={`${baseName(entry?.name ?? 'pages')}-images.zip`} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }}>
            <OutputStrip outputs={task.result.outputs} />
            {task.result.clamped ? <Alert tone="info" className="mt-3">{pluralize(task.result.clamped, 'page')} exceeded the browser’s maximum image size and {task.result.clamped === 1 ? 'was' : 'were'} exported at a lower resolution.</Alert> : null}
          </ResultPanel>
        ) : null
      }
      options={
        <>
          <Field label="Format">
            <Segmented label="Image format" value={format} onChange={setFormat} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }]} />
          </Field>
          <Field label="Resolution" htmlFor="dpi" hint="150 DPI is good for screens; 300 DPI for print.">
            <Select id="dpi" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
              {[72, 96, 150, 200, 300, 400, 600].map((d) => (
                <option key={d} value={d}>{d} DPI</option>
              ))}
            </Select>
          </Field>
          {format === 'jpeg' ? <Slider label="JPEG quality" min={0.5} max={1} step={0.05} value={quality} onChange={setQuality} format={(v) => `${Math.round(v * 100)}%`} /> : null}
          {dpi >= 400 ? <Alert tone="info">High resolutions produce large files and take longer to render.</Alert> : null}
        </>
      }
    >
      <SelectionBar keys={keys} selected={ws.selected} onChange={ws.setSelected} />
      <PageGrid pages={toGridPages(ws.pages, ws.ready)} selected={ws.selected} onSelect={ws.setSelected} />
    </ToolShell>
  );
}
