import { Check, ShieldCheck, X } from 'lucide-react';
import { Card, PageHeader } from '../../components/ui/Card';

const DOES = [
  'Reads the files you choose directly in this browser tab.',
  'Processes them on your device using bundled code (PDF.js, pdf-lib) running in background workers.',
  'Saves results only when you click Download.',
  'Keeps your settings, and — if enabled — a short list of recent file names and sizes, in this browser’s local extension storage (a light or dark theme choice is mirrored in local web storage so the page opens in the right colours).',
  'Uses passwords only in memory, for the operation you asked for.',
  'Runs AI Summary with Chrome’s built-in on-device model — the text is processed on your computer.',
];
const DOES_NOT = [
  'Upload, sync or back up your documents anywhere.',
  'Use analytics, telemetry, tracking pixels or advertising.',
  'Require an account or sign-in.',
  'Read web pages you visit — it has no access to websites at all.',
  'Execute scripts embedded inside PDF files.',
  'Store document contents or passwords.',
];

export function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6">
      <PageHeader title="Privacy" description="How Unique PDF handles your files — in plain language." icon={<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-fg-muted shadow-card"><ShieldCheck size={20} aria-hidden /></span>} />
      <div className="h-2" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">What Unique PDF does</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {DOES.map((t) => (
              <li key={t} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />{t}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">What it never does</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {DOES_NOT.map((t) => (
              <li key={t} className="flex gap-2.5"><X size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />{t}</li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="space-y-3 p-5 text-sm leading-relaxed text-fg-muted">
        <h2 className="text-[15px] font-semibold text-fg">Technical safeguards</h2>
        <p>
          <strong className="text-fg">Network blocked by policy.</strong> The extension’s Content Security Policy only allows connections to its own packaged files, so the browser itself would refuse any attempt to send data to a server.
        </p>
        <p>
          <strong className="text-fg">One permission.</strong> Unique PDF requests only the “storage” permission, used for settings and the optional recent-task list. It has no host permissions and cannot read or change websites.
        </p>
        <p>
          <strong className="text-fg">Your originals are never modified.</strong> Every operation creates a new file; the files you selected are only read.
        </p>
        <p>
          <strong className="text-fg">Clearing data.</strong> Settings → “Clear all local data” removes everything Unique PDF stored. Uninstalling the extension removes it as well.
        </p>
      </Card>
    </div>
  );
}
