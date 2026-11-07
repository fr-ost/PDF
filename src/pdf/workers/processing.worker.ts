/**
 * Dedicated worker that runs all pdf-lib processing off the main thread so
 * the interface never freezes. One worker is created per job; cancelling a
 * job simply terminates its worker, which is always safe because original
 * files are never modified.
 */
import { serializeError } from '../errors';
import { collectTransferables } from './transfer';
import { workerMethods, type WorkerMethodName } from './methods';

interface RequestMessage {
  id: number;
  method: WorkerMethodName;
  args: unknown;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<RequestMessage>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const { id, method, args } = event.data;
  let lastReport = 0;
  const report = (value: number, label?: string) => {
    const now = Date.now();
    if (now - lastReport < 60 && value < 1) return;
    lastReport = now;
    scope.postMessage({ id, type: 'progress', value: Math.max(0, Math.min(1, value)), label });
  };
  try {
    const handler = workerMethods[method] as ((a: unknown, r: typeof report) => Promise<unknown>) | undefined;
    if (!handler) throw new Error(`Unknown operation: ${String(method)}`);
    const result = await handler(args, report);
    scope.postMessage({ id, type: 'result', result }, [...collectTransferables(result)]);
  } catch (err) {
    scope.postMessage({ id, type: 'error', error: serializeError(err) });
  }
};
