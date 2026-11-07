import { useState } from 'react';
import { Bold } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageCanvas } from '../../components/tool/PageCanvas';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { PageRangeField, recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { IconButton } from '../../components/ui/Button';
import { ColorField, Field, NumberInput, Segmented, Select, Slider, TextInput } from '../../components/ui/Form';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { parsePageRanges } from '../../pdf/pageRanges';
import { formatPageNumber, type NumberFormat, type NumberPosition } from '../../pdf/pageNumberFormat';
import { FONT_ASCENT, FONT_DESCENT, FONT_FAMILIES, findUnsupportedChars, type FontFamily } from '../../pdf/winAnsi';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { cssFont, measureTextWidth } from '../../utils/measureText';
import { outputName } from '../../utils/filenames';
import { PositionGrid, PreviewPager } from '../shared/PreviewPager';

const POSITIONS: NumberPosition[][] = [
  ['top-left', 'top-center', 'top-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

export default function PageNumberTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<OutputFile[]>();
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [format, setFormat] = useState<NumberFormat>('n');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [startNumber, setStartNumber] = useState(1);
  const [font, setFont] = useState<FontFamily>('Helvetica');
  const [bold, setBold] = useState(false);
  const [fontSize, setFontSize] = useState(11);
  const [color, setColor] = useState('#111827');
  const [margin, setMargin] = useState(28);
  const [pagesMode, setPagesMode] = useState<'all' | 'skip-first' | 'custom'>('all');
  const [range, setRange] = useState('');
  const [previewPage, setPreviewPage] = useState(0);
  const entry = files.ready[0];
  const pageCount = entry?.pageCount ?? 0;

  const parsed = pagesMode === 'custom' ? parsePageRanges(range, pageCount || 1) : null;
  const pages =
    pagesMode === 'all'
      ? Array.from({ length: pageCount }, (_, i) => i)
      : pagesMode === 'skip-first'
        ? Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => i + 1)
        : parsed?.ok
          ? [...parsed.pages].sort((a, b) => a - b)
          : [];
  const total = startNumber + pages.length - 1;
  const unsupported = findUnsupportedChars(prefix + suffix);
  const sample = formatPageNumber(startNumber, total, { format, prefix, suffix });

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const options = { position, margin, startNumber, format, prefix, suffix, font, bold, fontSize, color, pages };
      const bytes = await runInWorker('pageNumbers', { source: await toSource(entry!), options }, { signal, onProgress: progress });
      const outputs = [makeOutput(outputName(entry!.name, 'numbered'), bytes, 'pdf', { pageCount })];
      recordHistory(tool, [entry!], outputs);
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: 'Add page numbers', onClick: () => void apply(), disabled: !entry || pages.length === 0 || unsupported.length > 0, hint: pages.length ? `Example: “${sample}”` : 'Choose pages to number.' }}
      result={task.result ? <ResultPanel outputs={task.result} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <>
          <Field label="Position">
            <PositionGrid label="Position" value={position} onChange={setPosition} positions={POSITIONS} />
          </Field>
          <Field label="Format" htmlFor="pn-format">
            <Select id="pn-format" value={format} onChange={(e) => setFormat(e.target.value as NumberFormat)}>
              <option value="n">1</option>
              <option value="page-n">Page 1</option>
              <option value="n-of-total">1 of {Math.max(1, total)}</option>
              <option value="page-n-of-total">Page 1 of {Math.max(1, total)}</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prefix" htmlFor="pn-prefix"><TextInput id="pn-prefix" value={prefix} maxLength={40} placeholder="e.g. – " onChange={(e) => setPrefix(e.target.value)} /></Field>
            <Field label="Suffix" htmlFor="pn-suffix"><TextInput id="pn-suffix" value={suffix} maxLength={40} placeholder="e.g.  –" onChange={(e) => setSuffix(e.target.value)} /></Field>
          </div>
          {unsupported.length ? <p className="text-[12.5px] text-danger">Not supported by the built-in fonts: {unsupported.join(' ')}</p> : null}
          <Field label="Start numbering at" htmlFor="pn-start"><NumberInput id="pn-start" value={startNumber} min={0} max={1000000} onChange={(v) => setStartNumber(Math.round(v))} /></Field>
          <div className="flex items-end gap-2">
            <Field label="Font" htmlFor="pn-font" className="flex-1">
              <Select id="pn-font" value={font} onChange={(e) => setFont(e.target.value as FontFamily)}>
                {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </Select>
            </Field>
            <IconButton icon={Bold} label="Bold" variant="secondary" active={bold} aria-pressed={bold} onClick={() => setBold(!bold)} />
          </div>
          <Slider label="Font size" min={6} max={36} value={fontSize} onChange={setFontSize} format={(v) => `${v} pt`} />
          <Slider label="Distance from edge" min={6} max={100} value={margin} onChange={setMargin} format={(v) => `${v} pt`} />
          <ColorField label="Colour" value={color} onChange={setColor} />
          <Field label="Pages">
            <Segmented label="Pages to number" size="sm" value={pagesMode} onChange={setPagesMode} options={[{ value: 'all', label: 'All' }, { value: 'skip-first', label: 'Skip first' }, { value: 'custom', label: 'Custom' }]} />
          </Field>
          {pagesMode === 'custom' ? <PageRangeField value={range} onChange={setRange} pageCount={pageCount} /> : null}
        </>
      }
    >
      {entry ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-4">
          <PageCanvas docId={entry.id} pageIndex={Math.min(previewPage, Math.max(0, pageCount - 1))} maxWidth={560} maxHeight={720}>
            {(info) => {
              const n = pages.indexOf(previewPage);
              if (n < 0) return <div className="absolute inset-x-0 bottom-2 text-center text-xs text-fg-subtle">Not numbered</div>;
              const label = formatPageNumber(startNumber + n, total, { format, prefix, suffix });
              const width = measureTextWidth(label, font, fontSize, bold);
              const [v, h] = position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
              const x = h === 'left' ? margin : h === 'right' ? info.width - margin - width : (info.width - width) / 2;
              const yUp = v === 'top' ? info.height - margin - fontSize * FONT_ASCENT[font] : margin + fontSize * FONT_DESCENT[font];
              return (
                <svg viewBox={`0 0 ${info.width} ${info.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
                  <text x={x} y={info.height - yUp} fill={color} style={{ fontFamily: cssFont(font), fontSize, fontWeight: bold ? 700 : 400, whiteSpace: 'pre' }}>{label}</text>
                </svg>
              );
            }}
          </PageCanvas>
          <PreviewPager index={previewPage} count={pageCount} onChange={setPreviewPage} />
        </div>
      ) : null}
    </ToolShell>
  );
}
