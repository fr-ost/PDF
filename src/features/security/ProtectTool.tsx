import { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { PageThumbnail } from '../../components/tool/PageThumbnail';
import { recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Card } from '../../components/ui/Card';
import { IconButton } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { Checkbox, Field, Select, TextInput } from '../../components/ui/Form';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import type { PermissionSettings } from '../../pdf/engines/security';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { outputName } from '../../utils/filenames';
import { formatBytes, pluralize } from '../../utils/format';
import { cn } from '../../utils/cn';

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 6) score = Math.min(score, 1);
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][s]! };
}

const PERMISSION_LABELS: [keyof Omit<PermissionSettings, 'printing'>, string][] = [
  ['copying', 'Copy text and images'],
  ['modifying', 'Edit the document'],
  ['annotating', 'Add comments and annotations'],
  ['fillingForms', 'Fill in form fields'],
  ['documentAssembly', 'Insert, rotate or delete pages'],
  ['contentAccessibility', 'Accessibility tools (screen readers)'],
];

export default function ProtectTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<OutputFile[]>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [perms, setPerms] = useState<PermissionSettings>({ printing: 'high', copying: true, modifying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true });
  const entry = files.ready[0];
  const strength = passwordStrength(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const tooLong = new TextEncoder().encode(password).length > 127;

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      progress(null, 'Encrypting with AES-256');
      const bytes = await runInWorker('protect', { source: await toSource(entry!), options: { userPassword: password, ...(ownerPassword ? { ownerPassword } : {}), permissions: perms } }, { signal });
      const outputs = [makeOutput(outputName(entry!.name, 'protected'), bytes, 'pdf', { pageCount: entry!.pageCount })];
      recordHistory(tool, [entry!], outputs);
      setPassword('');
      setConfirm('');
      setOwnerPassword('');
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: 'Protect PDF', onClick: () => void apply(), disabled: !entry || !password || password !== confirm || tooLong, hint: 'Encryption: AES-256' }}
      result={
        task.result ? (
          <ResultPanel outputs={task.result} title="Your PDF is protected" onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }}>
            <Alert tone="warning" title="Keep your password safe">Unique PDF does not store your password and cannot recover it. Without it, the protected file can’t be opened.</Alert>
          </ResultPanel>
        ) : null
      }
      options={
        <>
          <Field label="Password" htmlFor="pw" error={tooLong ? 'Passwords can be at most 127 bytes.' : null}>
            <div className="relative">
              <TextInput id="pw" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" data-testid="password" />
              <IconButton icon={show ? EyeOff : Eye} label={show ? 'Hide password' : 'Show password'} size="sm" className="absolute right-1 top-1" onClick={() => setShow(!show)} />
            </div>
          </Field>
          {password ? (
            <div className="-mt-3 flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className={cn('h-1 flex-1 rounded-full', i <= strength.score ? (strength.score <= 1 ? 'bg-danger' : strength.score === 2 ? 'bg-warning' : 'bg-success') : 'bg-surface-3')} />
                ))}
              </div>
              <span className="text-xs text-fg-muted">{strength.label}</span>
            </div>
          ) : null}
          <Field label="Confirm password" htmlFor="pw2" error={mismatch ? 'Passwords don’t match.' : null}>
            <TextInput id="pw2" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={mismatch} data-testid="password-confirm" />
          </Field>
          <details className="group rounded-lg border border-line">
            <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium">Permissions (optional)</summary>
            <div className="space-y-3 border-t border-line p-3">
              <Field label="Printing" htmlFor="perm-print">
                <Select id="perm-print" value={perms.printing} onChange={(e) => setPerms({ ...perms, printing: e.target.value as PermissionSettings['printing'] })}>
                  <option value="high">Allowed (high quality)</option>
                  <option value="low">Low resolution only</option>
                  <option value="none">Not allowed</option>
                </Select>
              </Field>
              {PERMISSION_LABELS.map(([key, label]) => (
                <Checkbox key={key} label={label} checked={perms[key]} onChange={(v) => setPerms({ ...perms, [key]: v })} />
              ))}
              <Field label="Permissions password" htmlFor="owner-pw" hint="Optional. Needed to change permissions later. If empty, a random one is generated so restrictions can’t be lifted with the open password.">
                <TextInput id="owner-pw" type="password" autoComplete="new-password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} />
              </Field>
              <p className="text-xs text-fg-subtle">Permissions are respected by standard PDF apps but are not a strong security barrier. The open password is what keeps the content private.</p>
            </div>
          </details>
        </>
      }
    >
      {entry ? (
        <Card className="flex items-center gap-5 p-5">
          <div className="w-24 shrink-0"><PageThumbnail docId={entry.id} pageIndex={0} width={96} /></div>
          <div className="min-w-0">
            <p className="truncate font-medium">{entry.name}</p>
            <p className="text-sm text-fg-muted">{formatBytes(entry.size)} · {pluralize(entry.pageCount ?? 0, 'page')}</p>
            <p className="mt-3 flex items-start gap-2 text-sm text-fg-muted"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />The file is encrypted with AES-256 on your device. Your password never leaves this tab.</p>
          </div>
        </Card>
      ) : null}
    </ToolShell>
  );
}
