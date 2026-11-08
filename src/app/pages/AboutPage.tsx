import { CloudOff, Code2, HeartHandshake, Keyboard, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Kbd } from '../../components/ui/Feedback';
import { BrandMark, UniqueLabsAttribution } from '../../components/BrandMark';
import { TOOLS } from '../../features/registry';

const LICENSES = [
  { name: 'PDF.js', license: 'Apache-2.0', use: 'Rendering and text extraction' },
  { name: '@cantoo/pdf-lib (fork of pdf-lib)', license: 'MIT', use: 'Creating, editing and encrypting PDFs' },
  { name: 'React', license: 'MIT', use: 'User interface' },
  { name: 'fflate', license: 'MIT', use: 'ZIP archives and stream compression' },
  { name: 'dnd kit', license: 'MIT', use: 'Accessible drag and drop' },
  { name: 'Lucide', license: 'ISC', use: 'Icons' },
  { name: 'Inter', license: 'SIL OFL 1.1', use: 'Typeface' },
  { name: 'OpenJPEG, JBIG2, QCMS decoders (via PDF.js)', license: 'BSD-2 / Apache-2.0 / MIT', use: 'Image decoding in PDFs' },
];

export function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6">
      <Card className="enter relative overflow-hidden p-7">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,var(--blob-b),transparent)]" />
        <BrandMark />
        <h1 className="display relative mt-6 text-[28px] leading-tight">Free PDF tools without subscriptions, watermarks or file uploads.</h1>
        <p className="mt-2 text-fg-muted">
          Unique PDF brings {TOOLS.length} PDF tools into your browser — including Unique AI, which lets you chat with your PDFs and summarize them in seconds. Your documents stay private, and it works offline.
        </p>
        <p className="mt-4 text-sm text-fg-subtle">
          Made by <UniqueLabsAttribution className="text-fg" /> — <em>Useful technology. Accessible to everyone.</em>
        </p>
        <p className="mt-1 text-sm text-fg-subtle">Version {__APP_VERSION__}</p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: CloudOff, title: 'Local processing', text: 'No servers, no uploads, no cloud storage.' },
          { icon: HeartHandshake, title: 'Free for real', text: 'No subscriptions, quotas, watermarks or accounts.' },
          { icon: ShieldCheck, title: 'Minimal permissions', text: 'Only local storage for your settings.' },
        ].map(({ icon: Icon, title, text }) => (
          <Card key={title} className="p-4">
            <Icon size={18} className="text-primary" aria-hidden />
            <h2 className="mt-2 text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-[13px] text-fg-muted">{text}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Keyboard size={16} aria-hidden /> Keyboard shortcuts</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ['Open Unique PDF in a tab', ['Alt', 'Shift', 'P']],
            ['Open the quick menu', ['Alt', 'Shift', 'U']],
            ['Undo / redo in the editor', ['Ctrl', 'Z'], ['Ctrl', 'Shift', 'Z']],
            ['Delete selected object', ['Delete']],
            ['Select / move pages', ['Enter'], ['Space']],
            ['Close a dialog', ['Esc']],
          ].map(([label, ...keys]) => (
            <div key={label as string} className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">{label as string}</dt>
              <dd className="flex shrink-0 gap-2">
                {(keys as string[][]).map((combo, i) => (
                  <span key={i} className="flex gap-0.5">{combo.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-fg-subtle">Extension shortcuts can be changed at chrome://extensions/shortcuts.</p>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Code2 size={16} aria-hidden /> Open-source components</h2>
        <p className="mt-1 text-sm text-fg-muted">Unique PDF is built on excellent open-source software. Full license texts ship with the extension in THIRD_PARTY_NOTICES.txt.</p>
        <ul className="mt-3 divide-y divide-line text-sm">
          {LICENSES.map((l) => (
            <li key={l.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="font-medium">{l.name}</span>
              <span className="text-fg-muted">{l.use} · <span className="font-mono text-xs">{l.license}</span></span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
