import { Sparkles } from 'lucide-react';
import { cn } from '../../utils/cn';

const SIZES = { xs: 'h-6 w-6', sm: 'h-8 w-8', md: 'h-11 w-11', lg: 'h-[72px] w-[72px]' } as const;
const ICONS = { xs: 12, sm: 15, md: 20, lg: 30 } as const;

/** The Unique AI mark: a softly turning light orb. Spins faster while thinking. */
export function UniqueAiMark({ size = 'sm', thinking = false, className }: { size?: keyof typeof SIZES; thinking?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn('ai-orb grid shrink-0 place-items-center', SIZES[size], className)} data-thinking={thinking || undefined}>
      <Sparkles size={ICONS[size]} strokeWidth={2.2} className="relative z-10 text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.25)]" />
    </span>
  );
}
