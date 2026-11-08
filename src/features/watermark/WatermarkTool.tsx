import { useEffect, useRef, useState } from 'react';
import { useMeasuredWidth } from '../../hooks/useMeasuredWidth';
import { Bold, ImageUp, Italic, Type } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageCanvas } from '../../components/tool/PageCanvas';
import { ResultPanel } from '../../components/tool/TaskPanels';
import { PageRangeField, recordHistory, toSource, useToolFiles } from '../../components/tool/helpers';
import { Button, IconButton } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { ColorField, Field, Segmented, Select, Slider, TextInput, Switch } from '../../components/ui/Form';
import { useToast } from '../../components/ui/Toast';
import { useTask } from '../../hooks/useTask';
import { runInWorker } from '../../pdf/workers/client';
import { describeError } from '../../pdf/errors';
import { parsePageRanges } from '../../pdf/pageRanges';
import { anchorCenters, originForCenter, type Anchor } from '../../pdf/placement';
import { FONT_ASCENT, FONT_FAMILIES, findUnsupportedChars, type FontFamily } from '../../pdf/winAnsi';
import { makeOutput, type OutputFile } from '../../services/export-service/download';
import { cssFont, measureTextWidth } from '../../utils/measureText';
import { outputName } from '../../utils/filenames';
import { PositionGrid, PreviewPager } from '../shared/PreviewPager';
import { loadImageAsset, type ImageAsset } from '../shared/imageAsset';

