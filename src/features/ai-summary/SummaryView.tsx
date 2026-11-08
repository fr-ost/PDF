import type { ReactNode } from 'react';
import { parseSummaryBlocks, type Block, type Inline } from '../../ai/markdown';
import { cn } from '../../utils/cn';

function renderInline(parts: Inline[]): ReactNode[] {
  return parts.map((p, i) =>
    p.code ? (
      <code key={i} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.9em]">{p.text}</code>
    ) : p.bold ? (
      <strong key={i} className="font-semibold text-fg">{p.text}</strong>
    ) : p.italic ? (
      <em key={i}>{p.text}</em>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

type Group = { kind: 'list'; ordered: boolean; items: Block[] } | { kind: 'single'; block: Block };

/** Consecutive bullet (or numbered) blocks become one semantic list. */
function group(blocks: Block[]): Group[] {
  const groups: Group[] = [];
  for (const b of blocks) {
    if (b.kind === 'bullet' || b.kind === 'numbered') {
      const ordered = b.kind === 'numbered';
      const prev = groups[groups.length - 1];
      if (prev?.kind === 'list' && prev.ordered === ordered) prev.items.push(b);
      else groups.push({ kind: 'list', ordered, items: [b] });
    } else groups.push({ kind: 'single', block: b });
  }
  return groups;
}

/** Renders summarizer Markdown as React elements (no HTML injection possible). */
export function SummaryView({ markdown, streaming }: { markdown: string; streaming?: boolean }) {
  const blocks = parseSummaryBlocks(markdown);
  const lastBlock = blocks[blocks.length - 1];
  const caretFor = (b: Block) => (streaming && b === lastBlock ? 'caret' : '');
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-fg/90" data-testid="summary-output" aria-busy={streaming || undefined}>
      {group(blocks).map((g, i) => {
        if (g.kind === 'list') {
          const List = g.ordered ? 'ol' : 'ul';
          return (
            <List key={i} className="space-y-2.5">
              {g.items.map((b, j) => (
                <li key={j} className="flex animate-fade-in gap-3">
                  <span className={cn('mt-[9px] shrink-0', g.ordered ? 'mt-[3px] min-w-4 font-mono text-xs text-fg-subtle' : 'h-1.5 w-1.5 rounded-full bg-[image:var(--brand-gradient)]')} aria-hidden>
                    {b.kind === 'numbered' ? `${b.n}.` : null}
                  </span>
                  <span className={cn('min-w-0', caretFor(b))}>{renderInline(b.inline)}</span>
                </li>
              ))}
            </List>
          );
        }
        const b = g.block;
        if (b.kind === 'heading') return <h3 key={i} className={cn('pt-2 text-[15px] font-semibold text-fg', caretFor(b))}>{renderInline(b.inline)}</h3>;
        return <p key={i} className={cn('animate-fade-in', caretFor(b))}>{renderInline(b.inline)}</p>;
      })}
      {streaming && blocks.length === 0 ? <p className="caret text-fg-subtle">Writing</p> : null}
    </div>
  );
}
