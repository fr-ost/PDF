/**
 * AI Summary — Unique AI summaries, built on Chrome's built-in Summarizer API.
 * Document text is extracted locally with PDF.js and summarised by the
 * browser's model; nothing is uploaded. Where the model is
 * not available, a clearly labelled non-AI "key sentences" summary is offered.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Heading1, Info, ListChecks, Megaphone, Quote, RefreshCw, ScanText, Sparkles, Wand2, Zap } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageThumbnail } from '../../components/tool/PageThumbnail';
import { PageRangeField, recordHistory, useToolFiles } from '../../components/tool/helpers';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Alert, Badge } from '../../components/ui/Feedback';
import { ChoiceCards, Field, Segmented, Select, TextInput, type ChoiceOption } from '../../components/ui/Form';
import { useToast } from '../../components/ui/Toast';
import { useTask } from '../../hooks/useTask';
import { parsePageRanges } from '../../pdf/pageRanges';
import { extractiveSummary } from '../../ai/extractive';
import { blocksToPlainText, parseSummaryBlocks } from '../../ai/markdown';
import { OUTPUT_LANGUAGES, checkAiStatus, summarizeDocument, type AiStatus, type SummaryLength, type SummaryStage, type SummaryStyle } from '../../ai/summarizer';
import { makeOutput, saveOutput } from '../../services/export-service/download';
import { baseName } from '../../utils/filenames';
import { pluralize } from '../../utils/format';
import { SummaryView } from './SummaryView';
import { useDocumentText } from '../ai-shared/useDocumentText';
import { AiStatusCard } from '../ai-shared/AiStatusCard';

interface SummaryResult {
  markdown: string;
  kind: 'ai' | 'quick';
}

const STYLES: ChoiceOption<SummaryStyle>[] = [
  { value: 'key-points', label: 'Key points', description: 'The essentials as bullets', icon: ListChecks },
  { value: 'tldr', label: 'TL;DR', description: 'A short overview', icon: Zap },
  { value: 'teaser', label: 'Teaser', description: 'The most intriguing parts', icon: Megaphone },
  { value: 'headline', label: 'Headline', description: 'One line, the main point', icon: Heading1 },
];

function stageLabel(stage: SummaryStage): string {
  switch (stage.kind) {
    case 'download':
      return `Setting up Unique AI… ${Math.round(stage.progress * 100)}%`;
    case 'preparing':
      return 'Reading the document';
    case 'chunk':
      return `Summarizing part ${stage.index} of ${stage.total}`;
    case 'combine':
      return 'Combining the parts';
    case 'writing':
      return 'Writing the summary';
  }
}

function stageProgress(stage: SummaryStage): number | null {
  if (stage.kind === 'download') return stage.progress * 0.95;
  if (stage.kind === 'chunk') return 0.1 + ((stage.index - 1) / stage.total) * 0.75;
  if (stage.kind === 'preparing') return 0.05;
  return null;
}

export default function AiSummaryTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const task = useTask<SummaryResult>();
  const toast = useToast();
  const [style, setStyle] = useState<SummaryStyle>('key-points');
  const [length, setLength] = useState<SummaryLength>('medium');
  const [language, setLanguage] = useState<string>('en');
  const [focus, setFocus] = useState('');
  const [pagesMode, setPagesMode] = useState<'all' | 'custom'>('all');
  const [range, setRange] = useState('');
  const [status, setStatus] = useState<AiStatus | 'checking'>('checking');
  const [streamText, setStreamText] = useState('');
  const [result, setResult] = useState<SummaryResult | null>(null);
  const entry = files.ready[0];
  const pageCount = entry?.pageCount ?? 0;
  const runId = useRef(0);
  const { text: extracted, progress: extracting, error: extractError } = useDocumentText(entry?.id);

  // Availability of the model for the chosen options.
  useEffect(() => {
    let cancelled = false;
    setStatus('checking');
    void checkAiStatus({ style, length, outputLanguage: language }).then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, [style, length, language]);

  // A new document starts with an empty summary.
  useEffect(() => {
    setResult(null);
    setStreamText('');
  }, [entry?.id]);

  const parsedRange = pagesMode === 'custom' ? parsePageRanges(range, pageCount || 1) : null;
  const selectedPages = useMemo(() => {
    if (!extracted) return [];
    if (pagesMode === 'all') return extracted.pages;
    return parsedRange?.ok ? [...parsedRange.pages].sort((a, b) => a - b).map((i) => extracted.pages[i] ?? '') : [];
  }, [extracted, pagesMode, parsedRange]);
  const selectedText = selectedPages.join('\n\n').trim();
  const hasText = !!extracted && extracted.words >= 20;
  const aiReady = status === 'available' || status === 'downloadable' || status === 'downloading';
  const stem = baseName(entry?.name ?? 'document');

  const finish = (markdown: string, kind: SummaryResult['kind']) => {
    const output = makeOutput(`${stem}-summary.md`, new Blob([markdown], { type: 'text/markdown' }), 'text');
    recordHistory(tool, entry ? [entry] : [], [output]);
    const r = { markdown, kind };
    setResult(r);
    return r;
  };

  const runAi = () => {
    const id = ++runId.current;
    setResult(null);
    setStreamText('');
    return task.run(async ({ signal, progress }) => {
      // summarizeDocument calls Chrome's create() synchronously — this must stay
      // inside the click for the one-time model download (user activation).
      const markdown = await summarizeDocument(
        selectedPages,
        { style, length, outputLanguage: language, focus, title: entry?.name ?? 'document' },
        {
          onStage: (s) => progress(stageProgress(s), stageLabel(s)),
          onText: (t) => id === runId.current && setStreamText(t),
        },
        signal,
      );
      if (status !== 'available') setStatus('available');
      return finish(markdown, 'ai');
    });
  };

  const runQuick = () => {
    runId.current++;
    task.reset();
    const count = length === 'short' ? 3 : length === 'medium' ? 6 : 10;
    const sentences = extractiveSummary(selectedText, { sentences: style === 'headline' ? 1 : count });
    setStreamText('');
    finish(sentences.map((s) => `* ${s}`).join('\n'), 'quick');
  };

  const shown = task.running ? streamText : (result?.markdown ?? '');
  const shownKind = task.running ? 'ai' : result?.kind;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(blocksToPlainText(parseSummaryBlocks(shown)));
      toast.show('Summary copied to the clipboard', 'success');
    } catch {
      toast.show('Copying is not allowed here. Use Download instead.', 'error');
    }
  };

  const download = async () => {
    const header = `# Summary of ${entry?.name ?? 'document'}\n\n_${shownKind === 'quick' ? 'Key sentences extracted from the document (not AI-generated).' : 'Generated by Unique AI. Check important details against the document.'}_\n\n`;
    const output = makeOutput(`${stem}-summary.md`, new Blob([header + shown + '\n'], { type: 'text/markdown' }), 'text');
    if (await saveOutput(output)) toast.show(`Saved ${output.name}`, 'success');
  };

  const primaryDisabled = !entry || !hasText || !selectedText || status === 'checking';
  const primary = aiReady
    ? { label: status === 'available' ? 'Summarize with AI' : 'Set up AI & summarize', onClick: () => void runAi(), disabled: primaryDisabled }
    : { label: 'Quick summary', onClick: runQuick, disabled: !entry || !hasText || !selectedText, hint: 'Unique AI isn’t available on this device.' };

  return (
    <ToolShell
      tool={tool}
      files={files}
      task={task}
      emptyHint="Unique AI turns long PDFs into clear key points in seconds. Your PDF stays private."
      primary={primary}
      onRetry={() => void runAi()}
      options={
        <>
          <AiStatusCard status={status} feature="summary" />
          <Field label="Summary style">
            <ChoiceCards label="Summary style" value={style} onChange={setStyle} options={STYLES} />
          </Field>
          <Field label="Length">
            <Segmented label="Summary length" size="sm" value={length} onChange={setLength} options={[{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'long', label: 'Long' }]} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language" htmlFor="ai-lang">
              <Select id="ai-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {OUTPUT_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Pages">
              <Segmented label="Pages to summarize" size="sm" value={pagesMode} onChange={setPagesMode} options={[{ value: 'all', label: 'All' }, { value: 'custom', label: 'Range' }]} />
            </Field>
          </div>
          {pagesMode === 'custom' ? <PageRangeField value={range} onChange={setRange} pageCount={pageCount} /> : null}
          <Field label="Focus (optional)" htmlFor="ai-focus" hint="Tell the AI what matters to you.">
            <TextInput id="ai-focus" value={focus} maxLength={200} placeholder="e.g. deadlines, costs and risks" onChange={(e) => setFocus(e.target.value)} />
          </Field>
          {aiReady ? (
            <Button className="w-full" variant="secondary" icon={Quote} onClick={runQuick} disabled={!hasText || !selectedText || task.running} data-testid="quick-summary-button">
              Quick summary (no AI)
            </Button>
          ) : null}
        </>
      }
    >
      {entry ? (
        <div className="space-y-4">
          <Card className="flex items-center gap-4 p-4">
            <div className="w-14 shrink-0 overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line),0_4px_10px_-4px_rgb(0_0_0/0.18)]">
              <PageThumbnail docId={entry.id} pageIndex={0} width={56} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{entry.name}</p>
              <p className="mt-0.5 text-sm text-fg-muted">
                {pluralize(pageCount, 'page')}
                {extracted ? ` · ${pluralize(extracted.words, 'word')}` : ''}
                {pagesMode === 'custom' && parsedRange?.ok ? ` · summarizing ${pluralize(parsedRange.pages.length, 'page')}` : ''}
              </p>
            </div>
            {extracting ? (
              <span className="text-xs text-fg-subtle" aria-live="polite">Reading text… {extracting.done}/{extracting.total}</span>
            ) : (
              <span className="hidden items-center gap-1.5 text-xs text-fg-subtle sm:inline-flex"><ScanText size={14} aria-hidden /> Ready for Unique AI</span>
            )}
          </Card>

          {extractError ? <Alert tone="danger">{extractError}</Alert> : null}
          {extracted && !hasText ? (
            <Alert tone="warning" title="No selectable text found">
              This PDF seems to contain scanned images rather than text, so there is nothing to summarize yet. Text recognition (OCR) is on our roadmap.
            </Alert>
          ) : null}

          <Card className="relative overflow-hidden">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,var(--blob-b),transparent)]" />
            <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[image:var(--brand-gradient)] text-white">
                  <Sparkles size={14} aria-hidden />
                </span>
                <h2 className="text-[15px] font-semibold tracking-tight">Summary</h2>
                <span data-testid="summary-kind">{shownKind === 'ai' ? <Badge tone="primary">Unique AI</Badge> : shownKind === 'quick' ? <Badge>Key sentences · not AI</Badge> : null}</span>
              </div>
              {shown && !task.running ? (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" icon={Copy} onClick={() => void copy()} data-testid="copy-summary">Copy</Button>
                  <Button size="sm" variant="ghost" icon={Download} onClick={() => void download()} data-testid="download-summary">Download</Button>
                  {aiReady ? <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void runAi()}>Regenerate</Button> : null}
                </div>
              ) : null}
            </div>
            <div className="relative min-h-[260px] px-6 py-5">
              {shown || task.running ? (
                <SummaryView markdown={shown} streaming={task.running} />
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="relative">
                    <div aria-hidden className="absolute inset-0 scale-[2.2] rounded-full bg-[radial-gradient(closest-side,var(--blob-b),transparent)]" />
                    <div className="relative flex h-14 w-14 animate-float items-center justify-center rounded-2xl border border-line bg-surface text-fg-muted shadow-raised">
                      <Wand2 size={22} aria-hidden />
                    </div>
                  </div>
                  <p className="mt-5 text-[15px] font-semibold tracking-tight">Your summary will appear here</p>
                  <p className="mt-1 max-w-sm text-sm text-fg-muted">
                    {aiReady ? 'Choose a style and press “Summarize with AI”.' : 'Press “Quick summary” to pull out the key sentences.'}
                  </p>
                </div>
              )}
            </div>
            {shown && !task.running ? (
              <p className="relative flex items-start gap-2 border-t border-line px-5 py-3 text-xs text-fg-subtle">
                <Info size={13} className="mt-px shrink-0" aria-hidden />
                {shownKind === 'quick'
                  ? 'These sentences are copied from the document by a simple statistical method — no AI was used.'
                  : 'Written by Unique AI. AI can make mistakes, so check important details against the document.'}
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}
    </ToolShell>
  );
}
