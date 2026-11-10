import { BarChart3 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useReviewState } from '../../services/support/reviewPrompt';
import { dismissUsageStatsAsk, setUsageStatsConsent, useUsageStats } from '../../services/telemetry/usageStats';

/**
 * One-time, opt-in request for anonymous usage stats. Shown on the home page
 * after the first finished task, until it is answered. Both buttons are equal;
 * nothing is sent unless "Share anonymous stats" is chosen.
 */
export function UsageStatsAsk() {
  const stats = useUsageStats();
  const review = useReviewState();
  if (stats.consent !== 'unset' || stats.asked || review.tasks < 1) return null;
  return (
    <section aria-labelledby="stats-ask-title" data-testid="usage-stats-ask" className="enter mt-6 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <BarChart3 size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="stats-ask-title" className="text-[15px] font-semibold tracking-tight">Help improve Unique PDF?</h2>
        <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">
          Share anonymous usage counts, like which tools are used and how often. Never your files, file names or anything you type. You can change this anytime in{' '}
          <a href="#/settings" className="font-medium text-primary hover:underline">Settings</a>.{' '}
          <a href="#/privacy" className="font-medium text-primary hover:underline">What is sent</a>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={() => void dismissUsageStatsAsk()}>No thanks</Button>
        <Button variant="secondary" onClick={() => void setUsageStatsConsent(true)}>Share anonymous stats</Button>
      </div>
    </section>
  );
}
