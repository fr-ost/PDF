import { Fragment, memo, type ReactNode } from 'react';
import { Check, Copy, RefreshCw, Search, Square, TriangleAlert } from 'lucide-react';
import { parseSummaryBlocks, type Block, type Inline } from '../../ai/markdown';
import { splitCitations, type ChatStage } from '../../ai/chat';
import type { ScoredPassage } from '../../ai/retrieval';
import { cn } from '../../utils/cn';
import { UniqueAiMark } from '../ai-shared/UniqueAiMark';

export interface Source {
  page: number;
  text: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Assistant messages: an AI answer or (without AI) the best-matching passages. */
  kind?: 'ai' | 'search';
  status?: 'pending' | 'streaming' | 'done' | 'stopped' | 'error';
  stage?: ChatStage;
  sources?: Source[];
  results?: ScoredPassage[];
  error?: string;
  /** The question an assistant message answers (for regenerate and highlighting). */
  question?: string;
}

interface CiteContext {
  pageCount: number;
  snippets: Map<number, string>;
  onCite: (page: number) => void;
}

function CitationChip({ page, ctx }: { page: number; ctx: CiteContext }) {
  const snippet = ctx.snippets.get(page);
  return (
    <button
      type="button"
      onClick={() => ctx.onCite(page)}
      title={snippet ? `Page ${page}: ${snippet.slice(0, 220)}${snippet.length > 220 ? '…' : ''}` : `Show page ${page}`}
      data-testid="citation"
      data-page={page}
      className="mx-0.5 inline-flex h-[19px] translate-y-[-1px] items-center rounded-md bg-primary-soft px-1.5 align-middle text-[11px] font-semibold tabular-nums text-primary ring-1 ring-primary/15 transition-colors duration-150 hover:bg-primary hover:text-primary-fg"
    >
      p.&nbsp;{page}
    </button>
  );
}

function renderInline(parts: Inline[], ctx: CiteContext): ReactNode[] {
  return parts.map((part, i) => {
    if (part.code) return <code key={i} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.9em]">{part.text}</code>;
    const nodes = splitCitations(part.text, ctx.pageCount).map((piece, j) =>
      piece.type === 'text' ? <Fragment key={j}>{piece.text}</Fragment> : piece.pages.map((page) => <CitationChip key={`${j}-${page}`} page={page} ctx={ctx} />),
    );
    if (part.bold) return <strong key={i} className="font-semibold text-fg">{nodes}</strong>;
    if (part.italic) return <em key={i}>{nodes}</em>;
    return <Fragment key={i}>{nodes}</Fragment>;
  });
}

type Group = { kind: 'list'; ordered: boolean; items: Block[] } | { kind: 'single'; block: Block };

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

/** Markdown answer with clickable page citations; never renders HTML. */
function RichAnswer({ markdown, streaming, ctx }: { markdown: string; streaming: boolean; ctx: CiteContext }) {
  const blocks = parseSummaryBlocks(markdown);
  const last = blocks[blocks.length - 1];
  const caret = (b: Block) => (streaming && b === last ? 'caret' : '');
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-fg/90" data-testid="chat-answer">
      {group(blocks).map((g, i) => {
        if (g.kind === 'list') {
          const List = g.ordered ? 'ol' : 'ul';
          return (
            <List key={i} className="space-y-1.5">
              {g.items.map((b, j) => (
                <li key={j} className="flex gap-3">
                  <span className={cn('shrink-0', g.ordered ? 'mt-[3px] min-w-4 font-mono text-xs text-fg-subtle' : 'mt-[10px] h-1.5 w-1.5 rounded-full bg-[image:var(--brand-gradient)]')} aria-hidden>
                    {b.kind === 'numbered' ? `${b.n}.` : null}
                  </span>
                  <span className={cn('min-w-0', caret(b))}>{renderInline(b.inline, ctx)}</span>
                </li>
              ))}
            </List>
          );
        }
        const b = g.block;
        if (b.kind === 'heading') return <h3 key={i} className={cn('pt-1 text-[15px] font-semibold text-fg', caret(b))}>{renderInline(b.inline, ctx)}</h3>;
        return <p key={i} className={caret(b)}>{renderInline(b.inline, ctx)}</p>;
      })}
    </div>
  );
}

