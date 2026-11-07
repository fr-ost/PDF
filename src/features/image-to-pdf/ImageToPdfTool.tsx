import { useMemo, useState } from 'react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { Dropzone } from '../../components/tool/Dropzone';
import { FileGrid } from '../../components/tool/FileGrid';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { recordHistory, useToolFiles } from '../../components/tool/helpers';
import { Field, NumberInput, Segmented, Select, TextInput } from '../../components/ui/Form';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { computePlacement, type ImagesToPdfOptions } from '../../pdf/imageLayout';
import { MM_TO_PT, PAPER_SIZES, type PaperSize } from '../../pdf/paper';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { readBytes } from '../../services/file-service/files';
import { useSettings } from '../../services/settings-service/settings';
import { baseName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';

const MARGINS = { none: 0, small: 18, medium: 36, large: 72 } as const;
type MarginKey = keyof typeof MARGINS | 'custom';

export default function ImageToPdfTool({ tool, initialFiles }: ToolProps) {
  const settings = useSettings();
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<OutputFile[]>();
  const [pageSize, setPageSize] = useState<PaperSize | 'fit' | 'custom'>(settings.pageSize);
  const [orientation, setOrientation] = useState<ImagesToPdfOptions['orientation']>('auto');
  const [marginKey, setMarginKey] = useState<MarginKey>('small');
  const [customMargin, setCustomMargin] = useState(10);
  const [fit, setFit] = useState<ImagesToPdfOptions['fit']>('contain');
  const [customW, setCustomW] = useState(210);
  const [customH, setCustomH] = useState(297);
  const [name, setName] = useState('');
  const ready = files.ready;
  const defaultName = ready[0] ? (ready.length === 1 ? baseName(ready[0].name) : 'images') : 'images';

  const options: ImagesToPdfOptions = {
    pageSize,
    orientation,
    margin: marginKey === 'custom' ? customMargin * MM_TO_PT : MARGINS[marginKey],
    fit,
    customWidth: customW * MM_TO_PT,
    customHeight: customH * MM_TO_PT,
  };

  const preview = useMemo(() => {
    const first = ready[0];
    if (!first?.width || !first.height) return null;
    try {
      return computePlacement({ width: first.width, height: first.height, orientation: 1 }, options);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready[0]?.id, ready[0]?.width, pageSize, orientation, marginKey, customMargin, fit, customW, customH]);

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const images = await Promise.all(ready.map(async (e) => ({ name: e.name, bytes: await readBytes(e.file) })));
      const bytes = await runInWorker('imagesToPdf', { images, options }, { signal, onProgress: progress });
      const outputs = [makeOutput(`${name.trim() || defaultName}.pdf`, bytes, 'pdf', { pageCount: images.length })];
      recordHistory(tool, ready, outputs);
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      emptyHint="JPEG, PNG, WebP, GIF, BMP and AVIF are supported. Each image becomes one page."
      primary={{ label: ready.length ? `Create PDF (${pluralize(ready.length, 'page')})` : 'Create PDF', onClick: () => void apply(), disabled: ready.length === 0 }}
      result={task.result ? <ResultPanel outputs={task.result} title="Your PDF is ready" onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <>
          <Field label="Page size" htmlFor="img-size">
            <Select id="img-size" value={pageSize} onChange={(e) => setPageSize(e.target.value as PaperSize | 'fit' | 'custom')}>
              {Object.entries(PAPER_SIZES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
              <option value="fit">Same as image</option>
              <option value="custom">Custom…</option>
            </Select>
          </Field>
          {pageSize === 'custom' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Width" htmlFor="img-w"><NumberInput id="img-w" value={customW} min={10} max={5000} suffix="mm" onChange={setCustomW} /></Field>
              <Field label="Height" htmlFor="img-h"><NumberInput id="img-h" value={customH} min={10} max={5000} suffix="mm" onChange={setCustomH} /></Field>
            </div>
          ) : null}
          {pageSize !== 'fit' ? (
            <Field label="Orientation">
              <Segmented label="Orientation" value={orientation} onChange={setOrientation} options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />
            </Field>
          ) : null}
          <Field label="Margins" htmlFor="img-margin">
            <Select id="img-margin" value={marginKey} onChange={(e) => setMarginKey(e.target.value as MarginKey)}>
              <option value="none">None</option>
              <option value="small">Small (6 mm)</option>
              <option value="medium">Medium (13 mm)</option>
              <option value="large">Large (25 mm)</option>
              <option value="custom">Custom…</option>
            </Select>
          </Field>
          {marginKey === 'custom' ? <NumberInput aria-label="Custom margin" value={customMargin} min={0} max={200} suffix="mm" onChange={setCustomMargin} /> : null}
          {pageSize !== 'fit' ? (
            <Field label="Image size" hint="The aspect ratio is always preserved.">
              <Segmented label="Image size" value={fit} onChange={setFit} options={[{ value: 'contain', label: 'Fit to page' }, { value: 'original', label: 'Original size' }]} />
            </Field>
          ) : null}
          {preview ? (
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Layout preview</p>
              <div className="flex h-40 items-center justify-center rounded-lg bg-surface-2 p-3" aria-hidden>
                <div className="page-shadow relative bg-white" style={{ aspectRatio: `${preview.pageWidth} / ${preview.pageHeight}`, height: preview.pageHeight >= preview.pageWidth ? '100%' : undefined, width: preview.pageWidth > preview.pageHeight ? '100%' : undefined }}>
                  <img src={ready[0]!.previewUrl} alt="" className="absolute object-fill" style={{ left: `${(preview.x / preview.pageWidth) * 100}%`, top: `${((preview.pageHeight - preview.y - preview.height) / preview.pageHeight) * 100}%`, width: `${(preview.width / preview.pageWidth) * 100}%`, height: `${(preview.height / preview.pageHeight) * 100}%` }} />
                </div>
              </div>
            </div>
          ) : null}
          <Field label="Output file name" htmlFor="img-name">
            <TextInput id="img-name" value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
          </Field>
        </>
      }
    >
      <p className="mb-3 text-sm text-fg-muted">Drag images to change the page order.</p>
      <FileGrid files={files} />
      <Dropzone compact accept={['image']} multiple onFiles={(f) => void files.add(f)} className="mt-4" title="Drop more images here" />
    </ToolShell>
  );
}
