import { useRef, useState, type PointerEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { CATEGORY_INFO, type ToolDefinition } from '../../features/registry';
import { accentStyle } from '../../features/categories';
import { handOffFiles, navigate, routeHref } from '../router';
import { cn } from '../../utils/cn';
import { filesFromDataTransfer } from '../../components/tool/Dropzone';

/** Moves the spotlight glow to the pointer without re-rendering. */
export function trackSpotlight(e: PointerEvent<HTMLElement>): void {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  el.style.setProperty('--my', `${e.clientY - rect.top}px`);
}

/** Tool card. Dropping files onto it opens the tool with those files. */
export function ToolCard({ tool, showCategory, index = 0 }: { tool: ToolDefinition; showCategory?: boolean; index?: number }) {
  const Icon = tool.icon;
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  return (
    <a
      ref={ref}
      href={routeHref({ name: 'tool', id: tool.id })}
      data-testid={`tool-card-${tool.id}`}
      onPointerMove={trackSpotlight}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = filesFromDataTransfer(e.dataTransfer);
        if (files.length) {
          handOffFiles(files);
          navigate(routeHref({ name: 'tool', id: tool.id }));
        }
      }}
      style={{ ...accentStyle(tool.category), ['--i' as string]: index }}
      data-active={over || undefined}
      className={cn(
        'spotlight enter group flex flex-col rounded-2xl border bg-surface/85 p-5 shadow-card transition-[transform,box-shadow,border-color] duration-300 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-raised dark:bg-surface/70',
        over ? 'border-transparent' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="tint-tile tint-fill flex h-11 w-11 items-center justify-center rounded-xl">
          <Icon size={20} aria-hidden strokeWidth={2} />
        </div>
        <ArrowUpRight size={16} className="text-fg-subtle opacity-0 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.015em]">{tool.name}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{over ? 'Drop to open with these files' : tool.description}</p>
      {showCategory ? (
        <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
          <span className="h-1.5 w-1.5 rounded-full bg-[linear-gradient(135deg,var(--c1),var(--c2))]" aria-hidden />
          {CATEGORY_INFO[tool.category].title}
        </span>
      ) : null}
    </a>
  );
}
