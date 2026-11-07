import { useState } from 'react';
import { ArrowDownAZ } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { Dropzone } from '../../components/tool/Dropzone';
import { FileGrid } from '../../components/tool/FileGrid';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Form';
import { Alert } from '../../components/ui/Feedback';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { baseName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';

export default function MergeTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<OutputFile[]>();
  const [name, setName] = useState('');
  const ready = files.ready;
  const totalPages = ready.reduce((n, e) => n + (e.pageCount ?? 0), 0);
  const defaultName = ready[0] ? `${baseName(ready[0].name)}-merged` : 'merged';

  const merge = () =>
    task.run(async ({ signal, progress }) => {
      const sources = await Promise.all(ready.map(toSource));
      const plan = ready.flatMap((entry, source) => Array.from({ length: entry.pageCount ?? 0 }, (_, page) => ({ source, page })));
      const bytes = await runInWorker('assembleNew', { sources, plan }, { signal, onProgress: progress });
      const outputs = [makeOutput(`${name.trim() || defaultName}.pdf`, bytes, 'pdf', { pageCount: plan.length })];
      recordHistory(tool, ready, outputs);
      return outputs;
    });

  const sortByName = () => files.setOrder([...files.entries].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((e) => e.id));

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      emptyHint="Select two or more PDFs. You can reorder them before merging."
      primary={{ label: ready.length >= 2 ? `Merge ${pluralize(ready.length, 'file')}` : 'Merge PDFs', onClick: () => void merge(), disabled: ready.length < 2, hint: ready.length < 2 ? 'Add at least two PDF files.' : `${pluralize(totalPages, 'page')} in total` }}
      result={task.result ? <ResultPanel outputs={task.result} title="Your PDFs were merged" onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <>
          <Field label="Output file name" htmlFor="merge-name" hint="“.pdf” is added automatically.">
            <TextInput id="merge-name" value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Alert tone="info">Pages keep their original size and orientation. Bookmarks and interactive form fields from the source files are not carried over.</Alert>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Drag files to set the order. The first file comes first.</p>
        <Button size="sm" variant="ghost" icon={ArrowDownAZ} onClick={sortByName}>
          Sort by name
        </Button>
      </div>
      <FileGrid files={files} />
      <Dropzone compact accept={['pdf']} multiple onFiles={(f) => void files.add(f)} className="mt-4" title="Drop more PDFs here" />
    </ToolShell>
  );
}
