import { useMemo, useState } from 'react';
import { Scissors } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageGrid } from '../../components/tool/PageGrid';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { PageRangeField, recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Field, NumberInput } from '../../components/ui/Form';
import { Alert } from '../../components/ui/Feedback';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { computeSplitGroups, formatPageList, type SplitMode } from '../../pdf/pageRanges';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { baseName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';
import { cn } from '../../utils/cn';
import { usePageWorkspace } from '../shared/usePageWorkspace';
import { toGridPages } from '../shared/pageTools';

type ModeKind = SplitMode['kind'];
const MODES: { value: ModeKind; label: string; description: string }[] = [
  { value: 'every-page', label: 'Every page', description: 'Each page becomes its own PDF.' },
  { value: 'ranges', label: 'Custom ranges', description: 'Each range you type becomes one PDF.' },
  { value: 'fixed-size', label: 'Equal parts', description: 'Split every N pages.' },
  { value: 'split-before', label: 'At selected pages', description: 'Click pages where a new PDF should begin.' },
];

export function splitFileName(stem: string, group: number[]): string {
  const list = formatPageList(group).replace(/\s/g, '');
  return group.length === 1 ? `${stem}-page-${group[0]! + 1}.pdf` : `${stem}-pages-${list.replace(/,/g, '_')}.pdf`;
}

export default function SplitTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const ws = usePageWorkspace(files.entries);
  const task = useTask<OutputFile[]>();
  const [kind, setKind] = useState<ModeKind>('every-page');
  const [ranges, setRanges] = useState('');
  const [size, setSize] = useState(2);
  const entry = ws.ready[0];
  const pageCount = entry?.pageCount ?? 0;
  const keys = ws.pages.map((p) => p.key);
  const cutPages = ws.pages.map((p, i) => (ws.selected.has(p.key) ? i : -1)).filter((i) => i > 0);

  const mode: SplitMode = kind === 'ranges' ? { kind, ranges } : kind === 'fixed-size' ? { kind, size } : kind === 'split-before' ? { kind, pages: cutPages } : { kind };
  const groups = useMemo(() => (pageCount ? computeSplitGroups(mode, pageCount) : null), [pageCount, kind, ranges, size, cutPages.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = groups?.ok ? groups.groups : [];
  const stem = baseName(entry?.name ?? 'document');

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const parts = await runInWorker('split', { source: await toSource(entry!), groups: valid, names: valid.map((g) => splitFileName(stem, g)) }, { signal, onProgress: progress });
      const outputs = parts.map((p) => makeOutput(p.name, p.bytes, 'pdf', { pageCount: p.pageCount }));
      recordHistory(tool, [entry!], outputs);
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: valid.length ? `Split into ${pluralize(valid.length, 'file')}` : 'Split PDF', onClick: () => void apply(), disabled: !entry || valid.length === 0 || (valid.length === 1 && valid[0]!.length === pageCount), hint: groups && !groups.ok && (kind !== 'ranges' || ranges.trim()) ? groups.error : undefined }}
      result={task.result ? <ResultPanel outputs={task.result} title="Your PDF was split" zipName={`${stem}-split.zip`} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[13px] font-medium">Split method</legend>
            {MODES.map((m) => (
              <label key={m.value} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors', kind === m.value ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-2')}>
                <input type="radio" name="split-mode" className="mt-0.5 accent-[var(--color-primary)]" checked={kind === m.value} onChange={() => setKind(m.value)} />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-fg-muted">{m.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {kind === 'ranges' ? <PageRangeField value={ranges} onChange={setRanges} pageCount={pageCount} label="Ranges" hint="Each comma-separated range becomes one file, e.g. 1-3, 4-6, 7-" /> : null}
          {kind === 'fixed-size' ? (
            <Field label="Pages per file" htmlFor="split-size">
              <NumberInput id="split-size" value={size} min={1} max={Math.max(1, pageCount)} onChange={(v) => setSize(Math.round(v))} />
            </Field>
          ) : null}
          {valid.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Result preview</p>
              <ol className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-2 text-xs" aria-label="Files to be created">
                {valid.slice(0, 200).map((g, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate text-fg-muted">File {i + 1}</span>
                    <span className="tabular-nums">{g.length === 1 ? `page ${g[0]! + 1}` : `pages ${formatPageList(g)}`}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {valid.length > 1 ? <Alert tone="info">You’ll be able to download all files as a ZIP or save them one by one.</Alert> : null}
        </>
      }
    >
      {kind === 'split-before' ? <p className="mb-3 text-sm text-fg-muted">Click the pages where a new file should start. The first page always starts the first file.</p> : null}
      <PageGrid
        pages={toGridPages(ws.pages, ws.ready).map((p, i) => {
          const groupIndex = valid.findIndex((g) => g.includes(i));
          const startsGroup = groupIndex > 0 && valid[groupIndex]![0] === i;
          return {
            ...p,
            badgeKey: `${groupIndex}:${startsGroup}:${valid.length > 1}`,
            badge: groupIndex >= 0 && valid.length > 1 ? <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', startsGroup ? 'bg-primary text-primary-fg' : 'bg-surface/90 text-fg-muted shadow-sm')}>{startsGroup ? <Scissors size={10} className="mr-0.5 inline" aria-hidden /> : null}File {groupIndex + 1}</span> : undefined,
          };
        })}
        selected={kind === 'split-before' ? ws.selected : new Set()}
        onSelect={kind === 'split-before' ? (s) => ws.setSelected(new Set([...s].filter((k) => k !== keys[0]))) : undefined}
        selectable={kind === 'split-before'}
      />
    </ToolShell>
  );
}
