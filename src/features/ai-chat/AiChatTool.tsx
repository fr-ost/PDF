/**
 * Chat with PDF — Unique AI answers questions about a document, citing the
 * pages it used. The text is extracted locally with PDF.js and indexed for
 * search; Unique AI runs on Chrome's built-in Prompt API. Where the model is
 * unavailable, the same interface returns the best-matching passages,
 * clearly labelled as not AI.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Download, FileUp, SquarePen } from 'lucide-react';
import type { ToolProps } from '../registry';
import { ToolShell } from '../../components/tool/ToolShell';
import { PageThumbnail } from '../../components/tool/PageThumbnail';
import { recordHistory, useToolFiles } from '../../components/tool/helpers';
import { IconButton, Button } from '../../components/ui/Button';
import { Alert, Skeleton } from '../../components/ui/Feedback';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { CHAT_LANGUAGES, DocumentChat, checkChatStatus, citedPages, getLanguageModelApi, searchAnswer, type AskResult, type ChatTurn } from '../../ai/chat';
import { buildIndex, buildPassages, type Passage } from '../../ai/retrieval';
import { suggestQuestions } from '../../ai/suggestions';
import { blocksToPlainText, parseSummaryBlocks } from '../../ai/markdown';
import { makeOutput, saveOutput } from '../../services/export-service/download';
import { baseName } from '../../utils/filenames';
import { cn } from '../../utils/cn';
import { useDocumentText } from '../ai-shared/useDocumentText';
import { AiStatusCard, type AiState } from '../ai-shared/AiStatusCard';
import { UniqueAiMark } from '../ai-shared/UniqueAiMark';
import { ChatMessageView, type Message, type Source } from './ChatMessage';
import { Composer, type ComposerHandle } from './Composer';
import { DocumentRail, type PageFocus } from './DocumentRail';
import { Welcome } from './Welcome';

let sequence = 0;
const nextId = () => `m${++sequence}`;

/** Turns that may be shown to the model: questions with a completed AI answer. */
function toHistory(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  messages.forEach((m, i) => {
    const answer = messages[i + 1];
    if (m.role === 'user' && answer?.role === 'assistant' && answer.kind === 'ai' && answer.status === 'done' && answer.content) {
      turns.push({ role: 'user', content: m.content }, { role: 'assistant', content: answer.content });
    }
  });
  return turns;
}

/** Pages the answer cites (or, without citations, the best matches), each with a snippet. */
function sourcesFor(result: AskResult, pageCount: number): Source[] {
  const byPage = new Map<number, Passage>();
  for (const p of result.ranked.length ? result.ranked.map((r) => r.passage) : result.passages) if (!byPage.has(p.page)) byPage.set(p.page, p);
  const cited = citedPages(result.answer, pageCount);
  const pages = cited.length ? cited : result.mode === 'search' ? [...byPage.keys()].slice(0, 3) : [];
  return pages.map((page) => ({ page, text: byPage.get(page)?.text ?? result.passages.find((p) => p.page === page)?.text ?? '' }));
}

const isDesktop = () => matchMedia('(min-width: 1024px)').matches;
const isAiMode = (status: AiState) => status === 'available' || status === 'downloadable' || status === 'downloading';

