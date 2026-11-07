/**
 * Brand identity placeholder. Text-only until the official Unique Labs
 * identity is supplied: pass `logoSrc` (a bundled asset URL) to replace the
 * neutral glyph without touching the rest of the interface.
 */
import { cn } from '../utils/cn';

export function ProductGlyph({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} aria-hidden>
      <rect x="4" y="4" width="120" height="120" rx="28" fill="var(--color-primary)" />
      <path d="M40 22h36l18 18v60a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z" fill="#fff" />
      <path d="M76 22v14a4 4 0 0 0 4 4h14z" fill="#bfdbfe" />
      <rect x="46" y="60" width="36" height="6" rx="3" fill="var(--color-primary)" />
      <rect x="46" y="74" width="36" height="6" rx="3" fill="var(--color-primary)" />
      <rect x="46" y="88" width="24" height="6" rx="3" fill="var(--color-primary)" />
    </svg>
  );
}

export function BrandMark({ logoSrc, compact, className }: { logoSrc?: string; compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {logoSrc ? <img src={logoSrc} alt="" className="h-7 w-7" /> : <ProductGlyph />}
      {!compact ? (
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-tight">Unique PDF</div>
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
