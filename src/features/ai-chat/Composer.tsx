import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface ComposerHandle {
  focus: () => void;
}

const MAX_LENGTH = 2000;

/** Auto-growing message box. Enter sends, Shift+Enter adds a line, Escape stops an answer. */
export const Composer = forwardRef<ComposerHandle, { disabled: boolean; busy: boolean; placeholder: string; onSend: (text: string) => void; onStop: () => void }>(function Composer({ disabled, busy, placeholder, onSend, onStop }, ref) {
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }), []);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  const send = () => {
    const value = text.trim();
    if (!value || disabled || busy) return;
    onSend(value);
    setText('');
  };

  return (
    <form
      className="shrink-0 border-t border-line bg-surface/80 p-3 backdrop-blur-sm sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className={cn('flex items-end gap-2 rounded-2xl border bg-surface-2/50 py-1.5 pl-4 pr-1.5 transition-[border-color,box-shadow] duration-200 dark:bg-surface-2/40', disabled ? 'border-line opacity-70' : 'border-line-strong/70 focus-within:border-primary focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_12%,transparent)]')}>
        <textarea
          ref={area}
          rows={1}
          value={text}
          maxLength={MAX_LENGTH}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message Unique AI"
          data-testid="chat-input"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            } else if (e.key === 'Escape' && busy) {
              e.preventDefault();
              onStop();
            }
          }}
          className="max-h-[168px] min-h-[24px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
        />
        {busy ? (
          <button type="button" onClick={onStop} aria-label="Stop answering" data-testid="chat-stop" className="btn-press grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fg text-canvas transition-transform">
            <Square size={13} fill="currentColor" aria-hidden />
          </button>
        ) : (
          <button type="submit" disabled={disabled || !text.trim()} aria-label="Send" data-testid="chat-send" className="btn-primary btn-press grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white disabled:opacity-40 disabled:shadow-none">
            <ArrowUp size={17} strokeWidth={2.4} aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-fg-subtle">Unique AI can make mistakes. Check important details in the document.</p>
    </form>
  );
});
