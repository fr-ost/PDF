import { useState } from 'react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageGrid } from '../../components/tool/PageGrid';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { PageRangeField, recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { parsePageRanges, formatPageList } from '../../pdf/pageRanges';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { outputName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';
import { usePageWorkspace } from '../shared/usePageWorkspace';
import { SelectionBar } from '../shared/SelectionBar';
import { toGridPages } from '../shared/pageTools';

export default function DeletePagesTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const ws = usePageWorkspace(files.entries);
  const task = useTask<OutputFile[]>();
  const [confirm, setConfirm] = useState(false);
  const [range, setRange] = useState('');
  const entry = ws.ready[0];
  const keys = ws.pages.map((p) => p.key);
  const marked = ws.selected;
  const remaining = ws.pages.length - marked.size;

  const applyRange = () => {
    const r = parsePageRanges(range, keys.length);
    if (r.ok) ws.setSelected(new Set(r.pages.map((i) => keys[i]!)));
  };

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const kept = ws.pages.filter((p) => !marked.has(p.key));
      const { files: used, plan } = ws.plan(kept);
      const bytes = await runInWorker('assembleInPlace', { sources: await Promise.all(used.map(toSource)), plan }, { signal, onProgress: progress });
      const outputs = [makeOutput(outputName(entry!.name, 'edited'), bytes, 'pdf', { pageCount: plan.length })];
      recordHistory(tool, [entry!], outputs);
      return outputs;
    });

  const markedIndices = ws.pages.map((p, i) => (marked.has(p.key) ? i : -1)).filter((i) => i >= 0);

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{
        label: marked.size ? `Delete ${pluralize(marked.size, 'page')}` : 'Delete pages',
        tone: 'danger',
        onClick: () => setConfirm(true),
        disabled: !entry || marked.size === 0 || remaining === 0,
        hint: remaining === 0 ? 'At least one page must remain.' : marked.size ? `${pluralize(remaining, 'page')} will remain` : 'Click pages to mark them for deletion.',
      }}
      result={task.result ? <ResultPanel outputs={task.result} title="Pages deleted" onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <>
          <div className="space-y-2">
            <PageRangeField value={range} onChange={setRange} pageCount={keys.length} label="Mark pages by number" />
            <Button size="sm" onClick={applyRange} disabled={!range.trim()}>Mark these pages</Button>
          </div>
          <Alert tone="info">Deleted pages are removed from the file completely, including their text and images. Your original file is not changed.</Alert>
        </>
      }
    >
      <SelectionBar keys={keys} selected={ws.selected} onChange={ws.setSelected} />
      <PageGrid
        pages={toGridPages(ws.pages, ws.ready).map((p) => (marked.has(p.key) ? { ...p, dimmed: true, badge: <span className="rounded bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">Delete</span> } : p))}
        selected={marked}
        onSelect={ws.setSelected}
      />
      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void apply();
        }}
        title={`Delete ${pluralize(marked.size, 'page')}?`}
        message={<>Pages {formatPageList(markedIndices)} will be removed from the new PDF. {pluralize(remaining, 'page')} will remain. Your original file stays unchanged.</>}
        confirmLabel="Delete pages"
        tone="danger"
      />
    </ToolShell>
  );
}
