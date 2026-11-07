import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { FileUp, ImagePlus } from 'lucide-react';
import { cn } from '../../utils/cn';
import { ACCEPT_ATTR, type FileKind } from '../../services/file-service/files';
import { Button } from '../ui/Button';

export function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  return Array.from(dt.files ?? []);
}

export function Dropzone({
  accept,
  multiple,
  onFiles,
  title,
  hint,
  compact,
  className,
  children,
}: {
  accept: FileKind[];
  multiple: boolean;
  onFiles: (files: File[]) => void;
  title?: string;
  hint?: ReactNode;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const isImage = accept.length === 1 && accept[0] === 'image';
  const noun = isImage ? (multiple ? 'images' : 'an image') : multiple ? 'PDF files' : 'a PDF file';

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
      className={cn(
        'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors',
        compact ? 'px-4 py-5' : 'px-6 py-14',
        over ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface hover:border-fg-subtle/60',
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
          {!compact ? (
            <div className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-xl', over ? 'bg-primary text-primary-fg' : 'bg-primary-soft text-primary')}>
              {isImage ? <ImagePlus size={22} aria-hidden /> : <FileUp size={22} aria-hidden />}
            </div>
          ) : null}
          <p className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>{over ? `Drop ${noun} here` : (title ?? `Drop ${noun} here`)}</p>
          {!compact ? <p className="mt-1 text-sm text-fg-muted">{hint ?? 'or choose from your computer. Files stay on your device.'}</p> : null}
          <Button variant={compact ? 'secondary' : 'primary'} size={compact ? 'sm' : 'md'} className={compact ? 'mt-2' : 'mt-5'} onClick={() => input.current?.click()}>
            {compact ? 'Add more' : multiple ? 'Choose files' : 'Choose file'}
          </Button>
        </>
      )}
    </div>
  );
}
