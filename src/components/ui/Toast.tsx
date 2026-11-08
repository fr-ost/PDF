import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../utils/cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  duration: number;
}
interface ToastApi {
  show(message: string, tone?: ToastTone): void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      const duration = tone === 'error' ? 7000 : 4000;
      setItems((list) => [...list.slice(-3), { id, tone, message, duration }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(380px,calc(100%-2.5rem))] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info;
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="glass pointer-events-auto relative flex animate-pop-in items-start gap-3 overflow-hidden rounded-2xl border border-line px-4 py-3 text-sm shadow-pop"
            >
              <Icon size={18} className={cn('mt-px shrink-0', t.tone === 'success' && 'text-success', t.tone === 'error' && 'text-danger', t.tone === 'info' && 'text-primary')} aria-hidden />
              <p className="min-w-0 flex-1 leading-5">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} className="-m-1 rounded-md p-1 text-fg-subtle hover:text-fg" aria-label="Dismiss notification">
                <X size={14} />
              </button>
              <span
                aria-hidden
                className={cn('absolute bottom-0 left-0 h-0.5 origin-left', t.tone === 'success' ? 'bg-success' : t.tone === 'error' ? 'bg-danger' : 'bg-primary')}
                style={{ width: '100%', animation: `toast-life ${t.duration}ms linear both` }}
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