const POSITIONS: Anchor[][] = [
  ['top-left', 'top-center', 'top-right'],
  ['middle-left', 'center', 'middle-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

export default function WatermarkTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const [previewRef, previewWidth] = useMeasuredWidth<HTMLDivElement>();
  const task = useTask<OutputFile[]>();
  const toast = useToast();
  const imageInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [font, setFont] = useState<FontFamily>('Helvetica');
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [fontSize, setFontSize] = useState(60);
  const [color, setColor] = useState('#dc2626');
  const [image, setImage] = useState<ImageAsset | null>(null);
  const [imageScale, setImageScale] = useState(0.4);
  const [opacity, setOpacity] = useState(0.25);
  const [rotation, setRotation] = useState(45);
  const [anchor, setAnchor] = useState<Anchor>('center');
  const [tile, setTile] = useState(false);
  const [layer, setLayer] = useState<'over' | 'under'>('over');
  const [pagesMode, setPagesMode] = useState<'all' | 'custom'>('all');
  const [range, setRange] = useState('');
  const [previewPage, setPreviewPage] = useState(0);
  const entry = files.ready[0];
  const pageCount = entry?.pageCount ?? 0;
  // One clamped index for the canvas, the overlay and the pager; a new file starts at page 1.
  const shownPage = Math.min(previewPage, Math.max(0, pageCount - 1));
  useEffect(() => setPreviewPage(0), [entry?.id]);

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  const parsed = pagesMode === 'custom' ? parsePageRanges(range, pageCount || 1) : null;
  const targetPages = pagesMode === 'all' ? Array.from({ length: pageCount }, (_, i) => i) : parsed?.ok ? parsed.pages : [];
  const unsupported = type === 'text' ? findUnsupportedChars(text) : [];
  const position: Anchor | 'tile' = tile ? 'tile' : anchor;
  const canApply = !!entry && targetPages.length > 0 && (type === 'text' ? text.trim().length > 0 && unsupported.length === 0 : !!image);

  const apply = () =>
    task.run(async ({ signal, progress }) => {
      const options = {
        type, text, font, bold, italic, fontSize, color, imageScale, opacity, rotation, position, layer, margin: 36, pages: targetPages,
        ...(image && type === 'image' ? { image: { kind: image.kind, bytes: image.bytes.slice() } } : {}),
      };
      const bytes = await runInWorker('watermark', { source: await toSource(entry!), options }, { signal, onProgress: progress });
      const outputs = [makeOutput(outputName(entry!.name, 'watermarked'), bytes, 'pdf', { pageCount })];
      recordHistory(tool, [entry!], outputs);
      return outputs;
    });

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      primary={{ label: 'Add watermark', onClick: () => void apply(), disabled: !canApply, hint: targetPages.length ? `${targetPages.length} of ${pageCount} pages` : 'Choose which pages to watermark.' }}
      result={task.result ? <ResultPanel outputs={task.result} onBack={task.reset} onStartOver={() => { task.reset(); files.clear(); }} /> : null}
      options={
        <>
          <Segmented label="Watermark type" value={type} onChange={setType} options={[{ value: 'text', label: <span className="inline-flex items-center gap-1.5"><Type size={14} aria-hidden /> Text</span> }, { value: 'image', label: <span className="inline-flex items-center gap-1.5"><ImageUp size={14} aria-hidden /> Image</span> }]} />
          {type === 'text' ? (
            <>
              <Field label="Text" htmlFor="wm-text" error={unsupported.length ? `Not supported by the built-in fonts: ${unsupported.slice(0, 8).join(' ')}` : null}>
                <TextInput id="wm-text" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} invalid={unsupported.length > 0} />
              </Field>
              <div className="flex items-end gap-2">
                <Field label="Font" htmlFor="wm-font" className="flex-1">
                  <Select id="wm-font" value={font} onChange={(e) => setFont(e.target.value as FontFamily)}>
                    {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>
                </Field>
                <IconButton icon={Bold} label="Bold" variant="secondary" active={bold} aria-pressed={bold} onClick={() => setBold(!bold)} />
                <IconButton icon={Italic} label="Italic" variant="secondary" active={italic} aria-pressed={italic} onClick={() => setItalic(!italic)} />
              </div>
              <Slider label="Font size" min={8} max={200} value={fontSize} onChange={setFontSize} format={(v) => `${v} pt`} />
              <ColorField label="Colour" value={color} onChange={setColor} />
            </>
          ) : (
            <>
              <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" className="sr-only" aria-label="Choose watermark image" onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try { setImage(await loadImageAsset(file)); } catch (err) { toast.show(describeError(err).message, 'error'); }
              }} />
              <div className="flex items-center gap-3">
                {image ? <img src={image.url} alt="Watermark" className="checkerboard h-14 w-14 rounded-md border border-line object-contain" /> : null}
                <Button icon={ImageUp} onClick={() => imageInput.current?.click()}>{image ? 'Change image' : 'Choose image'}</Button>
              </div>
              <Slider label="Size" min={0.05} max={1} step={0.01} value={imageScale} onChange={setImageScale} format={(v) => `${Math.round(v * 100)}% of page width`} />
            </>
          )}
          <Slider label="Opacity" min={0.05} max={1} step={0.05} value={opacity} onChange={setOpacity} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Rotation" min={-90} max={90} step={5} value={rotation} onChange={setRotation} format={(v) => `${v}°`} />
          <Field label="Position">
            <div className="flex items-center gap-4">
              <div className={tile ? 'pointer-events-none opacity-40' : ''}><PositionGrid label="Position" value={anchor} onChange={setAnchor} positions={POSITIONS} /></div>
              <Switch checked={tile} onChange={setTile} label="Repeat across page" />
            </div>
          </Field>
          <Field label="Layer">
            <Segmented label="Layer" value={layer} onChange={setLayer} options={[{ value: 'over', label: 'Over content' }, { value: 'under', label: 'Behind content' }]} />
          </Field>
          {layer === 'under' ? <Alert tone="info">Behind-content watermarks can be hidden on scanned pages or pages with solid backgrounds.</Alert> : null}
          <Field label="Pages">
            <Segmented label="Pages to watermark" value={pagesMode} onChange={setPagesMode} options={[{ value: 'all', label: 'All pages' }, { value: 'custom', label: 'Select pages' }]} />
          </Field>
          {pagesMode === 'custom' ? <PageRangeField value={range} onChange={setRange} pageCount={pageCount} /> : null}
        </>
      }
    >
      {entry ? (
        <div ref={previewRef} className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-4">
          <PageCanvas docId={entry.id} pageIndex={shownPage} maxWidth={Math.max(160, Math.min(560, previewWidth || 560))} maxHeight={720}>
            {(info) => {
              if (!targetPages.includes(shownPage)) return <div className="absolute inset-x-0 bottom-2 text-center text-xs text-fg-subtle">Not watermarked</div>;
              const H = info.height;
              let item: { w: number; h: number };
              if (type === 'image') {
                if (!image) return null;
                const w = info.width * imageScale;
                item = { w, h: (w * image.height) / image.width };
              } else {
                item = { w: measureTextWidth(text, font, fontSize, bold, italic), h: fontSize * FONT_ASCENT[font] };
              }
              const centers = anchorCenters(position, { w: info.width, h: info.height }, item, rotation, 36);
              return (
                <svg viewBox={`0 0 ${info.width} ${info.height}`} className="absolute inset-0 h-full w-full" style={{ mixBlendMode: layer === 'under' ? 'multiply' : 'normal' }} aria-hidden>
                  {centers.map(([cx, cy], i) => {
                    const [x, y] = originForCenter(cx, cy, item, rotation);
                    const transform = `rotate(${-rotation} ${x} ${H - y})`;
                    return type === 'image' && image ? (
                      <image key={i} href={image.url} x={x} y={H - y - item.h} width={item.w} height={item.h} opacity={opacity} transform={transform} preserveAspectRatio="none" />
                    ) : (
                      <text key={i} x={x} y={H - y} transform={transform} fill={color} opacity={opacity} style={{ fontFamily: cssFont(font), fontSize, fontWeight: bold ? 700 : 400, fontStyle: italic ? 'italic' : 'normal', whiteSpace: 'pre' }}>
                        {text}
                      </text>
                    );
                  })}
                </svg>
              );
            }}
          </PageCanvas>
          <PreviewPager index={shownPage} count={pageCount} onChange={setPreviewPage} />
        </div>
      ) : null}
    </ToolShell>
  );
}
