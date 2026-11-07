/** Renders one page at a given CSS width, with an overlay positioned in page points. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getDocumentProxy } from '../../pdf/renderers/documents';
import { renderPageToCanvas } from '../../pdf/renderers/render';
import { cn } from '../../utils/cn';
import { Spinner } from '../ui/Feedback';

export interface PageInfo {
  /** Displayed page size in points (after the page's own rotation). */
  width: number;
  height: number;
  /** CSS pixels per point. */
  scale: number;
  /** PDF.js viewport transform at scale 1 (user space → display, y-down). */
  transform: number[];
}

export function PageCanvas({
  docId,
  pageIndex,
  maxWidth,
  maxHeight,
  zoom,
  className,
  children,
  onInfo,
}: {
  docId: string;
  pageIndex: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Fixed CSS pixels per point; overrides maxWidth/maxHeight fitting. */
  zoom?: number;
  className?: string;
  children?: (info: PageInfo) => ReactNode;
  onInfo?: (info: PageInfo) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    (async () => {
      const doc = await getDocumentProxy(docId);
      if (!doc || controller.signal.aborted) return;
      const page = await doc.getPage(pageIndex + 1);
      const vp = page.getViewport({ scale: 1 });
      const scale = zoom ?? Math.min((maxWidth ?? 800) / vp.width, (maxHeight ?? Number.POSITIVE_INFINITY) / vp.height);
      if (controller.signal.aborted) return;
      const next = { width: vp.width, height: vp.height, scale, transform: vp.transform };
      setInfo(next);
      onInfo?.(next);
      // Debounce re-renders while zooming quickly.
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, info ? 120 : 0);
      });
      if (controller.signal.aborted || !canvasRef.current) return;
      const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
      await renderPageToCanvas(page, Math.min(scale * dpr, 6), { canvas: canvasRef.current, signal: controller.signal });
      if (!controller.signal.aborted) setLoading(false);
    })().catch(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, pageIndex, maxWidth, maxHeight, zoom]);

  const cssWidth = info ? info.width * info.scale : maxWidth;
  const cssHeight = info ? info.height * info.scale : undefined;
  return (
    <div className={cn('page-shadow relative bg-white', className)} style={{ width: cssWidth, height: cssHeight, minHeight: info ? undefined : 200 }}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-label={`Page ${pageIndex + 1}`} />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          <Spinner className="text-fg-subtle" />
        </div>
      ) : null}
      {info && children ? <div className="absolute inset-0">{children(info)}</div> : null}
    </div>
  );
}
