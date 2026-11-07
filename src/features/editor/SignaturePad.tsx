/** Drawn-signature capture. Strokes are kept as vectors for crisp output. */
import { useEffect, useRef, useState } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { pointsToSvgPath } from '../../pdf/engines/annotations';
import { cn } from '../../utils/cn';

export interface CapturedSignature {
  strokes: number[][];
  /** Width / height ratio of the signature's bounding box. */
  aspect: number;
  color: string;
}

const PAD_W = 560;
const PAD_H = 200;
const COLORS = ['#111827', '#1d4ed8', '#0f766e'];

export function normalizeStrokes(strokes: number[][]): { strokes: number[][]; aspect: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of strokes) for (let i = 0; i + 1 < s.length; i += 2) {
    xs.push(s[i]!);
    ys.push(s[i + 1]!);
  }
  if (xs.length < 2) return null;
  const pad = 4;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) + pad - minX;
  const h = Math.max(...ys) + pad - minY;
  return { strokes: strokes.map((s) => s.map((v, i) => (i % 2 === 0 ? (v - minX) / w : (v - minY) / h))), aspect: w / h };
}

export function SignaturePad({ open, onClose, onUse }: { open: boolean; onClose: () => void; onUse: (sig: CapturedSignature) => void }) {
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [current, setCurrent] = useState<number[] | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (open) {
      setStrokes([]);
      setCurrent(null);
    }
  }, [open]);

  const point = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * PAD_W, ((e.clientY - rect.top) / rect.height) * PAD_H];
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Draw your signature"
      description="Use your mouse, trackpad, pen or finger. To use a scanned signature instead, insert it with the Image tool."
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon={Undo2} disabled={!strokes.length} onClick={() => setStrokes(strokes.slice(0, -1))}>Undo stroke</Button>
          <Button variant="ghost" icon={Eraser} disabled={!strokes.length} onClick={() => setStrokes([])}>Clear</Button>
          <Button
            variant="primary"
            disabled={!strokes.length}
            data-testid="use-signature"
            onClick={() => {
              const n = normalizeStrokes(strokes);
              if (n) onUse({ ...n, color });
            }}
          >
            Use signature
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${PAD_W} ${PAD_H}`}
          className="w-full touch-none rounded-lg border border-line-strong bg-white"
          style={{ aspectRatio: `${PAD_W} / ${PAD_H}`, cursor: 'crosshair' }}
          data-testid="signature-pad"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setCurrent(point(e));
          }}
          onPointerMove={(e) => {
            if (!current) return;
            const [x, y] = point(e);
            const lx = current[current.length - 2]!;
            const ly = current[current.length - 1]!;
            if (Math.hypot(x - lx, y - ly) >= 1.5) setCurrent([...current, x, y]);
          }}
          onPointerUp={() => {
            if (current && current.length >= 2) setStrokes([...strokes, current.length === 2 ? [...current, current[0]! + 0.5, current[1]!] : current]);
            setCurrent(null);
          }}
          role="img"
          aria-label="Signature drawing area"
        >
          <line x1={24} x2={PAD_W - 24} y1={PAD_H - 44} y2={PAD_H - 44} stroke="#d1d5db" strokeDasharray="4 4" />
          {[...strokes, ...(current ? [current] : [])].map((s, i) => (
            <path key={i} d={pointsToSvgPath(s)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {!strokes.length && !current ? <text x={PAD_W / 2} y={PAD_H / 2} textAnchor="middle" fill="#9ca3af" fontSize={16}>Sign here</text> : null}
        </svg>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Ink:</span>
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Ink colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cn('h-6 w-6 rounded-full border border-black/10', color === c && 'ring-2 ring-primary ring-offset-2 ring-offset-surface')} style={{ backgroundColor: c }} />
          ))}
          <span className="ml-auto text-xs text-fg-subtle">Your signature is kept only in this tab.</span>
        </div>
      </div>
    </Dialog>
  );
}
