import { useMemo, useState, type ReactNode } from 'react';
import { Bug, Check, Coffee, Copy, Gift, Heart, Lightbulb, RefreshCw, Share2, ShieldCheck, Sparkles, Star, type LucideIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { cn } from '../../utils/cn';
import { DEVELOPER, WALLETS, shareMessage, storeListing, tokenIcon, type Wallet } from '../../services/support/support';
import { FiveStars } from '../shell/ReviewPrompt';
import { DeveloperLink, DeveloperPhoto } from '../../components/Developer';
import { answerFinal } from '../../services/support/reviewPrompt';

const ORBIT = ['btc', 'eth', 'sol', 'usdt', 'bnb', 'avax'] as const;

const WHY: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Gift, title: 'Free, with no limits', text: 'Every tool, Unique AI included — no sign-up, no quotas, no watermarks. Donations help keep it that way.' },
  { icon: ShieldCheck, title: 'Private by design', text: 'Your files never leave your device. No ads, no tracking, nothing sold. Your support keeps it independent.' },
  { icon: RefreshCw, title: 'Always improving', text: 'Chrome and the PDF format keep changing. Your support pays for the hours spent fixing bugs and building new tools.' },
  { icon: Coffee, title: 'Independent developer', text: 'Built by an independent developer at Unique Labs. Your tip goes straight to the person who fixes bugs and answers your messages.' },
];

const STEPS = [
  { title: 'Pick a coin you already have', text: 'Any of the networks below works — use whatever is in your wallet.' },
  { title: 'Scan or copy', text: 'Scan the QR code with your wallet app, or press Copy to grab the address.' },
  { title: 'Send any amount', text: '$0.10, $1, $5 — truly any amount helps. Message us on Telegram if you’d like a thank-you!' },
];

function scrollToSection(id: string) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 text-[20px] font-semibold tracking-[-0.02em]">
      {children}
    </h2>
  );
}

function Orbit() {
  return (
    <div className="donate-orbit mx-auto" aria-hidden>
      <div className="donate-ring">
        {ORBIT.map((id, i) => (
          <span key={id} className="donate-orbit-item" style={{ ['--i' as string]: i }}>
            <img src={tokenIcon(id)} alt="" className="donate-orbit-logo" draggable={false} />
          </span>
        ))}
      </div>
      <span className="donate-heart">
        <Heart size={34} fill="currentColor" strokeWidth={1.5} />
      </span>
    </div>
  );
}

function WalletCard({ wallet, copied, onCopy }: { wallet: Wallet; copied: boolean; onCopy: () => void }) {
  return (
    <Card className="flex flex-col p-5 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-raised" data-testid="wallet" data-wallet={wallet.id}>
      <header className="flex items-center gap-3">
        <span className="flex shrink-0">
          {wallet.tokens.map((t, i) => (
            <img key={t.id} src={tokenIcon(t.id)} alt={t.label} title={t.label} className={cn('h-8 w-8 rounded-full ring-2 ring-surface dark:shadow-[0_0_0_3px_rgb(255_255_255/0.14)]', i > 0 && '-ml-2.5')} draggable={false} />
          ))}
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-5">{wallet.name}</h3>
          <p className="text-[12.5px] text-fg-muted">{wallet.subtitle}</p>
        </div>
      </header>
      <div className="mx-auto mt-5 rounded-2xl bg-white p-3 shadow-[0_0_0_1px_var(--color-line),0_10px_30px_-14px_rgb(0_0_0/0.35)]">
        <img src={wallet.qr} alt={`QR code for the ${wallet.name} donation address`} width={168} height={168} className="block h-[168px] w-[168px]" draggable={false} />
      </div>
      <ul className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label={`${wallet.name}: networks`}>
        {wallet.networks.map((n) => (
          <li key={n} className="rounded-full border border-line bg-surface-2/70 px-2.5 py-0.5 text-[11.5px] font-medium text-fg-muted">
            {n}
          </li>
        ))}
      </ul>
      <p className="mb-4 mt-3 text-center text-[12.5px] leading-snug text-fg-muted">{wallet.note}</p>
      {/* Address and Copy line up across the cards. */}
      <code className="mt-auto block select-all break-all rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-center font-mono text-[12.5px] leading-relaxed text-fg" data-testid="wallet-address">
        {wallet.address}
      </code>
      <button type="button" onClick={onCopy} className="btn-primary btn-press mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-medium" data-testid="copy-address">
        {copied ? <Check size={16} aria-hidden className="relative" /> : <Copy size={15} aria-hidden className="relative" />}
        <span className="relative">{copied ? 'Copied' : 'Copy address'}</span>
        <span className="sr-only"> ({wallet.name})</span>
      </button>
    </Card>
  );
}

function HelpCard({ icon: Icon, title, text, href, onClick, testId, children }: { icon: LucideIcon; title: string; text: string; href?: string; onClick?: () => void; testId?: string; children?: ReactNode }) {
  const body = (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-[image:var(--btn-gradient)] group-hover:text-white">
        <Icon size={18} aria-hidden />
      </span>
      <span className="mt-3 block text-[15px] font-semibold">{title}</span>
      {children}
      <span className="mt-1 block text-[13px] leading-snug text-fg-muted">{text}</span>
    </>
  );
  const className = 'group flex h-full flex-col items-start justify-start rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition-[box-shadow,transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised';
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} data-testid={testId} onClick={onClick}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className} data-testid={testId}>
      {body}
    </button>
  );
}

