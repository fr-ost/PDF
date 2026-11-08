import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { FileUp, ImagePlus } from 'lucide-react';
import { cn } from '../../utils/cn';
import { ACCEPT_ATTR, type FileKind } from '../../services/file-service/files';
import { Button } from '../ui/Button';

export function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  return Array.from(dt.files ?? []);
}

/** Fanned paper sheets with a gradient tile — the drop target illustration. */
function DropArt({ over, image }: { over: boolean; image: boolean }) {
  const Icon = image ? ImagePlus : FileUp;
  const sheet = 'absolute top-3 h-[76px] w-[60px] rounded-xl border border-line bg-surface shadow-raised transition-transform duration-500 ease-[var(--ease-out-expo)] dark:bg-surface-2';
  const lines = (
    <div className="space-y-1.5 p-2.5 pt-4" aria-hidden>
      <div className="h-1 w-9 rounded-full bg-surface-3" />
      <div className="h-1 w-7 rounded-full bg-surface-3" />
      <div className="h-1 w-8 rounded-full bg-surface-3" />
    </div>
  );
  return (
    <div className="relative mx-auto h-[104px] w-[150px]" aria-hidden>
      <div className={sheet} style={{ left: 14, transform: over ? 'rotate(-18deg) translate(-14px,4px)' : 'rotate(-9deg)' }}>{lines}</div>
      <div className={sheet} style={{ right: 14, transform: over ? 'rotate(18deg) translate(14px,4px)' : 'rotate(9deg)' }}>{lines}</div>
      <div className="absolute left-1/2 top-1 -translate-x-1/2" style={{ animation: 'float 5s ease-in-out infinite' }}>
        <div className={cn('flex h-[68px] w-[68px] items-center justify-center rounded-[20px] bg-[image:var(--brand-gradient)] text-white shadow-[0_14px_30px_-10px_var(--glow)] ring-1 ring-white/25 transition-transform duration-500 ease-[var(--ease-spring)]', over && 'scale-110')}>
          <Icon size={28} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

export function Dropzone({
  accept,
  multiple,
  onFiles,
  title,
  hint,
  compact,
  variant = 'default',
  className,
  children,
}: {
  accept: FileKind[];
  multiple: boolean;
  onFiles: (files: File[]) => void;
  title?: string;
  hint?: ReactNode;
  compact?: boolean;
  variant?: 'default' | 'hero';
  className?: string;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const isImage = accept.length === 1 && accept[0] === 'image';
  const noun = isImage ? (multiple ? 'images' : 'an image') : accept.length > 1 ? 'files' : multiple ? 'PDF files' : 'a PDF file';

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    const files = filesFromDataTransfer(e.dataTransfer);
    if (files.length) onFiles(files);
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={onDrop}
      data-testid="dropzone"
      data-over={over || undefined}
      className={cn(
        'gradient-border on-hover relative flex flex-col items-center justify-center text-center transition-[background,border-color,box-shadow] duration-300',
        compact ? 'rounded-2xl border border-dashed px-4 py-5' : 'rounded-[28px] border-2 border-dashed px-6',
        !compact && (variant === 'hero' ? 'py-12' : 'py-16'),
        over ? 'border-transparent bg-primary-soft/60' : 'border-line-strong bg-surface/70 hover:border-transparent dark:bg-surface/50',
        variant === 'hero' && 'shadow-raised backdrop-blur-[2px]',
        className,
      )}
    >
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={accept.map((k) => ACCEPT_ATTR[k]).join(',')}
        multiple={multiple}
        aria-label={`Choose ${noun}`}
        data-testid="file-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      {children ?? (
        <>
          {!compact ? <DropArt over={over} image={isImage} /> : null}
          <p className={cn('font-semibold tracking-[-0.015em]', compact ? 'text-sm' : 'mt-5 text-[17px]')}>{over ? `Release to add ${noun}` : (title ?? `Drop ${noun} here`)}</p>
          {!compact ? <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-muted">{hint ?? 'or choose from your computer. Files stay on your device.'}</p> : null}
          <Button variant={compact ? 'secondary' : 'primary'} size={compact ? 'sm' : 'lg'} className={compact ? 'mt-2.5' : 'mt-6'} onClick={() => input.current?.click()}>
            {compact ? 'Add more' : multiple ? 'Choose files' : 'Choose file'}
          </Button>
        </>
      )}
    </div>
  );
}
