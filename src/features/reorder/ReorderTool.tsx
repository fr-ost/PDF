import { ArrowDownToLine, ArrowUpToLine, ArrowUpDown, Undo2 } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageGrid } from '../../components/tool/PageGrid';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Button } from '../../components/ui/Button';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { outputName } from '../../utils/filenames';
import { usePageWorkspace } from '../shared/usePageWorkspace';
import { SelectionBar } from '../shared/SelectionBar';
import { toGridPages } from '../shared/pageTools';

export default function ReorderTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const ws = usePageWorkspace(files.entries);
  const task = useTask<OutputFile[]>();
  const entry = ws.ready[0];
  const keys = ws.pages.map((p) => p.key);

  const moveSelected = (where: 'start' | 'end') => {
    const sel = keys.filter((k) => ws.selected.has(k));
    const rest = keys.filter((k) => !ws.selected.has(k));
    ws.reorder(where === 'start' ? [...sel, ...rest] : [...rest, ...sel]);
  };

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const { files: used, plan } = ws.plan();
      const bytes = await runInWorker('assembleInPlace', { sources: await Promise.all(used.map(toSource)), plan }, { signal, onProgress: progress });
      const outputs = [makeOutput(outputName(entry!.name, 'reordered'), bytes, 'pdf', { pageCount: plan.length })];
      recordHistory(tool, [entry!], outputs);
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: 'Save new page order', onClick: () => void apply(), disabled: !entry || !ws.modified, hint: ws.modified ? 'Bookmarks and form fields are preserved.' : 'Drag pages to change the order.' }}
      result={task.result ? <ResultPanel outputs={task.result} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <div className="space-y-2">
          <p className="text-sm text-fg-muted">Drag pages, or select pages and move them together.</p>
          <Button className="w-full" icon={ArrowUpToLine} disabled={ws.selected.size === 0} onClick={() => moveSelected('start')}>Move selected to start</Button>
          <Button className="w-full" icon={ArrowDownToLine} disabled={ws.selected.size === 0} onClick={() => moveSelected('end')}>Move selected to end</Button>
          <Button className="w-full" icon={ArrowUpDown} onClick={() => ws.reorder([...keys].reverse())}>Reverse order</Button>
          <Button className="w-full" variant="ghost" icon={Undo2} disabled={!ws.modified} onClick={ws.reset}>Reset order</Button>
          <p className="pt-1 text-xs text-fg-subtle">Keyboard: focus a page, press Space to pick it up, arrow keys to move, Space to drop.</p>
        </div>
      }
    >
      <SelectionBar keys={keys} selected={ws.selected} onChange={ws.setSelected} />
      <PageGrid pages={toGridPages(ws.pages, ws.ready).map((p, i) => ({ ...p, label: `${i + 1} · page ${p.pageIndex + 1}` }))} selected={ws.selected} onSelect={ws.setSelected} sortable onReorder={ws.reorder} />
    </ToolShell>
  );
}
