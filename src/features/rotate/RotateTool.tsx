import { RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageGrid } from '../../components/tool/PageGrid';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Button, IconButton } from '../../components/ui/Button';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { outputName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';
import { usePageWorkspace } from '../shared/usePageWorkspace';
import { SelectionBar } from '../shared/SelectionBar';
import { toGridPages } from '../shared/pageTools';

export default function RotateTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const ws = usePageWorkspace(files.entries);
  const task = useTask<OutputFile[]>();
  const entry = ws.ready[0];
  const rotatedCount = ws.pages.filter((p) => p.rotation !== 0).length;
  const target = ws.selected.size > 0 ? ws.selected : ws.pages.map((p) => p.key);

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const { files: used, plan } = ws.plan();
      const bytes = await runInWorker('assembleInPlace', { sources: await Promise.all(used.map(toSource)), plan }, { signal, onProgress: progress });
      const outputs = [makeOutput(outputName(entry!.name, 'rotated'), bytes, 'pdf', { pageCount: plan.length })];
      recordHistory(tool, [entry!], outputs);
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: 'Save rotated PDF', onClick: () => void apply(), disabled: !entry || rotatedCount === 0, hint: rotatedCount ? `${pluralize(rotatedCount, 'page')} will be rotated` : 'Rotate at least one page.' }}
      result={task.result ? <ResultPanel outputs={task.result} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">{ws.selected.size > 0 ? `Rotate the ${pluralize(ws.selected.size, 'selected page')}:` : 'Rotate all pages:'}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button icon={RotateCcw} onClick={() => ws.rotate(target, -90)}>Left 90°</Button>
            <Button icon={RotateCw} onClick={() => ws.rotate(target, 90)}>Right 90°</Button>
          </div>
          <Button className="w-full" onClick={() => ws.rotate(target, 180)}>Rotate 180°</Button>
          <Button className="w-full" variant="ghost" icon={Undo2} disabled={rotatedCount === 0} onClick={ws.reset}>Reset all</Button>
          <p className="text-xs text-fg-subtle">Tip: hover a page to rotate it individually. Rotation is lossless — content is not re-rendered.</p>
        </div>
      }
    >
      <SelectionBar keys={ws.pages.map((p) => p.key)} selected={ws.selected} onChange={ws.setSelected} />
      <PageGrid
        pages={toGridPages(ws.pages, ws.ready).map((p) => ({ ...p, badge: p.rotation ? <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-fg">{p.rotation}°</span> : undefined }))}
        selected={ws.selected}
        onSelect={ws.setSelected}
        actions={(p) => (
          <>
            <IconButton icon={RotateCcw} label={`Rotate ${p.label} left`} size="sm" variant="solid" onClick={() => ws.rotate([p.key], -90)} />
            <IconButton icon={RotateCw} label={`Rotate ${p.label} right`} size="sm" variant="solid" onClick={() => ws.rotate([p.key], 90)} />
          </>
        )}
      />
    </ToolShell>
  );
}
