import { useEffect, useState } from 'react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageGrid } from '../../components/tool/PageGrid';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { PageRangeField, recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Field, Segmented } from '../../components/ui/Form';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { formatPageList, parsePageRanges } from '../../pdf/pageRanges';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { baseName, outputName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';
import { usePageWorkspace } from '../shared/usePageWorkspace';
import { SelectionBar } from '../shared/SelectionBar';
import { toGridPages } from '../shared/pageTools';

export default function ExtractTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const ws = usePageWorkspace(files.entries);
  const task = useTask<OutputFile[]>();
  const [mode, setMode] = useState<'single' | 'separate'>('single');
  const [range, setRange] = useState('');
  const entry = ws.ready[0];
  const keys = ws.pages.map((p) => p.key);
  const indices = ws.pages.map((p, i) => (ws.selected.has(p.key) ? i : -1)).filter((i) => i >= 0);

  // Keep the range field and the visual selection in sync (also once a new file's pages load).
  const keySignature = keys.join('|');
  useEffect(() => {
    const r = parsePageRanges(range, keys.length);
    if (r.ok) ws.setSelected(new Set(r.pages.map((i) => keys[i]!)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, keySignature]);
  const onSelect = (s: Set<string>) => {
    ws.setSelected(s);
    setRange(formatPageList(ws.pages.map((p, i) => (s.has(p.key) ? i : -1)).filter((i) => i >= 0)));
  };

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const source = await toSource(entry!);
      let outputs: OutputFile[];
      if (mode === 'single') {
        const plan = indices.map((page) => ({ source: 0, page }));
        const bytes = await runInWorker('assembleNew', { sources: [source], plan }, { signal, onProgress: progress });
        outputs = [makeOutput(outputName(entry!.name, `pages-${formatPageList(indices).replace(/\s/g, '')}`), bytes, 'pdf', { pageCount: plan.length })];
      } else {
        const stem = baseName(entry!.name);
        const parts = await runInWorker('split', { source, groups: indices.map((i) => [i]), names: indices.map((i) => `${stem}-page-${i + 1}.pdf`) }, { signal, onProgress: progress });
        outputs = parts.map((p) => makeOutput(p.name, p.bytes, 'pdf', { pageCount: p.pageCount }));
      }
      recordHistory(tool, [entry!], outputs);
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: indices.length ? `Extract ${pluralize(indices.length, 'page')}` : 'Extract pages', onClick: () => void apply(), disabled: !entry || indices.length === 0, hint: indices.length ? undefined : 'Select pages or type a range.' }}
      result={task.result ? <ResultPanel outputs={task.result} title="Pages extracted" zipName={`${baseName(entry?.name ?? 'pages')}-pages.zip`} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <>
          <PageRangeField value={range} onChange={setRange} pageCount={keys.length} label="Pages to extract" />
          <Field label="Output">
            <Segmented label="Output" value={mode} onChange={setMode} options={[{ value: 'single', label: 'One PDF' }, { value: 'separate', label: 'One file per page' }]} />
          </Field>
        </>
      }
    >
      <SelectionBar keys={keys} selected={ws.selected} onChange={onSelect} />
      <PageGrid pages={toGridPages(ws.pages, ws.ready)} selected={ws.selected} onSelect={onSelect} />
    </ToolShell>
  );
}
