/** Runs a cancellable background job and tracks its progress for the UI. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isCancelled } from '../pdf/errors';

export interface TaskContext {
  signal: AbortSignal;
  progress: (value: number | null, label?: string) => void;
}

export type TaskStatus = 'idle' | 'running' | 'success' | 'error';

export function useTask<R>() {
  const [status, setStatus] = useState<TaskStatus>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [label, setLabel] = useState<string | undefined>();
  const [result, setResult] = useState<R | undefined>();
  const [error, setError] = useState<unknown>();
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(async (fn: (ctx: TaskContext) => Promise<R>): Promise<R | undefined> => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setStatus('running');
    setProgress(null);
    setLabel(undefined);
    setError(undefined);
    setResult(undefined);
    try {
      const value = await fn({
        signal: ac.signal,
        progress: (v, l) => {
          if (ac.signal.aborted) return;
          setProgress(v);
          if (l !== undefined) setLabel(l);
        },
      });
      if (ac.signal.aborted) return undefined;
      setResult(value);
      setStatus('success');
      return value;
    } catch (err) {
      if (ac.signal.aborted || isCancelled(err)) {
        setStatus('idle');
        return undefined;
      }
      console.error('[Unique PDF] task failed', err);
      setError(err);
      setStatus('error');
      return undefined;
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setStatus('idle');
    setResult(undefined);
    setError(undefined);
    setProgress(null);
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return { status, progress, label, result, error, run, cancel, reset, running: status === 'running' };
}