function stageText(stage: ChatStage | undefined): string {
  if (!stage) return 'Thinking…';
  if (stage.kind === 'download') return `Setting up Unique AI… ${Math.round(stage.progress * 100)}%`;
  if (stage.kind === 'writing') return 'Writing…';
  const pages = stage.pages;
  if (pages.length === 0) return 'Reading the document…';
  if (pages.length > 6) return `Reading ${pages.length} pages…`;
  const list = pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.slice(0, -1).join(', ')} and ${pages.at(-1)}`;
  return `Reading ${list}…`;
}

function Thinking({ stage }: { stage: ChatStage | undefined }) {
  return (
    <div className="flex flex-col gap-2 py-1" data-testid="chat-thinking">
      <p className="shimmer-text text-[14px] font-medium">{stageText(stage)}</p>
      {stage?.kind === 'download' ? (
        <div className="h-1.5 w-56 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Setting up Unique AI" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stage.progress * 100)}>
          <div className="h-full rounded-full bg-[image:var(--brand-gradient)] transition-[width] duration-300" style={{ width: `${Math.max(4, stage.progress * 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Highlights the question's words in a passage. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((w) => !['what', 'which', 'when', 'where', 'does', 'that', 'this', 'with', 'about', 'from', 'have', 'there'].includes(w));
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => escapeRegExp(w.length > 4 ? w.slice(0, -1) : w)).join('|')})[\\p{L}\\p{N}]*`, 'giu');
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<mark key={m.index} className="rounded-sm bg-primary/15 px-0.5 text-fg">{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

function SearchResults({ results, question, onCite }: { results: ScoredPassage[]; question: string; onCite: (page: number) => void }) {
  if (!results.length) return <p className="text-[15px] text-fg-muted">I couldn’t find anything about that in this document.</p>;
  return (
    <div className="space-y-2" data-testid="chat-results">
      <p className="text-[14px] text-fg-muted">These passages match your question best:</p>
      {results.map(({ passage }) => (
        <button
          key={passage.id}
          type="button"
          onClick={() => onCite(passage.page)}
          className="group block w-full rounded-xl border border-line bg-surface-2/40 p-3 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-primary-soft/40"
        >
          <span className="mb-1 inline-flex h-5 items-center rounded-md bg-primary-soft px-1.5 text-[11px] font-semibold text-primary" data-testid="citation" data-page={passage.page}>
            p.&nbsp;{passage.page}
          </span>
          <p className="line-clamp-4 text-[14px] leading-relaxed text-fg/90">
            <Highlighted text={passage.text} query={question} />
          </p>
        </button>
      ))}
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, testId }: { icon: typeof Copy; label: string; onClick: () => void; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg">
      <Icon size={13} aria-hidden /> {label}
    </button>
  );
}

export const ChatMessageView = memo(function ChatMessageView({
  message,
  pageCount,
  isLast,
  copied,
  onCite,
  onCopy,
  onRegenerate,
}: {
  message: Message;
  pageCount: number;
  isLast: boolean;
  copied: boolean;
  onCite: (page: number) => void;
  onCopy: (message: Message) => void;
  onRegenerate: () => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end" data-testid="chat-user-message">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed text-fg shadow-[0_1px_0_rgb(255_255_255/0.6)_inset] dark:bg-surface-3 dark:shadow-none">
          {message.content}
        </p>
      </div>
    );
  }
  const streaming = message.status === 'pending' || message.status === 'streaming';
  const snippets = new Map((message.sources ?? []).map((s) => [s.page, s.text]));
  const ctx: CiteContext = { pageCount, snippets, onCite };
  const done = message.status === 'done' || message.status === 'stopped';
  return (
    <article className="flex gap-3" data-testid="chat-assistant-message" data-status={message.status} aria-busy={streaming || undefined}>
      <UniqueAiMark size="sm" thinking={streaming} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold">
          Unique AI
          {message.kind === 'search' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
              <Search size={11} aria-hidden /> Best matches · not AI
            </span>
          ) : null}
        </p>
        {message.kind === 'search' ? (
          <SearchResults results={message.results ?? []} question={message.question ?? ''} onCite={onCite} />
        ) : (
          <>
            {streaming && !message.content ? <Thinking stage={message.stage} /> : null}
            {message.content ? <RichAnswer markdown={message.content} streaming={streaming} ctx={ctx} /> : null}
          </>
        )}
        {message.status === 'stopped' ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-fg-subtle">
            <Square size={11} aria-hidden /> Stopped
          </p>
        ) : null}
        {message.status === 'error' ? (
          <p className="mt-1 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-[13px] text-fg" role="alert" data-testid="chat-error">
            <TriangleAlert size={15} className="mt-px shrink-0 text-danger" aria-hidden /> {message.error}
          </p>
        ) : null}
        {done && message.kind === 'ai' && message.sources?.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="chat-sources">
            <span className="mr-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Sources</span>
            {message.sources.map((s) => (
              <button
                key={s.page}
                type="button"
                onClick={() => onCite(s.page)}
                title={s.text ? s.text.slice(0, 220) : undefined}
                className="inline-flex h-6 items-center rounded-full border border-line bg-surface px-2.5 text-[12px] font-medium text-fg-muted transition-colors hover:border-primary/40 hover:text-primary"
              >
                Page {s.page}
              </button>
            ))}
          </div>
        ) : null}
        {(done || message.status === 'error') ? (
          <div className="mt-1.5 flex items-center gap-0.5">
            {message.content || message.results?.length ? <ActionButton icon={copied ? Check : Copy} label={copied ? 'Copied' : 'Copy'} onClick={() => onCopy(message)} testId="chat-copy" /> : null}
            {isLast && message.kind === 'ai' ? <ActionButton icon={RefreshCw} label="Regenerate" onClick={onRegenerate} testId="chat-regenerate" /> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
});
