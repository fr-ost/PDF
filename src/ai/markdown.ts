/**
 * Tiny, safe parser for the Markdown subset the summarizer produces
 * (bullets, numbered items, headings, paragraphs, **bold**, *italic*,
 * `code`). Output is plain data rendered as React text — never HTML.
 */
export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };
export type Block =
  | { kind: 'heading'; inline: Inline[] }
  | { kind: 'bullet'; inline: Inline[] }
  | { kind: 'numbered'; inline: Inline[]; n: number }
  | { kind: 'paragraph'; inline: Inline[] };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  // Emphasis markers must not touch letters/digits on the outside, so
  // "quarterly_report_final.pdf" and "2*3*4" stay as they are.
  const re = /(?<![\p{L}\p{N}])(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)(?![\p{L}\p{N}])|`[^`]+`/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx) });
    const token = m[0];
    if (token.startsWith('**') || token.startsWith('__')) out.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith('`')) out.push({ text: token.slice(1, -1), code: true });
    else out.push({ text: token.slice(1, -1), italic: true });
    last = idx + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((i) => i.text.length > 0);
}

export function parseSummaryBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^#{1,6}\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ kind: 'heading', inline: parseInline(m[1]!) });
    } else if ((m = /^[*\-•+]\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ kind: 'bullet', inline: parseInline(m[1]!) });
    } else if ((m = /^(\d{1,3})[.)]\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ kind: 'numbered', n: Number(m[1]), inline: parseInline(m[2]!) });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** Plain-text rendering (for copying and .txt export). */
export function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      const text = b.inline.map((i) => i.text).join('');
      if (b.kind === 'bullet') return `• ${text}`;
      if (b.kind === 'numbered') return `${b.n}. ${text}`;
      return text;
    })
    .join('\n');
}
