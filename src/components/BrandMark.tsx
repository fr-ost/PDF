/**
 * Brand identity placeholder. Text-only until the official Unique Labs
 * identity is supplied: pass `logoSrc` (a bundled asset URL) to replace the
 * neutral product glyph without touching the rest of the interface.
 */
import { useId } from 'react';
import { cn } from '../utils/cn';

export function ProductGlyph({ size = 30, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} aria-hidden>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--brand-1)' }} />
          <stop offset="62%" style={{ stopColor: 'var(--brand-2)' }} />
          <stop offset="100%" style={{ stopColor: '#b14dff' }} />
        </linearGradient>
        <linearGradient id={`s-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="120" height="120" rx="32" fill={`url(#g-${id})`} />
      <rect x="4" y="4" width="120" height="60" rx="32" fill={`url(#s-${id})`} />
      <path d="M42 24h32l20 20v54a8 8 0 0 1-8 8H42a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8z" fill="#fff" />
      <path d="M74 24v14a6 6 0 0 0 6 6h14z" fill="#fff" fillOpacity="0.55" />
      <rect x="46" y="62" width="34" height="6" rx="3" fill={`url(#g-${id})`} />
      <rect x="46" y="76" width="34" height="6" rx="3" fill={`url(#g-${id})`} opacity="0.75" />
      <rect x="46" y="90" width="22" height="6" rx="3" fill={`url(#g-${id})`} opacity="0.5" />
    </svg>
  );
}

export function BrandMark({ logoSrc, compact, className }: { logoSrc?: string; compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {logoSrc ? <img src={logoSrc} alt="" className="h-8 w-8" /> : <ProductGlyph />}
      {!compact ? (
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-[-0.02em]">Unique PDF</div>
          <div className="mt-1 text-[11px] font-medium text-fg-subtle">by Unique Labs</div>
        </div>
      ) : null}
    </div>
  );
}

/** Text-only parent brand attribution. */
export function UniqueLabsAttribution({ className }: { className?: string }) {
  return <span className={cn('font-medium tracking-tight', className)}>Unique Labs</span>;
}
