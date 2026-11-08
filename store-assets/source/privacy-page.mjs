/**
 * Builds store-assets/listing/privacy-policy.html from PRIVACY.md: one
 * self-contained page (no external fonts, scripts or images) ready to host
 * at the "Privacy policy URL" of the store listing. Run: node privacy-page.mjs
 * (also part of npm run store:render).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KIT, ROOT } from './templates.mjs';

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  escape(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');

function markdownToHtml(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (row) => row.slice(1, row.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const list = line.match(/^(\s*)([-*]|\d+\.)\s+/);
    if (list) {
      const ordered = /\d/.test(list[2]);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\||\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

const md = readFileSync(join(ROOT, 'PRIVACY.md'), 'utf8');
const body = markdownToHtml(md);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — Unique PDF</title>
<meta name="description" content="How Unique PDF handles your files: everything is processed in your browser; nothing is collected, uploaded or shared.">
<style>
  :root { color-scheme: light dark; --ink: #0a0a0f; --muted: #555561; --line: #e8e8ee; --bg: #f7f7f9; --card: #fff; --accent: #3d5afe; --code: #f1f1f5; }
  @media (prefers-color-scheme: dark) { :root { --ink: #f4f4f8; --muted: #a3a3b2; --line: #24242f; --bg: #050507; --card: #0d0d12; --accent: #8c9fff; --code: #1c1c25; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 20px 64px; }
  article { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 40px clamp(20px, 5vw, 48px); }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; font-weight: 650; }
  .logo { width: 40px; height: 40px; border-radius: 11px; background: linear-gradient(135deg, #4660ff, #7448ff 60%, #9a45f5); display: grid; place-items: center; }
  .brand small { display: block; color: var(--muted); font-weight: 500; font-size: 13px; }
  h1 { font-size: 34px; line-height: 1.15; letter-spacing: -0.03em; margin: 0 0 8px; }
  h2 { font-size: 21px; letter-spacing: -0.02em; margin: 36px 0 10px; }
  p, li { color: var(--ink); }
  p > em:only-child { color: var(--muted); font-style: normal; }
  a { color: var(--accent); }
  code { background: var(--code); border-radius: 6px; padding: 1px 6px; font-size: 0.9em; }
  ul, ol { padding-left: 1.3em; }
  li { margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 15px; }
  th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
  footer { color: var(--muted); font-size: 14px; text-align: center; margin-top: 24px; }
</style>
</head>
<body>
<main>
<article>
<div class="brand"><span class="logo" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg></span><span>Unique PDF<small>by Unique Labs</small></span></div>
${body}
</article>
<footer>Unique PDF · Unique Labs · Developed by <a href="https://www.shahriarahmed.net" rel="noopener">Shahriar Ahmed</a></footer>
</main>
</body>
</html>
`;
const out = join(KIT, 'listing', 'privacy-policy.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`✓ ${out}`);
