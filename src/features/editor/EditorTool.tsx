/**
 * PDF editor: adds new content (text, freehand, shapes, highlights, images,
 * signatures) on top of existing pages. It does not edit text that already
 * exists in the PDF — that is stated clearly in the interface.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowRight,
  Circle,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Signature,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageCanvas, type PageInfo } from '../../components/tool/PageCanvas';
import { PageThumbnail } from '../../components/tool/PageThumbnail';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Button, IconButton } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { useTask } from '../../hooks/useTask';
import { useHotkeys } from '../../hooks/useHotkeys';
import { runInWorker } from '../../pdf/workers/client';
import { describeError } from '../../pdf/errors';
import type { EditorAsset, EditorObject } from '../../pdf/engines/annotations';
import { LINE_HEIGHT, findUnsupportedChars } from '../../pdf/winAnsi';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { outputName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';
import { cssFont } from '../../utils/measureText';
import { cn } from '../../utils/cn';
import { DEFAULTS, clampToPage, isBoxObject, moveObject, newId, objectBounds, resizeObject, type EditorTool as ToolKind, type Handle, type ToolDefaults } from './model';
import { useEditorHistory } from './useEditorHistory';
import { ObjectView } from './ObjectView';
import { PropertiesPanel } from './PropertiesPanel';
import { SignaturePad, type CapturedSignature } from './SignaturePad';
import { loadImageAsset } from '../shared/imageAsset';

type Gesture =
  | { kind: 'move'; id: string; startX: number; startY: number; origin: EditorObject }
  | { kind: 'resize'; id: string; handle: Handle; origin: EditorObject }
  | { kind: 'create'; id: string; startX: number; startY: number }
  | { kind: 'draw'; id: string };

type Asset = EditorAsset & { url: string };

const TOOLS: { id: ToolKind; label: string; icon: LucideIcon; key: string }[] = [
  { id: 'select', label: 'Select and move', icon: MousePointer2, key: 'v' },
  { id: 'text', label: 'Add text', icon: Type, key: 't' },
  { id: 'draw', label: 'Draw', icon: Pencil, key: 'd' },
  { id: 'highlight', label: 'Highlight area', icon: Highlighter, key: 'h' },
  { id: 'rect', label: 'Rectangle', icon: Square, key: 'r' },
  { id: 'ellipse', label: 'Ellipse', icon: Circle, key: 'e' },
  { id: 'line', label: 'Line', icon: Minus, key: 'l' },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight, key: 'a' },
];

const HANDLE_CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', p1: 'move', p2: 'move' };

export function EditorWorkspace({ tool, initialFiles, mode = 'edit' }: ToolProps & { mode?: 'edit' | 'sign' }) {
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<OutputFile[]>();
  const toast = useToast();
  const history = useEditorHistory();
  const { objects } = history;
  const [assets, setAssets] = useState<Record<string, Asset>>({});
  const [page, setPage] = useState(0);
  const [toolKind, setToolKind] = useState<ToolKind>('select');
  const [defaults, setDefaults] = useState<ToolDefaults>(DEFAULTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [containerWidth, setContainerWidth] = useState(720);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [savedSignature, setSavedSignature] = useState<CapturedSignature | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastPropEdit = useRef<{ id: string; at: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const signaturePrompted = useRef(false);
  const entry = files.ready[0];
  const pageCount = entry?.pageCount ?? 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [entry]);

  useEffect(() => () => Object.values(assets).forEach((a) => URL.revokeObjectURL(a.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // A new document starts with a clean slate.
  useEffect(() => {
    history.reset();
    setSelectedId(null);
    setEditingId(null);
    setPage(0);
    signaturePrompted.current = false;
  }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // In "Sign PDF" mode, open the signature pad as soon as the document is ready.
  useEffect(() => {
    if (mode === 'sign' && entry && !signaturePrompted.current) {
      signaturePrompted.current = true;
      setSignatureOpen(true);
    }
  }, [mode, entry]);

  const fitScale = pageInfo ? Math.max(0.2, Math.min(3, (containerWidth - 48) / pageInfo.width)) : 1;
  const scale = zoom === 'fit' ? fitScale : zoom;
  const pageObjects = useMemo(() => objects.filter((o) => o.page === page), [objects, page]);
  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const editing = objects.find((o) => o.id === editingId && o.type === 'text') as Extract<EditorObject, { type: 'text' }> | undefined;
  const unsupported = useMemo(() => [...new Set(objects.flatMap((o) => (o.type === 'text' ? findUnsupportedChars(o.text) : [])))], [objects]);

  const replace = useCallback((id: string, next: EditorObject, record: boolean) => history.set(objects.map((o) => (o.id === id ? next : o)), record), [history, objects]);
  const add = useCallback((obj: EditorObject) => history.set([...objects, obj], true), [history, objects]);
  const remove = useCallback((id: string) => {
    history.set(objects.filter((o) => o.id !== id), true);
    setSelectedId(null);
    setEditingId(null);
  }, [history, objects]);

  const updateSelected = (patch: Partial<EditorObject>) => {
    if (!selected) return;
    const now = Date.now();
    const merge = lastPropEdit.current?.id === selected.id && now - lastPropEdit.current.at < 800;
    lastPropEdit.current = { id: selected.id, at: now };
    replace(selected.id, { ...selected, ...patch } as EditorObject, !merge);
  };

  const duplicate = () => {
    if (!selected) return;
    const copy = { ...moveObject(selected, 12, 12), id: newId() } as EditorObject;
    add(copy);
    setSelectedId(copy.id);
  };
  const bringToFront = () => {
    if (!selected) return;
    history.set([...objects.filter((o) => o.id !== selected.id), selected], true);
  };

  const toPoint = (e: ReactPointerEvent<SVGSVGElement | SVGElement>, info: PageInfo): [number, number] => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * info.width, ((e.clientY - rect.top) / rect.height) * info.height];
  };

  const placeCentered = (make: (cx: number, cy: number, pw: number) => EditorObject) => {
    if (!pageInfo) return;
    const obj = make(pageInfo.width / 2, pageInfo.height / 2, pageInfo.width);
    add(obj);
    setSelectedId(obj.id);
    setToolKind('select');
  };

  const placeSignature = (sig: CapturedSignature) => {
    setSavedSignature(sig);
    setSignatureOpen(false);
    placeCentered((cx, cy, pw) => {
      const w = Math.min(pw * 0.32, 200);
      const h = w / sig.aspect;
      return { id: newId(), page, type: 'signature', x: cx - w / 2, y: cy - h / 2, w, h, strokes: sig.strokes, color: sig.color, strokeRatio: 0.035, opacity: 1 };
    });
  };

  const onImageChosen = async (file: File) => {
    try {
      const asset = await loadImageAsset(file, 3000);
      const id = newId();
      setAssets((a) => ({ ...a, [id]: asset }));
      placeCentered((cx, cy, pw) => {
        const w = Math.min(pw * 0.4, asset.width * 0.75);
        const h = (w * asset.height) / asset.width;
        return { id: newId(), page, type: 'image', x: cx - w / 2, y: cy - h / 2, w, h, assetId: id, opacity: 1 };
      });
    } catch (err) {
      toast.show(describeError(err).message, 'error');
    }
  };

  // ---- pointer interaction ------------------------------------------------
  const onBackgroundDown = (e: ReactPointerEvent<SVGSVGElement>, info: PageInfo) => {
    if (e.button !== 0) return;
    const [x, y] = toPoint(e, info);
    setEditingId(null);
    if (toolKind === 'select') {
      setSelectedId(null);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const id = newId();
    if (toolKind === 'text') {
      const d = defaults.text;
      const obj: EditorObject = { id, page, type: 'text', x, y: y - d.size * 0.6, text: '', opacity: 1, ...d };
      add(obj);
      setSelectedId(id);
      setEditingId(id);
      setToolKind('select');
      return;
    }
    history.checkpoint();
    let obj: EditorObject;
    if (toolKind === 'draw') obj = { id, page, type: 'draw', points: [x, y], ...defaults.draw };
    else if (toolKind === 'highlight') obj = { id, page, type: 'highlight', x, y, w: 0, h: 0, ...defaults.highlight };
    else if (toolKind === 'rect' || toolKind === 'ellipse') obj = { id, page, type: toolKind, x, y, w: 0, h: 0, ...defaults.shape };
    else obj = { id, page, type: toolKind, x1: x, y1: y, x2: x, y2: y, ...defaults.line };
    history.set([...objects, obj], false);
    gesture.current = toolKind === 'draw' ? { kind: 'draw', id } : { kind: 'create', id, startX: x, startY: y };
  };

  const onObjectDown = (e: ReactPointerEvent<SVGGElement>, obj: EditorObject, info: PageInfo) => {
    if (toolKind !== 'select' || e.button !== 0) return;
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement;
    svg?.setPointerCapture(e.pointerId);
    const [x, y] = toPoint(e, info);
    setSelectedId(obj.id);
    if (editingId && editingId !== obj.id) setEditingId(null);
    history.checkpoint();
    gesture.current = { kind: 'move', id: obj.id, startX: x, startY: y, origin: obj };
  };

  const onHandleDown = (e: ReactPointerEvent<SVGElement>, obj: EditorObject, handle: Handle) => {
    e.stopPropagation();
    e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
    history.checkpoint();
    gesture.current = { kind: 'resize', id: obj.id, handle, origin: obj };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>, info: PageInfo) => {
    const g = gesture.current;
    if (!g) return;
    const [x, y] = toPoint(e, info);
    const current = objects.find((o) => o.id === g.id);
    if (!current) return;
    if (g.kind === 'move') {
      replace(g.id, clampToPage(moveObject(g.origin, x - g.startX, y - g.startY), info.width, info.height), false);
    } else if (g.kind === 'resize') {
      replace(g.id, resizeObject(g.origin, g.handle, x, y), false);
    } else if (g.kind === 'draw' && current.type === 'draw') {
      const n = current.points.length;
      if (Math.hypot(x - current.points[n - 2]!, y - current.points[n - 1]!) >= 1.2 / scale) replace(g.id, { ...current, points: [...current.points, x, y] }, false);
    } else if (g.kind === 'create') {
      if (current.type === 'line' || current.type === 'arrow') replace(g.id, { ...current, x2: x, y2: y }, false);
      else if (isBoxObject(current)) replace(g.id, { ...current, x: Math.min(x, g.startX), y: Math.min(y, g.startY), w: Math.abs(x - g.startX), h: Math.abs(y - g.startY) }, false);
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const current = objects.find((o) => o.id === g.id);
    if (current && g.kind === 'create') {
      // A click without dragging creates a default-sized item.
      let fixed = current;
      if (isBoxObject(current) && (current.w < 3 || current.h < 3)) {
        const [w, h] = current.type === 'highlight' ? [140, 18] : [120, 70];
        fixed = { ...current, x: current.x - w / 2, y: current.y - h / 2, w, h };
      } else if ((current.type === 'line' || current.type === 'arrow') && Math.hypot(current.x2 - current.x1, current.y2 - current.y1) < 3) {
        fixed = { ...current, x2: current.x1 + 100 };
      }
      if (fixed !== current) replace(g.id, fixed, false);
      setSelectedId(g.id);
      if (toolKind !== 'highlight') setToolKind('select');
    }
    if (current && g.kind === 'draw' && current.type === 'draw' && current.points.length < 4) {
      replace(g.id, { ...current, points: [...current.points, current.points[0]! + 0.5, current.points[1]!] }, false);
    }
    history.commit();
  };

  // ---- keyboard -----------------------------------------------------------
  const nudge = (dx: number, dy: number) => selected && replace(selected.id, moveObject(selected, dx, dy), true);
  useHotkeys(
    {
      'mod+z': history.undo,
      'shift+mod+z': history.redo,
      'mod+y': history.redo,
      delete: () => selected && remove(selected.id),
      backspace: () => selected && remove(selected.id),
      escape: () => {
        setSelectedId(null);
        setToolKind('select');
      },
      'mod+d': duplicate,
      arrowleft: () => nudge(-1, 0),
      arrowright: () => nudge(1, 0),
      arrowup: () => nudge(0, -1),
      arrowdown: () => nudge(0, 1),
      'shift+arrowleft': () => nudge(-10, 0),
      'shift+arrowright': () => nudge(10, 0),
      'shift+arrowup': () => nudge(0, -10),
      'shift+arrowdown': () => nudge(0, 10),
      pagedown: () => setPage((p) => Math.min(pageCount - 1, p + 1)),
      pageup: () => setPage((p) => Math.max(0, p - 1)),
      ...Object.fromEntries(TOOLS.map((t) => [t.key, () => setToolKind(t.id)])),
    },
    !!entry && !editingId,
  );

  const finishEditing = () => {
    if (editing && !editing.text.trim()) remove(editing.id);
    setEditingId(null);
  };

  const exportPdf = () =>
    task.run(async ({ signal, progress }) => {
      const payload: Record<string, EditorAsset> = {};
      for (const [id, a] of Object.entries(assets)) payload[id] = { kind: a.kind, bytes: a.bytes.slice(), width: a.width, height: a.height };
      const clean = objects.filter((o) => o.type !== 'text' || o.text.trim());
      const bytes = await runInWorker('editorExport', { source: await toSource(entry!), objects: clean, assets: payload }, { signal, onProgress: progress });
      const outputs = [makeOutput(outputName(entry!.name, mode === 'sign' ? 'signed' : 'edited'), bytes, 'pdf', { pageCount })];
      recordHistory(tool, [entry!], outputs);
      return outputs;
    });

  const pagesWithObjects = new Set(objects.map((o) => o.page));

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{
        label: mode === 'sign' ? 'Save signed PDF' : 'Save PDF',
        onClick: () => void exportPdf(),
        disabled: !entry || objects.length === 0 || unsupported.length > 0,
        hint: unsupported.length ? 'Some characters can’t be saved with the built-in fonts.' : objects.length ? `${pluralize(objects.length, 'item')} on ${pluralize(pagesWithObjects.size, 'page')}` : 'Add something to the document first.',
      }}
      result={task.result ? <ResultPanel outputs={task.result} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); history.reset(); }} /> : null}
      options={
        <>
          <PropertiesPanel
            selected={selected}
            tool={toolKind}
            defaults={defaults}
            onChange={updateSelected}
            onDefaults={(group, patch) => setDefaults((d) => ({ ...d, [group]: { ...d[group], ...patch } }))}
            onDelete={() => selected && remove(selected.id)}
            onDuplicate={duplicate}
            onFront={bringToFront}
          />
          {unsupported.length ? <Alert tone="warning">The built-in PDF fonts can’t display: {unsupported.slice(0, 12).join(' ')}. Remove these characters to save.</Alert> : null}
          <Alert tone="info">New content is added on top of the page. Text that already exists in the PDF can’t be edited directly — cover it with a white rectangle and type over it if needed.</Alert>
        </>
      }
    >
      {entry ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5" role="toolbar" aria-label="Editing tools">
            {TOOLS.map((t) => (
              <IconButton key={t.id} icon={t.icon} label={`${t.label} (${t.key.toUpperCase()})`} active={toolKind === t.id} aria-pressed={toolKind === t.id} onClick={() => setToolKind(t.id)} data-testid={`tool-${t.id}`} />
            ))}
            <IconButton icon={ImagePlus} label="Insert image" onClick={() => imageInput.current?.click()} data-testid="tool-image" />
            <Button size="sm" variant={mode === 'sign' ? 'primary' : 'ghost'} icon={Signature} onClick={() => (savedSignature && mode !== 'sign' ? placeSignature(savedSignature) : setSignatureOpen(true))} data-testid="tool-signature">
              Signature
            </Button>
            <span className="mx-1 h-6 w-px bg-line" aria-hidden />
            <IconButton icon={Undo2} label="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={history.undo} />
            <IconButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={history.redo} />
            <span className="ml-auto flex items-center gap-0.5">
              <IconButton icon={ZoomOut} label="Zoom out" onClick={() => setZoom(Math.max(0.25, scale / 1.25))} />
              <button type="button" className="h-8 min-w-14 rounded-md px-1.5 text-xs font-medium tabular-nums text-fg-muted hover:bg-surface-2" onClick={() => setZoom('fit')} title="Fit to width">
                {Math.round(scale * 100)}%
              </button>
              <IconButton icon={ZoomIn} label="Zoom in" onClick={() => setZoom(Math.min(4, scale * 1.25))} />
            </span>
            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" className="sr-only" aria-label="Choose image to insert" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onImageChosen(file);
            }} />
          </div>
          <div className="flex h-[calc(100vh-15rem)] min-h-[460px]">
            <nav className="hidden w-28 shrink-0 space-y-2 overflow-y-auto border-r border-line bg-surface p-2 md:block" aria-label="Pages">
              {Array.from({ length: pageCount }, (_, i) => (
                <button key={i} type="button" onClick={() => { setPage(i); setSelectedId(null); setEditingId(null); }} aria-current={page === i ? 'page' : undefined} className={cn('relative w-full rounded-lg border p-1.5 text-center', page === i ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-2')}>
                  <PageThumbnail docId={entry.id} pageIndex={i} width={88} />
                  <span className="mt-1 block text-[11px] font-medium text-fg-muted">{i + 1}</span>
                  {pagesWithObjects.has(i) ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" aria-label="Has edits" /> : null}
                </button>
              ))}
            </nav>
            <div ref={scrollRef} className="relative flex-1 overflow-auto bg-surface-2 p-6">
              <div className="mx-auto w-fit">
                <PageCanvas docId={entry.id} pageIndex={Math.min(page, Math.max(0, pageCount - 1))} zoom={scale} onInfo={setPageInfo}>
                  {(info) => {
                    const handle = 7 / info.scale;
                    const sb = selected && selected.page === page && !editingId ? objectBounds(selected) : null;
                    return (
                      <>
                        <svg
                          viewBox={`0 0 ${info.width} ${info.height}`}
                          className="absolute inset-0 h-full w-full touch-none select-none"
                          style={{ cursor: toolKind === 'select' ? 'default' : toolKind === 'text' ? 'text' : 'crosshair' }}
                          onPointerDown={(e) => onBackgroundDown(e, info)}
                          onPointerMove={(e) => onPointerMove(e, info)}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                          data-testid="editor-overlay"
                        >
                          {pageObjects.map((o) => {
                            const b = objectBounds(o);
                            return (
                              <g
                                key={o.id}
                                onPointerDown={(e) => onObjectDown(e, o, info)}
                                onDoubleClick={() => o.type === 'text' && setEditingId(o.id)}
                                style={{ cursor: toolKind === 'select' ? 'move' : undefined, pointerEvents: toolKind === 'select' ? 'auto' : 'none' }}
                                data-testid={`object-${o.type}`}
                              >
                                <ObjectView obj={o} assetUrl={o.type === 'image' ? assets[o.assetId]?.url : undefined} hidden={o.id === editingId} />
                                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />
                              </g>
                            );
                          })}
                          {sb && selected ? (
                            <g>
                              <rect x={sb.x} y={sb.y} width={sb.w} height={sb.h} fill="none" stroke="var(--color-primary)" strokeWidth={1.2 / info.scale} strokeDasharray={`${4 / info.scale} ${3 / info.scale}`} pointerEvents="none" />
                              {(selected.type === 'line' || selected.type === 'arrow'
                                ? ([['p1', selected.x1, selected.y1], ['p2', selected.x2, selected.y2]] as const)
                                : isBoxObject(selected)
                                  ? ([['nw', sb.x, sb.y], ['ne', sb.x + sb.w, sb.y], ['sw', sb.x, sb.y + sb.h], ['se', sb.x + sb.w, sb.y + sb.h]] as const)
                                  : []
                              ).map(([h, hx, hy]) => (
                                <rect key={h} x={hx - handle / 2} y={hy - handle / 2} width={handle} height={handle} fill="white" stroke="var(--color-primary)" strokeWidth={1.2 / info.scale} style={{ cursor: HANDLE_CURSOR[h] }} onPointerDown={(e) => onHandleDown(e, selected, h)} />
                              ))}
                            </g>
                          ) : null}
                        </svg>
                        {editing && editing.page === page ? (
                          <textarea
                            autoFocus
                            aria-label="Edit text"
                            data-testid="text-editor"
                            value={editing.text}
                            onFocus={() => history.checkpoint()}
                            onChange={(e) => replace(editing.id, { ...editing, text: e.target.value }, false)}
                            onBlur={() => {
                              history.commit();
                              finishEditing();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
                            }}
                            rows={Math.max(1, editing.text.split('\n').length)}
                            placeholder="Type here"
                            className="absolute resize-none overflow-hidden border border-dashed border-primary bg-white/70 p-0 outline-none"
                            style={{
                              left: editing.x * info.scale,
                              top: editing.y * info.scale,
                              minWidth: 140,
                              width: Math.max(140, (objectBounds(editing).w + editing.size) * info.scale),
                              fontFamily: cssFont(editing.font),
                              fontSize: editing.size * info.scale,
                              lineHeight: LINE_HEIGHT,
                              fontWeight: editing.bold ? 700 : 400,
                              fontStyle: editing.italic ? 'italic' : 'normal',
                              textDecoration: editing.underline ? 'underline' : 'none',
                              color: editing.color,
                            }}
                          />
                        ) : null}
                      </>
                    );
                  }}
                </PageCanvas>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-xs text-fg-muted">
            <span>Page {page + 1} of {pageCount}</span>
            <span className="hidden sm:inline">Double-click text to edit · Delete removes · Arrow keys nudge</span>
          </div>
        </div>
      ) : null}
      <SignaturePad open={signatureOpen} onClose={() => setSignatureOpen(false)} onUse={placeSignature} />
    </ToolShell>
  );
}

export default function EditorTool(props: ToolProps) {
  return <EditorWorkspace {...props} mode="edit" />;
}
