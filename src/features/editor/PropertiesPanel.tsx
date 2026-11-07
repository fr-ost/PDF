/** Properties for the selected object, or defaults for the active tool. */
import { ArrowUpToLine, Bold, Copy, Italic, Trash2, Underline } from 'lucide-react';
import type { EditorObject, TextObject } from '../../pdf/engines/annotations';
import { FONT_FAMILIES, findUnsupportedChars, type FontFamily } from '../../pdf/winAnsi';
import { Button, IconButton } from '../../components/ui/Button';
import { ColorField, Field, Select, Slider, Switch, TextArea } from '../../components/ui/Form';
import type { EditorTool, ToolDefaults } from './model';

const HIGHLIGHTS = ['#fde047', '#86efac', '#f9a8d4', '#93c5fd', '#fdba74'];
const TOOL_NAMES: Record<EditorTool, string> = { select: 'Select', text: 'Text', draw: 'Pen', highlight: 'Highlighter', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow' };

type Patch = Partial<EditorObject>;

function TextControls({ value, onChange, showContent }: { value: Pick<TextObject, 'font' | 'size' | 'color' | 'bold' | 'italic' | 'underline'> & { text?: string; opacity?: number }; onChange: (p: Partial<TextObject>) => void; showContent?: boolean }) {
  const unsupported = value.text ? findUnsupportedChars(value.text) : [];
  return (
    <>
      {showContent ? (
        <Field label="Text" htmlFor="ed-text" error={unsupported.length ? `Not supported by the built-in PDF fonts: ${unsupported.slice(0, 10).join(' ')}` : null}>
          <TextArea id="ed-text" rows={3} value={value.text} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      ) : null}
      <div className="flex items-end gap-1.5">
        <Field label="Font" htmlFor="ed-font" className="min-w-0 flex-1">
          <Select id="ed-font" value={value.font} onChange={(e) => onChange({ font: e.target.value as FontFamily })}>
            {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </Field>
        <IconButton icon={Bold} label="Bold" variant="secondary" active={value.bold} aria-pressed={value.bold} onClick={() => onChange({ bold: !value.bold })} />
        <IconButton icon={Italic} label="Italic" variant="secondary" active={value.italic} aria-pressed={value.italic} onClick={() => onChange({ italic: !value.italic })} />
        <IconButton icon={Underline} label="Underline" variant="secondary" active={value.underline} aria-pressed={value.underline} onClick={() => onChange({ underline: !value.underline })} />
      </div>
      <Slider label="Size" min={6} max={144} value={value.size} onChange={(size) => onChange({ size })} format={(v) => `${v} pt`} />
      <ColorField label="Colour" value={value.color} onChange={(color) => onChange({ color })} />
    </>
  );
}

function StrokeControls({ color, width, onChange, min = 0.5, max = 24 }: { color: string; width: number; onChange: (p: { color?: string; width?: number }) => void; min?: number; max?: number }) {
  return (
    <>
      <ColorField label="Colour" value={color} onChange={(c) => onChange({ color: c })} />
      <Slider label="Thickness" min={min} max={max} step={0.5} value={width} onChange={(w) => onChange({ width: w })} format={(v) => `${v} pt`} />
    </>
  );
}

function ShapeControls({ stroke, fill, strokeWidth, onChange }: { stroke: string | null; fill: string | null; strokeWidth: number; onChange: (p: { stroke?: string | null; fill?: string | null; strokeWidth?: number }) => void }) {
  return (
    <>
      <Switch checked={stroke !== null} onChange={(v) => onChange({ stroke: v ? '#dc2626' : null })} label="Outline" />
      {stroke !== null ? (
        <>
          <ColorField label="Outline colour" value={stroke} onChange={(c) => onChange({ stroke: c })} />
          <Slider label="Outline thickness" min={0.5} max={20} step={0.5} value={strokeWidth} onChange={(w) => onChange({ strokeWidth: w })} format={(v) => `${v} pt`} />
        </>
      ) : null}
      <Switch checked={fill !== null} onChange={(v) => onChange({ fill: v ? '#bfdbfe' : null })} label="Fill" />
      {fill !== null ? <ColorField label="Fill colour" value={fill} onChange={(c) => onChange({ fill: c })} /> : null}
    </>
  );
}

function Opacity({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <Slider label="Opacity" min={0.1} max={1} step={0.05} value={value} onChange={onChange} format={(v) => `${Math.round(v * 100)}%`} />;
}

export function PropertiesPanel({
  selected,
  tool,
  defaults,
  onChange,
  onDefaults,
  onDelete,
  onDuplicate,
  onFront,
}: {
  selected: EditorObject | null;
  tool: EditorTool;
  defaults: ToolDefaults;
  onChange: (patch: Patch) => void;
  onDefaults: <K extends keyof ToolDefaults>(group: K, patch: Partial<ToolDefaults[K]>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFront: () => void;
}) {
  if (selected) {
    const o = selected;
    return (
      <div className="space-y-4" data-testid="properties-panel">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold capitalize">{o.type === 'draw' ? 'Drawing' : o.type}</h3>
          <div className="flex gap-0.5">
            <IconButton icon={ArrowUpToLine} label="Bring to front" size="sm" onClick={onFront} />
            <IconButton icon={Copy} label="Duplicate" size="sm" onClick={onDuplicate} />
            <IconButton icon={Trash2} label="Delete" size="sm" variant="danger-ghost" onClick={onDelete} />
          </div>
        </div>
        {o.type === 'text' ? <TextControls value={o} showContent onChange={(p) => onChange(p as Patch)} /> : null}
        {o.type === 'draw' || o.type === 'line' || o.type === 'arrow' ? <StrokeControls color={o.color} width={o.width} onChange={(p) => onChange(p as Patch)} /> : null}
        {o.type === 'rect' || o.type === 'ellipse' ? <ShapeControls stroke={o.stroke} fill={o.fill} strokeWidth={o.strokeWidth} onChange={(p) => onChange(p as Patch)} /> : null}
        {o.type === 'highlight' ? <ColorField label="Colour" value={o.color} swatches={HIGHLIGHTS} onChange={(color) => onChange({ color } as Patch)} /> : null}
        {o.type === 'signature' ? (
          <>
            <ColorField label="Ink colour" value={o.color} swatches={['#111827', '#1d4ed8', '#0f766e']} onChange={(color) => onChange({ color } as Patch)} />
            <Slider label="Thickness" min={0.01} max={0.12} step={0.005} value={o.strokeRatio} onChange={(strokeRatio) => onChange({ strokeRatio } as Patch)} format={(v) => `${Math.round(v * 1000) / 10}%`} />
          </>
        ) : null}
        <Opacity value={o.opacity ?? 1} onChange={(opacity) => onChange({ opacity })} />
        <Button variant="ghost" size="sm" className="w-full" icon={Trash2} onClick={onDelete}>Delete object</Button>
      </div>
    );
  }
  return (
    <div className="space-y-4" data-testid="properties-panel">
      <h3 className="text-sm font-semibold">{TOOL_NAMES[tool]} settings</h3>
      {tool === 'select' ? <p className="text-sm text-fg-muted">Pick a tool from the toolbar to add content, or click an existing item to edit it.</p> : null}
      {tool === 'text' ? <TextControls value={defaults.text} onChange={(p) => onDefaults('text', p)} /> : null}
      {tool === 'draw' ? (
        <>
          <StrokeControls color={defaults.draw.color} width={defaults.draw.width} onChange={(p) => onDefaults('draw', p)} />
          <Opacity value={defaults.draw.opacity} onChange={(opacity) => onDefaults('draw', { opacity })} />
        </>
      ) : null}
      {tool === 'line' || tool === 'arrow' ? <StrokeControls color={defaults.line.color} width={defaults.line.width} onChange={(p) => onDefaults('line', p)} /> : null}
      {tool === 'rect' || tool === 'ellipse' ? <ShapeControls stroke={defaults.shape.stroke} fill={defaults.shape.fill} strokeWidth={defaults.shape.strokeWidth} onChange={(p) => onDefaults('shape', p)} /> : null}
      {tool === 'highlight' ? (
        <>
          <ColorField label="Colour" value={defaults.highlight.color} swatches={HIGHLIGHTS} onChange={(color) => onDefaults('highlight', { color })} />
          <Opacity value={defaults.highlight.opacity} onChange={(opacity) => onDefaults('highlight', { opacity })} />
        </>
      ) : null}
    </div>
  );
}
