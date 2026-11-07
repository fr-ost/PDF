/** Lazily rendered page thumbnail (renders only when scrolled into view). */
import { memo, useEffect, useRef, useState } from 'react';
import { FileWarning } from 'lucide-react';
import { getDocumentProxy } from '../../pdf/renderers/documents';
import { getCachedThumbnail, renderThumbnail } from '../../pdf/renderers/thumbnails';
import { cn } from '../../utils/cn';

export const THUMB_WIDTH = 168;

export const PageThumbnail = memo(function PageThumbnail({ docId, pageIndex, rotation = 0, width = THUMB_WIDTH, className, alt }: { docId: string; pageIndex: number; rotation?: number; width?: number; className?: string; alt?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | undefined>(() => getCachedThumbnail(docId, pageIndex, width));
  const [ratio, setRatio] = useState(1.414);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (url) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (items) => {
        if (!items.some((i) => i.isIntersecting)) return;
        observer.disconnect();
        const docPromise = getDocumentProxy(docId);
        if (!docPromise) return;
        docPromise
          .then((doc) => renderThumbnail(docId, doc, pageIndex, width))
          .then((u) => !cancelled && setUrl(u))
          .catch(() => !cancelled && setFailed(true));
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [docId, pageIndex, width, url]);

  const quarter = ((rotation % 360) + 360) % 360;
  const sideways = quarter === 90 || quarter === 270;
  const boxRatio = sideways ? 1 / ratio : ratio;

  return (
    <div ref={ref} className={cn('relative flex w-full items-center justify-center overflow-hidden', className)} style={{ aspectRatio: `1 / ${boxRatio}` }}>
      {url ? (
        <img
          src={url}
          alt={alt ?? `Page ${pageIndex + 1}`}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth) setRatio(img.naturalHeight / img.naturalWidth);
          }}
          className="page-shadow absolute bg-white transition-transform duration-200"
          style={
            sideways
              ? { width: `${(1 / boxRatio) * 100}%`, transform: `rotate(${quarter}deg)` }
              : { width: '100%', transform: quarter ? `rotate(${quarter}deg)` : undefined }
          }
        />
      ) : failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-sm bg-surface-2 text-fg-subtle">
          <FileWarning size={20} aria-hidden />
          <span className="text-[11px]">Preview unavailable</span>
        </div>
      ) : (
        <div className="h-full w-full animate-pulse rounded-sm bg-surface-2" />
      )}
    </div>
  );
});
