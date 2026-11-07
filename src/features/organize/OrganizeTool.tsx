import { useState } from 'react';
import { CopyMinus, RotateCcw, RotateCw, Trash2, Undo2, X } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageGrid } from '../../components/tool/PageGrid';
import { Dropzone } from '../../components/tool/Dropzone';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { SOURCE_COLORS, recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Button, IconButton } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Form';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { baseName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';
import { usePageWorkspace } from '../shared/usePageWorkspace';
import { SelectionBar } from '../shared/SelectionBar';
import { toGridPages } from '../shared/pageTools';

export default function OrganizeTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const ws = usePageWorkspace(files.entries);
  const task = useTask<OutputFile[]>();
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const keys = ws.pages.map((p) => p.key);
  const first = ws.ready[0];
  const defaultName = first ? `${baseName(first.name)}-organized` : 'organized';

  const run = (selectedOnly: boolean) =>
    task.run(async ({ signal, progress }) => {
      const list = selectedOnly ? ws.pages.filter((p) => ws.selected.has(p.key)) : ws.pages;
      const { files: used, plan } = ws.plan(list);
      const sources = await Promise.all(used.map(toSource));
      const bytes = await runInWorker(selectedOnly ? 'assembleNew' : 'assembleInPlace', { sources, plan }, { signal, onProgress: progress });
      const outputs = [makeOutput(`${selectedOnly ? `${defaultName}-selection` : name.trim() || defaultName}.pdf`, bytes, 'pdf', { pageCount: plan.length })];
      recordHistory(tool, used, outputs);
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: 'Save PDF', onClick: () => void run(false), disabled: ws.pages.length === 0, hint: `${pluralize(ws.pages.length, 'page')} from ${pluralize(ws.ready.length, 'file')}` }}
      result={task.result ? <ResultPanel outputs={task.result} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <>
          <div>
            <p className="mb-2 text-[13px] font-medium">Files</p>
            <ul className="space-y-1.5">
              {files.entries.map((e, i) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate" title={e.name}>{e.name}</span>
                  <IconButton icon={X} label={`Remove ${e.name}`} size="sm" variant="danger-ghost" onClick={() => files.remove(e.id)} />
                </li>
              ))}
            </ul>
            <Dropzone compact accept={['pdf']} multiple onFiles={(f) => void files.add(f)} className="mt-3" title="Add PDFs" />
          </div>
          <Field label="Output file name" htmlFor="org-name">
            <TextInput id="org-name" value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button className="w-full" icon={CopyMinus} disabled={ws.selected.size === 0 || task.running} onClick={() => void run(true)}>
            Extract selected as new PDF
          </Button>
        </>
      }
    >
      <SelectionBar keys={keys} selected={ws.selected} onChange={ws.setSelected}>
        <Button size="sm" variant="ghost" icon={RotateCcw} disabled={!ws.selected.size} onClick={() => ws.rotate(ws.selected, -90)}>Left</Button>
        <Button size="sm" variant="ghost" icon={RotateCw} disabled={!ws.selected.size} onClick={() => ws.rotate(ws.selected, 90)}>Right</Button>
        <Button size="sm" variant="ghost" icon={Trash2} disabled={!ws.selected.size} onClick={() => setConfirmDelete(true)}>Delete</Button>
        <Button size="sm" variant="ghost" icon={Undo2} disabled={!ws.modified} onClick={ws.reset}>Reset</Button>
      </SelectionBar>
      <PageGrid
        pages={toGridPages(ws.pages, ws.ready, { colors: SOURCE_COLORS }).map((p, i) => ({ ...p, label: `${i + 1}`, badge: p.rotation ? <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-fg">{p.rotation}°</span> : undefined }))}
        selected={ws.selected}
        onSelect={ws.setSelected}
        sortable
        onReorder={ws.reorder}
        actions={(p) => (
          <>
            <IconButton icon={RotateCw} label={`Rotate page ${p.label}`} size="sm" variant="solid" onClick={() => ws.rotate([p.key], 90)} />
            <IconButton icon={Trash2} label={`Delete page ${p.label}`} size="sm" variant="solid" onClick={() => ws.remove([p.key])} />
          </>
        )}
      />
      {ws.pages.length === 0 && ws.ready.length > 0 ? <p className="py-10 text-center text-sm text-fg-muted">All pages were removed. Use Reset to restore them.</p> : null}
      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          ws.remove(ws.selected);
          setConfirmDelete(false);
        }}
        title={`Delete ${pluralize(ws.selected.size, 'page')}?`}
        message="They will be removed from this workspace. You can bring them back with Reset."
        confirmLabel="Delete"
        tone="danger"
      />
    </ToolShell>
  );
}
