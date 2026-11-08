import { BookOpenText, CalendarDays, ChartColumn, FlaskConical, Lightbulb, ListChecks, Scale, Users, WandSparkles, type LucideIcon } from 'lucide-react';
import type { Suggestion, SuggestionKind } from '../../ai/suggestions';
import { trackSpotlight } from '../../app/pages/ToolCard';
import { UniqueAiMark } from '../ai-shared/UniqueAiMark';

const ICONS: Record<SuggestionKind, LucideIcon> = {
  summary: ListChecks,
  takeaways: Lightbulb,
  dates: CalendarDays,
  numbers: ChartColumn,
  obligations: Scale,
  findings: FlaskConical,
  people: Users,
  simple: WandSparkles,
};

/** First screen of a chat: who Unique AI is and what to ask. */
export function Welcome({ name, pageCount, suggestions, aiMode, disabled, onAsk }: { name: string; pageCount: number; suggestions: Suggestion[]; aiMode: boolean; disabled: boolean; onAsk: (text: string) => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-2 py-8 text-center" data-testid="chat-welcome">
      <div className="relative">
        <span className="ai-orb-halo" aria-hidden />
        <UniqueAiMark size="lg" />
      </div>
      <h2 className="mt-6 max-w-lg text-balance text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px]">
        Ask anything about
        <span className="text-gradient block [overflow-wrap:anywhere]">{name}</span>
      </h2>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-fg-muted">
        {aiMode
          ? `Unique AI has read all ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}. Every answer links to the pages it comes from.`
          : 'Search your document in plain language — every result links to its page.'}
      </p>
      <div className="mt-7 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {suggestions.map((s, i) => {
          const Icon = ICONS[s.kind] ?? BookOpenText;
          return (
            <button
              key={s.kind}
              type="button"
              disabled={disabled}
              onClick={() => onAsk(s.text)}
              onPointerMove={trackSpotlight}
              data-testid="chat-suggestion"
              className="spotlight enter group flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left text-[13.5px] font-medium text-fg shadow-card transition-[transform,border-color,box-shadow] duration-300 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raised disabled:pointer-events-none disabled:opacity-50 dark:bg-surface-2/60"
              style={{ ['--i' as string]: i + 1 }}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary transition-colors group-hover:bg-[image:var(--brand-gradient)] group-hover:text-white">
                <Icon size={15} aria-hidden />
              </span>
              <span className="min-w-0">{s.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
