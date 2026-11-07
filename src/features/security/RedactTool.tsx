/**
 * Secure redaction workflow.
 *
 * 1. The user marks areas (drawing boxes, searching text, or whole pages).
 * 2. Each affected page is rendered with PDF.js and the boxes are burned into
 *    the image; the original page content is then removed from the file by
 *    the worker (see engines/redact.ts).
 * 3. The exported file is re-opened and its text is extracted to verify that
 *    nothing remains inside the redacted areas.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CheckCircle2, FileX2, MousePointer2, Search, ShieldAlert, Square, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageCanvas, type PageInfo } from '../../components/tool/PageCanvas';
import { PageThumbnail } from '../../components/tool/PageThumbnail';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Checkbox, Field, Segmented, Select, TextInput } from '../../components/ui/Form';
import { useTask } from '../../hooks/useTask';
import { useHotkeys } from '../../hooks/useHotkeys';
import { runInWorker } from '../../pdf/workers/client';
import { PdfToolError } from '../../pdf/errors';
import { getDocumentProxy } from '../../pdf/renderers/documents';
import { destroyPdfDocument, openPdfDocument, type PDFDocumentProxy } from '../../pdf/renderers/pdfjs';
import { canvasToBlob, releaseCanvas, renderPageToCanvas, safeScale } from '../../pdf/renderers/render';
import { boxIntersects, findTextBoxes, partitionTextItems, textItemGeometry, type RedactionBox, type TextItemLike } from '../../pdf/redaction';
import type { RedactedPageInput } from '../../pdf/engines/redact';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { outputName } from '../../utils/filenames';
import { formatPageList } from '../../pdf/pageRanges';
import { pluralize } from '../../utils/format';
import { cn } from '../../utils/cn';

interface Verification {
  leaks: number;
  checkedPages: number;
  termsOnOtherPages: { term: string; pages: number[] }[];
}

async function pageTextItems(doc: PDFDocumentProxy, index: number): Promise<{ items: TextItemLike[]; transform: number[]; width: number; height: number }> {
  const page = await doc.getPage(index + 1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items.filter((i): i is typeof i & TextItemLike => 'str' in i && 'transform' in i) as unknown as TextItemLike[];
  return { items, transform: viewport.transform, width: viewport.width, height: viewport.height };
}

export default function RedactTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<{ outputs: OutputFile[]; verification: Verification }>();
  const [boxes, setBoxes] = useState<RedactionBox[]>([]);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<'draw' | 'select'>('draw');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [containerWidth, setContainerWidth] = useState(720);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ query: string; boxes: Omit<RedactionBox, 'id' | 'source'>[] } | null>(null);
  const [terms, setTerms] = useState<string[]>([]);
  const [fill, setFill] = useState<'#000000' | '#ffffff'>('#000000');
  const [dpi, setDpi] = useState(200);
  const [keepText, setKeepText] = useState(true);
  const [sanitize, setSanitize] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState(false);
  const drag = useRef<{ id: string; startX: number; startY: number; origin?: RedactionBox; kind: 'create' | 'move' } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const entry = files.ready[0];
  const pageCount = entry?.pageCount ?? 0;

  useEffect(() => {
    setBoxes([]);
    setTerms([]);
    setFound(null);
    setPage(0);
  }, [entry?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth((w) => (Math.abs(w - el.clientWidth) >= 16 ? el.clientWidth : w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [entry]);

  const scale = zoom === 'fit' ? (pageInfo ? Math.max(0.2, Math.min(3, (containerWidth - 48) / pageInfo.width)) : 1) : zoom;
  const pageBoxes = boxes.filter((b) => b.page === page);
  const redactedPages = useMemo(() => [...new Set(boxes.map((b) => b.page))].sort((a, b) => a - b), [boxes]);

  useHotkeys(
    {
      delete: () => selectedId && setBoxes((bs) => bs.filter((b) => b.id !== selectedId)),
      backspace: () => selectedId && setBoxes((bs) => bs.filter((b) => b.id !== selectedId)),
      escape: () => setSelectedId(null),
      pagedown: () => setPage((p) => Math.min(pageCount - 1, p + 1)),
      pageup: () => setPage((p) => Math.max(0, p - 1)),
    },
    !!entry,
  );

  const point = (e: ReactPointerEvent<SVGElement>, info: PageInfo): [number, number] => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const r = svg.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * info.width, ((e.clientY - r.top) / r.height) * info.height];
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>, info: PageInfo) => {
    if (e.button !== 0) return;
    if (mode === 'select') {
      setSelectedId(null);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = point(e, info);
    const id = crypto.randomUUID();
    setBoxes((bs) => [...bs, { id, page, x, y, w: 0, h: 0, source: 'manual' }]);
    drag.current = { id, startX: x, startY: y, kind: 'create' };
  };
  const onBoxDown = (e: ReactPointerEvent<SVGRectElement>, box: RedactionBox, info: PageInfo) => {
    if (mode !== 'select') return;
    e.stopPropagation();
    e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
    setSelectedId(box.id);
    const [x, y] = point(e, info);
    drag.current = { id: box.id, startX: x, startY: y, origin: box, kind: 'move' };
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>, info: PageInfo) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = point(e, info);
    setBoxes((bs) =>
      bs.map((b) => {
        if (b.id !== d.id) return b;
        if (d.kind === 'move' && d.origin) return { ...b, x: d.origin.x + x - d.startX, y: d.origin.y + y - d.startY };
        return { ...b, x: Math.min(x, d.startX), y: Math.min(y, d.startY), w: Math.abs(x - d.startX), h: Math.abs(y - d.startY) };
      }),
    );
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'create') setBoxes((bs) => bs.filter((b) => b.id !== d.id || (b.w >= 2 && b.h >= 2)));
  };

  const markWholePage = () => {
    if (!pageInfo) return;
    setBoxes((bs) => [...bs.filter((b) => b.page !== page || b.source !== 'page'), { id: crypto.randomUUID(), page, x: 0, y: 0, w: pageInfo.width, h: pageInfo.height, source: 'page' }]);
  };

  const search = async () => {
    const doc = entry ? await getDocumentProxy(entry.id) : undefined;
    if (!doc || !query.trim()) return;
    setSearching(true);
    try {
      const results: Omit<RedactionBox, 'id' | 'source'>[] = [];
      for (let i = 0; i < doc.numPages; i++) {
        const { items, transform } = await pageTextItems(doc, i);
        for (const b of findTextBoxes(items, query, transform, { caseSensitive, wholeWord })) results.push({ page: i, ...b });
      }
      setFound({ query: query.trim(), boxes: results });
    } finally {
      setSearching(false);
    }
  };

  const addFound = () => {
    if (!found) return;
    setBoxes((bs) => [...bs, ...found.boxes.map((b) => ({ ...b, id: crypto.randomUUID(), source: 'search' as const }))]);
    setTerms((t) => [...new Set([...t, found.query])]);
    if (found.boxes[0]) setPage(found.boxes[0].page);
    setFound(null);
    setQuery('');
  };

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const doc = await getDocumentProxy(entry!.id);
      if (!doc) throw new PdfToolError('UNKNOWN', 'The document is no longer open. Please add it again.');
      const inputs: RedactedPageInput[] = [];
      for (let n = 0; n < redactedPages.length; n++) {
        if (signal.aborted) throw new PdfToolError('CANCELLED', 'Cancelled');
        const index = redactedPages[n]!;
        progress((n / redactedPages.length) * 0.7, `Flattening page ${index + 1}`);
        const pdfPage = await doc.getPage(index + 1);
        const vp = pdfPage.getViewport({ scale: 1 });
        const { scale: renderScale } = safeScale(pdfPage, dpi / 72);
        const { canvas } = await renderPageToCanvas(pdfPage, renderScale, { signal });
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = fill;
        const pageBoxList = boxes.filter((b) => b.page === index);
        for (const b of pageBoxList) {
          // Expand by a pixel so anti-aliased glyph edges never peek out.
          ctx.fillRect(Math.floor(b.x * renderScale) - 1, Math.floor(b.y * renderScale) - 1, Math.ceil(b.w * renderScale) + 2, Math.ceil(b.h * renderScale) + 2);
        }
        const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
        releaseCanvas(canvas);
        const textItems = keepText ? partitionTextItems((await pageTextItems(doc, index)).items, pageBoxList, vp.transform, vp.height).keep : [];
        pdfPage.cleanup();
        inputs.push({ pageIndex: index, image: { kind: 'jpeg', bytes: new Uint8Array(await blob.arrayBuffer()) }, width: vp.width, height: vp.height, textItems });
      }
      const bytes = await runInWorker('redact', { source: await toSource(entry!), pages: inputs, options: { removeHiddenInformation: sanitize } }, { signal, onProgress: (v, l) => progress(0.7 + v * 0.2, l) });

      // Verify the output independently by extracting its text again.
      progress(0.92, 'Verifying redactions');
      const out = await openPdfDocument(bytes.slice());
      let leaks = 0;
      const termsOnOtherPages: Verification['termsOnOtherPages'] = [];
      try {
        for (const index of redactedPages) {
          const { items, transform } = await pageTextItems(out, index);
          const pageBoxList = boxes.filter((b) => b.page === index);
          for (const item of items) {
            if (item.str.trim() && pageBoxList.some((b) => boxIntersects(textItemGeometry(item, transform).bbox, b, 0))) leaks++;
          }
        }
        for (const term of terms) {
          const pages: number[] = [];
          const needle = caseSensitive ? term : term.toLowerCase();
          for (let i = 0; i < out.numPages; i++) {
            const { items } = await pageTextItems(out, i);
            if (items.some((it) => (caseSensitive ? it.str : it.str.toLowerCase()).includes(needle))) pages.push(i);
          }
          if (pages.length) termsOnOtherPages.push({ term, pages });
        }
      } finally {
        await destroyPdfDocument(out);
      }
      if (leaks > 0) throw new PdfToolError('UNKNOWN', 'Verification failed: some text could still be extracted from a redacted area. The file was not saved. Please report this issue.');
      const outputs = [makeOutput(outputName(entry!.name, 'redacted'), bytes, 'pdf', { pageCount })];
      recordHistory(tool, [entry!], outputs);
      return { outputs, verification: { leaks, checkedPages: redactedPages.length, termsOnOtherPages } };
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: boxes.length ? `Redact ${pluralize(boxes.length, 'area')}` : 'Redact', tone: 'danger', onClick: () => setConfirm(true), disabled: !entry || boxes.length === 0, hint: boxes.length ? `${pluralize(redactedPages.length, 'page')} will be flattened` : 'Mark at least one area.' }}
      result={
        task.result ? (
          <ResultPanel outputs={task.result.outputs} title="Redaction complete" onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }}>
            <Alert tone="success" icon={CheckCircle2} title="Verified">
              Text extraction of the new file found no text inside the {pluralize(boxes.length, 'redacted area')} on {pluralize(task.result.verification.checkedPages, 'page')}.
            </Alert>
            {task.result.verification.termsOnOtherPages.map((t) => (
              <Alert key={t.term} tone="warning" className="mt-2" title={`“${t.term}” can still be found`}>
                It still appears as text on page{t.pages.length > 1 ? 's' : ''} {formatPageList(t.pages.map((p) => p))} outside the marked areas (for example where words are split across lines). Review those pages and redact them if needed.
              </Alert>
            ))}
          </ResultPanel>
        ) : null
      }
      options={
        <>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <Field label="Find text to redact" htmlFor="redact-q">
              <div className="flex gap-2">
                <TextInput id="redact-q" value={query} placeholder="Name, number, email…" onChange={(e) => { setQuery(e.target.value); setFound(null); }} />
                <IconButton icon={Search} label="Search" variant="secondary" type="submit" disabled={!query.trim() || searching} />
              </div>
            </Field>
            <div className="flex gap-4">
              <Checkbox label="Match case" checked={caseSensitive} onChange={setCaseSensitive} />
              <Checkbox label="Whole words" checked={wholeWord} onChange={setWholeWord} />
            </div>
            {searching ? <p className="flex items-center gap-2 text-xs text-fg-muted"><Spinner size={12} /> Searching all pages…</p> : null}
            {found ? (
              found.boxes.length ? (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm" data-testid="search-results">
                  <span>{pluralize(found.boxes.length, 'match', 'matches')} on {pluralize(new Set(found.boxes.map((b) => b.page)).size, 'page')}</span>
                  <Button size="sm" variant="primary" onClick={addFound}>Mark all</Button>
                </div>
              ) : (
                <p className="text-xs text-fg-muted">No matches. Scanned pages contain images, not text — draw boxes instead.</p>
              )
            ) : null}
          </form>
          <Field label="Redaction colour">
            <Segmented label="Redaction colour" value={fill} onChange={setFill} options={[{ value: '#000000', label: 'Black' }, { value: '#ffffff', label: 'White' }]} />
          </Field>
          <Field label="Quality of redacted pages" htmlFor="redact-dpi">
            <Select id="redact-dpi" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
              <option value={150}>150 DPI — smaller file</option>
              <option value={200}>200 DPI — recommended</option>
              <option value={300}>300 DPI — print quality</option>
            </Select>
          </Field>
          <Checkbox checked={keepText} onChange={setKeepText} label="Keep other text searchable" description="Rebuilds an invisible text layer only for text completely outside the boxes." />
          <Checkbox checked={sanitize} onChange={setSanitize} label="Remove hidden information" description="Metadata, bookmarks, attachments, scripts and tags can repeat redacted content." />
          <Alert tone="info" icon={ShieldAlert} title="How this redaction works">
            Pages with redactions are flattened into images with the areas painted over, and their original text, images and annotations are deleted from the file. Other pages are untouched.
          </Alert>
          {boxes.length ? (
            <Button variant="ghost" size="sm" icon={Trash2} className="w-full" onClick={() => { setBoxes([]); setTerms([]); }}>Clear all marks</Button>
          ) : null}
        </>
      }
    >
      {entry ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5" role="toolbar" aria-label="Redaction tools">
            <IconButton icon={Square} label="Draw redaction box" active={mode === 'draw'} aria-pressed={mode === 'draw'} onClick={() => setMode('draw')} data-testid="redact-draw" />
            <IconButton icon={MousePointer2} label="Select and move boxes" active={mode === 'select'} aria-pressed={mode === 'select'} onClick={() => setMode('select')} />
            <Button size="sm" variant="ghost" icon={FileX2} onClick={markWholePage}>Redact whole page</Button>
            {selectedId ? <Button size="sm" variant="ghost" icon={Trash2} onClick={() => { setBoxes((bs) => bs.filter((b) => b.id !== selectedId)); setSelectedId(null); }}>Remove box</Button> : null}
            <label className="ml-2 flex items-center gap-1.5 text-xs text-fg-muted">
              <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} className="accent-[var(--color-primary)]" /> Preview result
            </label>
            <span className="ml-auto flex items-center gap-0.5">
              <IconButton icon={ZoomOut} label="Zoom out" onClick={() => setZoom(Math.max(0.25, scale / 1.25))} />
              <button type="button" className="h-8 min-w-14 rounded-md px-1.5 text-xs font-medium tabular-nums text-fg-muted hover:bg-surface-2" onClick={() => setZoom('fit')}>{Math.round(scale * 100)}%</button>
              <IconButton icon={ZoomIn} label="Zoom in" onClick={() => setZoom(Math.min(4, scale * 1.25))} />
            </span>
          </div>
          <div className="flex h-[calc(100vh-15rem)] min-h-[460px]">
            <nav className="hidden w-28 shrink-0 space-y-2 overflow-y-auto border-r border-line p-2 md:block" aria-label="Pages">
              {Array.from({ length: pageCount }, (_, i) => (
                <button key={i} type="button" onClick={() => { setPage(i); setSelectedId(null); }} aria-current={page === i ? 'page' : undefined} className={cn('relative w-full rounded-lg border p-1.5', page === i ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-2')}>
                  <PageThumbnail docId={entry.id} pageIndex={i} width={88} />
                  <span className="mt-1 block text-center text-[11px] font-medium text-fg-muted">{i + 1}</span>
                  {redactedPages.includes(i) ? <span className="absolute right-1 top-1 rounded bg-danger px-1 text-[10px] font-semibold text-white">{boxes.filter((b) => b.page === i).length}</span> : null}
                </button>
              ))}
            </nav>
            <div ref={scrollRef} className="flex-1 overflow-auto bg-surface-2 p-6 [scrollbar-gutter:stable]">
              <div className="mx-auto w-fit">
                <PageCanvas docId={entry.id} pageIndex={Math.min(page, Math.max(0, pageCount - 1))} zoom={scale} onInfo={setPageInfo}>
                  {(info) => (
                    <svg viewBox={`0 0 ${info.width} ${info.height}`} className="absolute inset-0 h-full w-full touch-none select-none" style={{ cursor: mode === 'draw' ? 'crosshair' : 'default' }} onPointerDown={(e) => onDown(e, info)} onPointerMove={(e) => onMove(e, info)} onPointerUp={onUp} onPointerCancel={onUp} data-testid="redact-overlay">
                      {pageBoxes.map((b) => (
                        <rect
                          key={b.id}
                          x={b.x}
                          y={b.y}
                          width={b.w}
                          height={b.h}
                          fill={fill}
                          fillOpacity={preview ? 1 : 0.55}
                          stroke={selectedId === b.id ? 'var(--color-primary)' : '#dc2626'}
                          strokeWidth={(selectedId === b.id ? 2 : 1) / info.scale}
                          style={{ cursor: mode === 'select' ? 'move' : undefined, pointerEvents: mode === 'select' ? 'auto' : 'none' }}
                          onPointerDown={(e) => onBoxDown(e, b, info)}
                          data-testid="redaction-box"
                        />
                      ))}
                    </svg>
                  )}
                </PageCanvas>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-xs text-fg-muted">
            <span>Page {page + 1} of {pageCount}</span>
            <span>{mode === 'draw' ? 'Drag on the page to mark an area' : 'Click a box to select it · Delete removes it'}</span>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); void apply(); }}
        title="Apply redactions?"
        message={<>The marked content on {pluralize(redactedPages.length, 'page')} will be permanently removed from the new file. Those pages become images{keepText ? ' with searchable text kept only outside the marked areas' : ''}. Your original file is not changed.</>}
        confirmLabel="Redact"
        tone="danger"
      />
    </ToolShell>
  );
}
