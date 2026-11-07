import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { CATEGORY_INFO, type ToolDefinition } from '../../features/registry';
import { handOffFiles, navigate, routeHref } from '../router';
import { cn } from '../../utils/cn';
import { filesFromDataTransfer } from '../../components/tool/Dropzone';

/** Tool card. Dropping files onto it opens the tool with those files. */
export function ToolCard({ tool, showCategory }: { tool: ToolDefinition; showCategory?: boolean }) {
  const Icon = tool.icon;
  const [over, setOver] = useState(false);
  return (
    <a
      href={routeHref({ name: 'tool', id: tool.id })}
      data-testid={`tool-card-${tool.id}`}
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
      className={cn(
        'group relative flex flex-col rounded-xl border bg-surface p-4 shadow-card transition-all duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-raised',
        over ? 'border-primary ring-2 ring-primary/30' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg transition-colors', over ? 'bg-primary text-primary-fg' : 'bg-primary-soft text-primary')}>
          <Icon size={20} aria-hidden />
        </div>
        <ArrowRight size={16} className="text-fg-subtle opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
      </div>
      <h3 className="mt-3 text-[15px] font-semibold tracking-tight">{tool.name}</h3>
      <p className="mt-1 text-[13px] leading-snug text-fg-muted">{over ? 'Drop to open with these files' : tool.description}</p>
      {showCategory ? <span className="mt-3 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{CATEGORY_INFO[tool.category].title}</span> : null}
    </a>
  );
}