export default function AiChatTool({ tool, initialFiles }: ToolProps) {
  const files = useToolFiles(tool, initialFiles);
  const toast = useToast();
  const first = files.entries[0];
  const entry = files.ready[0];
  const pageCount = entry?.pageCount ?? 0;
  const { text, progress, error: textError } = useDocumentText(entry?.id);
  const index = useMemo(() => (text ? buildIndex(buildPassages(text.pages)) : null), [text]);
  const suggestions = useMemo(() => (text ? suggestQuestions(text.pages.join('\n')) : []), [text]);
  const hasText = !!text && text.words >= 20;

  const api = useMemo(getLanguageModelApi, []);
  const [language, setLanguage] = useState('en');
  const [status, setStatus] = useState<AiState>('checking');
  const aiMode = isAiMode(status);
  /** The reply-language picker stays put while a newly chosen language is checked (focus stays on it). */
  const [languagePicker, setLanguagePicker] = useState(false);
  const lastGoodLanguage = useRef('en');

  const [messages, setMessages] = useState<Message[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<PageFocus | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [confirmChange, setConfirmChange] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const chatRef = useRef<DocumentChat | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    setStatus('checking');
    void checkChatStatus(language, api).then((s) => {
      if (cancelled) return;
      if (!isAiMode(s) && language !== lastGoodLanguage.current) {
        // This device can't reply in that language: keep the last one that works.
        const label = CHAT_LANGUAGES.find((l) => l.value === language)?.label ?? language;
        toast.show(`Unique AI can’t reply in ${label} on this device yet.`, 'error');
        setLanguage(lastGoodLanguage.current);
        return;
      }
      if (isAiMode(s)) {
        lastGoodLanguage.current = language;
        setLanguagePicker(true);
      }
      setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [language, api, toast]);

  const getChat = useCallback(() => {
    if (!api) return null;
    if (!chatRef.current || chatRef.current.language !== language) {
      chatRef.current?.destroy();
      chatRef.current = new DocumentChat(api, language);
    }
    return chatRef.current;
  }, [api, language]);

  // Warm up Unique AI as soon as it is ready, so the first answer starts instantly.
  useEffect(() => {
    if (status === 'available' && hasText) void getChat()?.prepare().catch(() => undefined);
  }, [status, hasText, getChat]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      chatRef.current?.destroy();
      chatRef.current = null;
    },
    [],
  );

  // On phones, bring the whole chat panel into view once the document is ready (like a messaging app).
  useEffect(() => {
    if (!hasText || isDesktop()) return;
    panelRef.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [hasText]);

  // A new document starts a new conversation.
  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
    setFocus(null);
    setPreview(null);
    stickRef.current = true;
    setAtBottom(true);
  }, [entry?.id]);

  const update = useCallback((id: string, patch: Partial<Message>) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m))), []);

  /** Must run synchronously inside the click/key handler (the one-time model download needs a user activation). */
  const answer = (question: string, history: ChatTurn[]) => {
    if (!index || !entry) return;
    const id = nextId();
    if (!aiMode) {
      setMessages((ms) => [...ms, { id, role: 'assistant', kind: 'search', question, content: '', status: 'done', results: searchAnswer(index, question) }]);
      return;
    }
    const chat = getChat();
    if (!chat) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyId(id);
    setMessages((ms) => [...ms, { id, role: 'assistant', kind: 'ai', question, content: '', status: 'pending' }]);
    let latest = '';
    let frame = 0;
    const flush = () => {
      frame = 0;
      update(id, { content: latest, status: 'streaming' });
    };
    chat
      .ask(
        { question, history, index, fileName: entry.name, pageCount },
        {
          onStage: (stage) => update(id, { stage }),
          onText: (t) => {
            latest = t;
            if (!frame) frame = requestAnimationFrame(flush);
          },
        },
        controller.signal,
      )
      .then((result) => {
        cancelAnimationFrame(frame);
        if (!result.answer) update(id, { status: 'error', stage: undefined, error: 'Unique AI didn’t return an answer. Try rephrasing your question.' });
        else update(id, { content: result.answer, status: 'done', stage: undefined, sources: sourcesFor(result, pageCount) });
        setStatus('available');
      })
      .catch((err: unknown) => {
        cancelAnimationFrame(frame);
        const e = err as { code?: string; message?: string };
        if (e.code === 'CANCELLED') update(id, { status: 'stopped', stage: undefined, content: latest });
        else update(id, { status: 'error', stage: undefined, content: latest, error: e.message || 'Unique AI couldn’t answer. Try again.' });
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
        setBusyId((current) => (current === id ? null : current));
      });
  };

  const send = (question: string) => {
    if (busyId || !index) return;
    stickRef.current = true;
    const history = toHistory(messages);
    setMessages((ms) => [...ms, { id: nextId(), role: 'user', content: question }]);
    answer(question, history);
  };

  const regenerate = () => {
    const last = messages.at(-1);
    if (busyId || !last || last.role !== 'assistant' || !last.question) return;
    const before = messages.slice(0, -1);
    setMessages(before);
    stickRef.current = true;
    answer(last.question, toHistory(before.slice(0, -1)));
  };
  const regenerateRef = useRef(regenerate);
  useEffect(() => {
    regenerateRef.current = regenerate;
  });
  const onRegenerate = useCallback(() => regenerateRef.current(), []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const newChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setFocus(null);
    stickRef.current = true;
    setAtBottom(true);
    composerRef.current?.focus();
  };

  const onCite = useCallback((page: number) => {
    if (isDesktop()) setFocus({ page, nonce: performance.now() });
    else setPreview(page);
  }, []);

  const onCopy = useCallback(
    async (m: Message) => {
      const value = m.kind === 'search' ? (m.results ?? []).map((r) => `[p. ${r.passage.page}] ${r.passage.text}`).join('\n\n') : blocksToPlainText(parseSummaryBlocks(m.content));
      try {
        await navigator.clipboard.writeText(value);
        setCopiedId(m.id);
        window.setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1600);
      } catch {
        toast.show('Copying isn’t allowed here. Use Export instead.', 'error');
      }
    },
    [toast],
  );

  const exportChat = async () => {
    if (!entry) return;
    const lines = [`# Chat about ${entry.name}`, '', `_Unique AI · ${new Date().toLocaleString()}_`, ''];
    for (const m of messages) {
      if (m.role === 'user') lines.push(`**You:** ${m.content}`, '');
      else if (m.kind === 'search') lines.push('**Unique AI** (best-matching passages, not AI):', '', ...(m.results ?? []).map((r) => `> [p. ${r.passage.page}] ${r.passage.text}`), '');
      else if (m.content) lines.push(`**Unique AI:** ${m.content}`, '');
    }
    const output = makeOutput(`${baseName(entry.name)}-chat.md`, new Blob([lines.join('\n')], { type: 'text/markdown' }), 'text');
    if (await saveOutput(output)) {
      recordHistory(tool, [entry], [output]);
      toast.show(`Saved ${output.name}`, 'success');
    }
  };

  // Keep the newest message in view unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const onScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
    stickRef.current = near;
    setAtBottom(near);
  };
  const jumpToLatest = () => {
    const el = threadRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const previewWidth = Math.max(160, Math.min(360, window.innerWidth - 96));
  const previewPassage = useMemo(() => (preview && index ? index.passages.find((p) => p.page === preview) : undefined), [preview, index]);
  const busy = !!busyId;
  const ready = !!index && hasText && status !== 'checking';
  const statusLine = busy
    ? 'Answering…'
    : status === 'checking'
      ? 'Getting ready…'
      : status === 'available'
        ? 'Ready'
        : aiMode
          ? 'Sets up on your first question'
          : 'Search mode';

  // Phones: the panel fills the screen below the sticky header (see the focus effect). Desktop: below the tool header.
  const panelHeight = 'h-[calc(100dvh-4.5rem)] min-h-[440px] lg:h-[min(880px,calc(100dvh-10.5rem))]';

  return (
    <ToolShell tool={tool} files={files} layout="full" emptyHint="Ask questions and get answers with page references. Your PDF stays private.">
      {!entry ? (
        first?.status === 'error' ? (
          <Alert tone="danger" title="This file can’t be opened" action={<Button size="sm" variant="secondary" onClick={files.clear}>Choose another file</Button>}>
            {first.error}
          </Alert>
        ) : (
          <div className={cn('grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[288px_minmax(0,1fr)]', panelHeight)}>
            <Skeleton className="hidden h-full rounded-[22px] lg:block" />
            <Skeleton className="h-full rounded-[22px]" />
          </div>
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[288px_minmax(0,1fr)]">
          <DocumentRail docId={entry.id} name={entry.name} pageCount={pageCount} words={text?.words ?? null} focus={focus} onSelect={(page) => setFocus({ page, nonce: performance.now() })} className={cn('hidden lg:flex', panelHeight)} />

          <section ref={panelRef} className={cn('relative flex scroll-mt-[4.5rem] flex-col overflow-hidden rounded-[22px] border border-line bg-surface shadow-card', panelHeight)} aria-label="Chat with Unique AI" data-testid="chat-panel">
            <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
              <UniqueAiMark size="sm" thinking={busy} />
              <div className="min-w-0 flex-1">
                <p className="whitespace-nowrap text-[14px] font-semibold leading-5">Unique AI</p>
                <p className="flex items-center gap-1.5 truncate text-[12px] text-fg-muted" data-testid="chat-status-line">
                  {status === 'available' && !busy ? <span className="live-dot" aria-hidden /> : null}
                  {statusLine}
                </p>
              </div>
              {languagePicker && (aiMode || status === 'checking') ? (
                <select
                  aria-label="Reply language"
                  value={language}
                  disabled={busy}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="hidden h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] text-fg-muted outline-none transition-colors hover:text-fg focus-visible:border-primary sm:block dark:bg-surface-2"
                >
                  {CHAT_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <IconButton icon={SquarePen} label="New chat" onClick={newChat} disabled={!messages.length} data-testid="chat-new" />
              <IconButton icon={Download} label="Export chat" onClick={() => void exportChat()} disabled={!messages.length || busy} data-testid="chat-export" />
              <IconButton icon={FileUp} label="Open another PDF" onClick={() => (messages.length ? setConfirmChange(true) : files.clear())} />
            </header>

            {progress ? (
              <div className="shrink-0 border-b border-line bg-primary-soft/40 px-4 py-2.5" data-testid="chat-indexing">
                <div className="flex items-center justify-between text-[12.5px] font-medium">
                  <span className="shimmer-text">Reading your document…</span>
                  <span className="tabular-nums text-fg-muted">
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-[image:var(--brand-gradient)] transition-[width] duration-300" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                </div>
              </div>
            ) : null}

            <div ref={threadRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" data-testid="chat-thread">
              {textError ? (
                <Alert tone="danger">{textError}</Alert>
              ) : text && !hasText ? (
                <Alert tone="warning" title="No selectable text found">
                  This PDF seems to contain scanned images rather than text, so there is nothing to read yet. Text recognition (OCR) is on our roadmap.
                </Alert>
              ) : messages.length === 0 ? (
                <div className="flex min-h-full flex-col">
                  {status !== 'available' && status !== 'checking' ? <AiStatusCard status={status} feature="chat" className="mx-auto w-full max-w-xl" /> : null}
                  <div className="flex-1">
                    <Welcome name={entry.name} pageCount={pageCount} suggestions={suggestions} aiMode={aiMode} disabled={!ready || busy} onAsk={send} />
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-6">
                  {messages.map((m, i) => (
                    <ChatMessageView key={m.id} message={m} pageCount={pageCount} isLast={i === messages.length - 1} copied={copiedId === m.id} onCite={onCite} onCopy={onCopy} onRegenerate={onRegenerate} />
                  ))}
                </div>
              )}
            </div>

            {!atBottom && messages.length ? (
              <button type="button" onClick={jumpToLatest} className="glass absolute bottom-[104px] left-1/2 z-10 inline-flex h-8 -translate-x-1/2 animate-pop-in items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-medium text-fg-muted shadow-raised hover:text-fg">
                <ArrowDown size={13} aria-hidden /> Latest
              </button>
            ) : null}

            <Composer
              ref={composerRef}
              disabled={!ready}
              busy={busy}
              placeholder={aiMode ? 'Ask Unique AI about this document…' : 'Search this document…'}
              onSend={send}
              onStop={stop}
            />
            <p className="sr-only" aria-live="polite">
              {busy ? '' : messages.at(-1)?.role === 'assistant' && messages.at(-1)?.status === 'done' ? 'Unique AI answered.' : ''}
            </p>
          </section>
        </div>
      )}

      <Dialog open={preview !== null} onClose={() => setPreview(null)} title={`Page ${preview ?? ''}`} size="md">
        {preview !== null && entry ? (
          <div className="space-y-3 pb-3" data-testid="page-preview">
            {/* The thumbnail fills its container, so the container needs a definite width. */}
            <div className="mx-auto overflow-hidden rounded-lg shadow-[0_0_0_1px_var(--color-line),0_10px_24px_-12px_rgb(0_0_0/0.35)]" style={{ width: previewWidth }}>
              <PageThumbnail docId={entry.id} pageIndex={preview - 1} width={previewWidth} />
            </div>
            {previewPassage ? <p className="line-clamp-6 text-[13.5px] leading-relaxed text-fg-muted">{previewPassage.text}</p> : null}
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirmChange}
        onCancel={() => setConfirmChange(false)}
        onConfirm={() => {
          setConfirmChange(false);
          abortRef.current?.abort();
          files.clear();
        }}
        title="Open another PDF?"
        message="This conversation will be cleared."
        confirmLabel="Open another"
      />
    </ToolShell>
  );
}
