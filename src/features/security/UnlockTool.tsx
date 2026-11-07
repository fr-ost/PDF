import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { PageThumbnail } from '../../components/tool/PageThumbnail';
import { recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Card } from '../../components/ui/Card';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Field, TextInput } from '../../components/ui/Form';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import type { SecurityInfo } from '../../pdf/engines/security';
import { describeError } from '../../pdf/errors';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { outputName } from '../../utils/filenames';
import { formatBytes } from '../../utils/format';

export default function UnlockTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<OutputFile[]>();
  const [info, setInfo] = useState<SecurityInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [ownerPassword, setOwnerPassword] = useState('');
  const entry = files.ready[0];

  useEffect(() => {
    setInfo(null);
    setInfoError(null);
    if (!entry) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await runInWorker('securityInfo', { source: await toSource(entry) });
        if (!cancelled) setInfo(result);
      } catch (err) {
        if (!cancelled) setInfoError(describeError(err).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const restrictionsOnly = info?.encrypted && !info.needsPassword;
  const password = restrictionsOnly ? ownerPassword : entry?.password;

  const apply = () =>
    task.run(async ({ signal }) => {
      const source = await toSource(entry!);
      const bytes = await runInWorker('unlock', { source: { ...source, ...(password ? { password } : {}) } }, { signal });
      const outputs = [makeOutput(outputName(entry!.name, 'unlocked'), bytes, 'pdf', { pageCount: entry!.pageCount })];
      recordHistory(tool, [entry!], outputs);
      setOwnerPassword('');
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      emptyHint="You’ll be asked for the password. Unique PDF never guesses or bypasses passwords."
      primary={{ label: 'Remove password', onClick: () => void apply(), disabled: !entry || !info?.encrypted || !password }}
      result={task.result ? <ResultPanel outputs={task.result} title="Password removed" onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }}><Alert tone="info">The new copy opens without a password. Keep it somewhere safe.</Alert></ResultPanel> : null}
      options={
        <>
          {!info && !infoError ? <p className="flex items-center gap-2 text-sm text-fg-muted"><Spinner /> Checking protection…</p> : null}
          {infoError ? <Alert tone="danger">{infoError}</Alert> : null}
          {info && !info.encrypted ? <Alert tone="info" title="Not password-protected">This PDF isn’t encrypted, so there’s nothing to unlock.</Alert> : null}
          {info?.encrypted && info.needsPassword ? (
            <Alert tone="success" icon={LockOpen} title="Password accepted">The file opened with the password you entered. Removing protection creates an unencrypted copy.</Alert>
          ) : null}
          {restrictionsOnly ? (
            <>
              <Alert tone="info" icon={Lock} title="Restrictions set by the author">This PDF opens without a password but limits actions such as printing or copying. To remove the restrictions, enter the owner (permissions) password.</Alert>
              <Field label="Owner password" htmlFor="owner-password">
                <TextInput id="owner-password" type="password" autoComplete="off" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} />
              </Field>
            </>
          ) : null}
          {info?.encrypted ? <p className="text-xs text-fg-subtle">Encryption: {info.algorithm}. Only remove protection from documents you own or are authorised to change.</p> : null}
        </>
      }
    >
      {entry ? (
        <Card className="flex items-center gap-5 p-5">
          <div className="w-24 shrink-0"><PageThumbnail docId={entry.id} pageIndex={0} width={96} /></div>
          <div className="min-w-0">
            <p className="truncate font-medium">{entry.name}</p>
            <p className="text-sm text-fg-muted">{formatBytes(entry.size)}</p>
          </div>
        </Card>
      ) : null}
    </ToolShell>
  );
}
