import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { FileListApi } from '../../hooks/useFileList';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, TextInput } from '../ui/Form';

/** Asks for the password of the first locked file in a file list. */
export function PasswordPrompt({ files }: { files: FileListApi }) {
  const locked = files.entries.find((e) => e.status === 'locked');
  const [password, setPassword] = useState('');
  useEffect(() => setPassword(''), [locked?.id]);
  if (!locked) return null;
  return (
    <Dialog
      open
      onClose={() => files.remove(locked.id)}
      title="Password required"
      description={`“${locked.name}” is protected. Enter its password to open it.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => files.remove(locked.id)}>
            Remove file
          </Button>
          <Button variant="primary" type="submit" form="pdf-password-form" disabled={!password}>
            Open
          </Button>
        </>
      }
    >
      <form
        id="pdf-password-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (password) files.unlock(locked.id, password);
        }}
        className="space-y-3"
      >
        <Field label="Password" htmlFor="pdf-password" error={locked.error ?? null}>
          <TextInput id="pdf-password" type="password" autoComplete="off" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!locked.error} />
        </Field>
        <p className="flex items-start gap-2 text-[12.5px] text-fg-subtle">
          <KeyRound size={14} className="mt-0.5 shrink-0" aria-hidden />
          The password is used only on this device to open the file. It is never stored or sent anywhere.
        </p>
      </form>
    </Dialog>
  );
}
