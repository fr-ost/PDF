/** Typed RPC client for the processing worker. */
import { PdfToolError, deserializeError, type SerializedError } from '../errors';
import type { WorkerArgs, WorkerMethodName, WorkerResult } from './methods';
import { collectTransferables } from './transfer';

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (value: number, label?: string) => void;
}

type WorkerMessage =
  | { id: number; type: 'progress'; value: number; label?: string }
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; error: SerializedError };

let nextId = 1;

export function createProcessingWorker(): Worker {
  return new Worker(new URL('./processing.worker.ts', import.meta.url), { type: 'module', name: 'unique-pdf-processing' });
}

export function runInWorker<M extends WorkerMethodName>(method: M, args: WorkerArgs<M>, options: RunOptions = {}): Promise<WorkerResult<M>> {
  const { signal, onProgress } = options;
  return new Promise<WorkerResult<M>>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PdfToolError('CANCELLED', 'Processing was cancelled.'));
      return;
    }
    const id = nextId++;
    const worker = createProcessingWorker();
    let settled = false;
    const finish = () => {
      settled = true;
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      finish();
      reject(new PdfToolError('CANCELLED', 'Processing was cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.id !== id || settled) return;
      if (msg.type === 'progress') {
        onProgress?.(msg.value, msg.label);
      } else if (msg.type === 'result') {
        finish();
        resolve(msg.result as WorkerResult<M>);
      } else {
        finish();
        reject(deserializeError(msg.error));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (settled) return;
      finish();
      const text = event.message || '';
      reject(/memory|allocation/i.test(text) ? new PdfToolError('OUT_OF_MEMORY', 'The browser ran out of memory.') : new PdfToolError('UNKNOWN', text || 'The processing worker stopped unexpectedly.'));
    };
    worker.onmessageerror = () => {
      if (settled) return;
      finish();
      reject(new PdfToolError('UNKNOWN', 'Could not transfer data from the processing worker.'));
    };
    worker.postMessage({ id, method, args }, [...collectTransferables(args)]);
  });
}
