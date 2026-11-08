/**
 * Modal dialog built on the native <dialog> element, which provides focus
 * trapping, Escape-to-close and an inert background for free.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button, IconButton } from './Button';

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; dismissible?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // React's autoFocus runs before showModal() (while the dialog is still
      // hidden), so focus the marked element here instead of the Close button.
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);
  // A press that starts inside the dialog and ends on the backdrop must not close it.
  const downOnBackdrop = useRef(false);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current && downOnBackdrop.current) onClose();
        downOnBackdrop.current = false;
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-pop open:animate-pop-in',
        size === 'sm' && 'max-w-sm',
        size === 'md' && 'max-w-md',
        size === 'lg' && 'max-w-2xl',
        size === 'xl' && 'max-w-4xl',
      )}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
            <div>
              <h2 className="text-[17px] font-semibold leading-6 tracking-tight">{title}</h2>
              {description ? <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{description}</p> : null}
            </div>
            {dismissible ? <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1" /> : null}
          </div>
          {children ? <div className="overflow-y-auto px-6 py-3">{children}</div> : null}
          {footer ? <div className="flex flex-wrap justify-end gap-2 px-6 pb-6 pt-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({ open, onCancel, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'primary' }: { open: boolean; onCancel: () => void; onConfirm: () => void; title: string; message: ReactNode; confirmLabel?: string; tone?: 'primary' | 'danger' }) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          {/* Destructive confirmations start on Cancel; others on the confirm button. */}
          <Button variant="secondary" onClick={onCancel} data-autofocus={tone === 'danger' ? true : undefined}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus={tone === 'danger' ? undefined : true}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-fg-muted">{message}</div>
    </Dialog>
  );
}