export function DonatePage() {
  const listing = useMemo(storeListing, []);
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.show(message, 'success');
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      toast.show('Copying isn’t allowed here. Select the text and copy it instead.', 'error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-12 px-4 py-10 sm:px-6 lg:px-10">
      <section className="enter relative overflow-hidden rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-10" aria-labelledby="donate-title">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-28 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgb(244_63_94/0.16),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,var(--blob-b),transparent)]" />
        <div className="relative grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_250px]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/70 px-3 py-1 text-[12px] font-medium text-fg-muted">
              <Heart size={12} className="text-rose-500" fill="currentColor" aria-hidden /> Free forever · No ads · No tracking
            </span>
            <h1 id="donate-title" className="display mt-4 text-[32px] leading-[1.1] sm:text-[40px]">
              Keep Unique PDF <span className="text-gradient sm:block">free for everyone</span>
            </h1>
            <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-fg-muted">
              Unique PDF has no subscriptions, no watermarks and no uploads — every tool, Unique AI included, is free. If it saved you time or money, a small tip helps keep it going.
            </p>
            <div className="mt-5 flex max-w-xl gap-3 rounded-2xl border border-line bg-surface-2/60 p-4">
              <Sparkles size={18} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
              <p className="text-[13.5px] leading-relaxed text-fg-muted">
                <strong className="font-semibold text-fg">Even $0.10 means a lot.</strong> Seriously. Every donation, however small, tells us this tool is worth the late nights — and keeps it free for the next person.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => scrollToSection('wallets')} className="btn-primary btn-press inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[15px] font-medium" data-testid="donate-now">
                <Heart size={16} fill="currentColor" aria-hidden className="relative" />
                <span className="relative">Donate now</span>
              </button>
              <button type="button" onClick={() => scrollToSection('help')} className="btn-press inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong/80 bg-surface px-5 text-[15px] font-medium text-fg shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:bg-surface-2 dark:bg-surface-2">
                <Star size={16} aria-hidden /> Other ways to help
              </button>
            </div>
          </div>
          <Orbit />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="why-donate">
        <SectionTitle id="why-donate">Why donate?</SectionTitle>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon size={18} aria-hidden />
              </span>
              <h3 className="mt-3 text-[15px] font-semibold">{title}</h3>
              <p className="mt-1 text-[13px] leading-snug text-fg-muted">{text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="how-donate">
        <SectionTitle id="how-donate">How to donate</SectionTitle>
        <ol className="grid gap-3.5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-2xl border border-line bg-surface/70 p-5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[image:var(--btn-gradient)] text-[14px] font-semibold text-white">{i + 1}</span>
              <div>
                <h3 className="text-[15px] font-semibold">{step.title}</h3>
                <p className="mt-1 text-[13px] leading-snug text-fg-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4" aria-labelledby="wallets">
        <SectionTitle id="wallets">Donation addresses</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-3">
          {WALLETS.map((wallet) => (
            <WalletCard key={wallet.id} wallet={wallet} copied={copied === wallet.id} onCopy={() => void copy(wallet.id, wallet.address, `${wallet.name} address copied`)} />
          ))}
        </div>
        <Alert tone="warning">Always double-check the network before you send. Crypto sent on the wrong network can’t be recovered.</Alert>
      </section>

      <section className="space-y-4" aria-labelledby="help">
        <SectionTitle id="help">Other ways to help — all free</SectionTitle>
        <div className={cn('grid gap-3.5 sm:grid-cols-2', listing ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          {listing ? (
            <HelpCard icon={Star} title="Rate us 5 stars" text={`A 5-star review on the ${listing.storeName} helps other people find free, private PDF tools.`} href={listing.reviewUrl} onClick={() => void answerFinal()} testId="help-rate">
              <FiveStars size={14} className="mt-1 flex gap-0.5" />
            </HelpCard>
          ) : null}
          <HelpCard icon={Share2} title="Share with a friend" text="Copy a short note about Unique PDF and send it to anyone who works with PDFs." onClick={() => void copy('share', shareMessage(listing), 'Copied — paste it to a friend')} testId="help-share" />
          <HelpCard icon={Bug} title="Report a bug" text="Spotted something off? Tell us on Telegram and we’ll fix it fast." href={DEVELOPER.telegram} testId="help-bug" />
          <HelpCard icon={Lightbulb} title="Request a feature" text="Got an idea to make Unique PDF better? We build what users ask for — tell us." href={DEVELOPER.telegram} testId="help-feature" />
        </div>
      </section>

      <Card className="relative flex items-start gap-4 overflow-hidden p-6">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(closest-side,rgb(244_63_94/0.14),transparent)]" />
        <span className="relative shrink-0">
          <DeveloperPhoto size={52} className="shadow-[0_8px_20px_-10px_rgb(0_0_0/0.45)] ring-2 ring-surface" />
          <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-[linear-gradient(135deg,#fb7185,#e11d48)] text-white ring-2 ring-surface" aria-hidden>
            <Heart size={11} fill="currentColor" strokeWidth={1.5} />
          </span>
        </span>
        <div className="relative">
          <p className="text-[15px] font-semibold">Thank you — truly.</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">
            Whether you donate, share or simply use Unique PDF, you’re the reason it exists. —{' '}
            <DeveloperLink className="font-medium text-primary hover:underline" testId="donate-developer">
              {DEVELOPER.name}
            </DeveloperLink>
            , Unique Labs
          </p>
        </div>
      </Card>
    </div>
  );
}
