import { Check, ShieldCheck, X } from 'lucide-react';
import { Card, PageHeader } from '../../components/ui/Card';

const DOES = [
  'Reads the files you choose directly in this browser tab.',
  'Processes them on your device using bundled code (PDF.js, pdf-lib) running in background workers.',
  'Saves results only when you click Download.',
  'Keeps your settings, and — if enabled — a short list of recent file names and sizes, in this browser’s local extension storage (a light or dark theme choice is mirrored in local web storage so the page opens in the right colours). It also counts finished tasks there, to know when to ask for a store review.',
  'Uses passwords only in memory, for the operation you asked for.',
  'Runs Unique AI (chat and summaries) on the AI built into Chrome — your document text is never sent to Unique Labs or any server.',
  'Only if you turn on “Share anonymous usage stats” (off by default): sends counts of which tools finished a task, Unique AI questions asked and minutes the app was open, with the version, operating system, browser language, whether Chrome’s AI is available, the install age in days and a random id.',
];
const DOES_NOT = [
  'Upload, sync or back up your documents anywhere.',
  'Send anything about you or your files unless you turn on usage stats — and even then never documents, file names, sizes, passwords, AI questions or answers.',
  'Use tracking pixels, advertising or third-party analytics services.',
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
          <strong className="text-fg">Network limited by policy.</strong> The extension’s Content Security Policy only allows connections to its own packaged files and to the Unique PDF usage-stats server (unique-pdf.shahriarahmed614.workers.dev), so the browser itself refuses any other connection. That server is contacted only while usage stats are on.
        </p>
        <p>
          <strong className="text-fg">One permission.</strong> Unique PDF requests only the “storage” permission, used for settings and the optional recent-task list. It has no host permissions and cannot read or change websites.
        </p>
        <p>
          <strong className="text-fg">Links open only when you click them.</strong> The Donate page, the review prompt, the developer credit and the bug-report links open the Chrome Web Store, the developer’s website or Telegram in a new tab. Nothing is sent automatically; donation addresses and images are part of the extension package.
        </p>
        <p>
          <strong className="text-fg">Your originals are never modified.</strong> Every operation creates a new file; the files you selected are only read.
        </p>
        <p>
          <strong className="text-fg">Usage stats are your choice.</strong> They stay off until you turn them on in Settings or on the one-time “Help improve Unique PDF” card. The server stores the counts with a 2-letter country code it gets from the connection (never the IP address). Turning stats off deletes the random id and any unsent counts on this device. While they are on, removing the extension opens a short “Unique PDF was removed” page that records the uninstall.
        </p>
        <p>
          <strong className="text-fg">Clearing data.</strong> Settings → “Clear all local data” removes everything Unique PDF stored and turns usage stats off. Uninstalling the extension removes it as well.
        </p>
      </Card>
    </div>
  );
}
