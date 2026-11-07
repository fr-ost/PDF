/**
 * The 14 standard PDF fonts only cover the WinAnsi character set (Western
 * European). Text outside it needs an embedded font. These helpers let the
 * UI warn early instead of failing at export time.
 */
const EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const SUPPORTED = new Set<number>();
for (let c = 0x20; c <= 0x7e; c++) SUPPORTED.add(c);
for (let c = 0xa0; c <= 0xff; c++) SUPPORTED.add(c);
for (const ch of EXTRA) SUPPORTED.add(ch.codePointAt(0)!);

export function isWinAnsiChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  return cp !== undefined && SUPPORTED.has(cp);
}

/** Returns the distinct characters that the standard fonts cannot render. */
export function findUnsupportedChars(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    if (ch === '\n' || ch === '\r' || ch === '\t') continue;
    if (!isWinAnsiChar(ch)) bad.add(ch);
  }
  return [...bad];
}

/** Normalises common typographic characters and replaces anything unsupported. */
export function toWinAnsi(text: string, replacement = '?'): string {
  let out = '';
  for (const ch of text.replace(/\t/g, '    ').replace(/\r\n?/g, '\n')) {
    if (ch === '\n' || isWinAnsiChar(ch)) out += ch;
    else if (ch === ' ' || /\s/.test(ch)) out += ' ';
    else out += replacement;
  }
  return out;
}

export type FontFamily = 'Helvetica' | 'Times' | 'Courier';

export const FONT_FAMILIES: { value: FontFamily; label: string; css: string }[] = [
  { value: 'Helvetica', label: 'Sans serif (Helvetica)', css: 'Helvetica, Arial, "Liberation Sans", sans-serif' },
  { value: 'Times', label: 'Serif (Times)', css: '"Times New Roman", Times, "Liberation Serif", serif' },
  { value: 'Courier', label: 'Monospace (Courier)', css: '"Courier New", Courier, "Liberation Mono", monospace' },
];

/** Ascender heights (fraction of font size) from the standard font AFM files. */
export const FONT_ASCENT: Record<FontFamily, number> = { Helvetica: 0.718, Times: 0.683, Courier: 0.629 };
export const FONT_DESCENT: Record<FontFamily, number> = { Helvetica: 0.207, Times: 0.217, Courier: 0.157 };
export const LINE_HEIGHT = 1.2;
