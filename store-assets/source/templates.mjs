/**
 * Shared building blocks for the store graphics and the showcase video: the
 * app's typeface (Geist) and brand colours, Lucide icons, the app icon, and
 * framed crops of the raw UI captures (store-assets/source/raw, made by
 * `npm run store:capture`). Everything renders locally from files.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const KIT = resolve(HERE, '..');
export const RAW = process.env.RAW ? resolve(process.env.RAW) : join(HERE, 'raw');
export const TMP = join(HERE, 'tmp');

const url = (path) => pathToFileURL(path).href;
const FONT = url(join(ROOT, 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'));
export const APP_ICON = url(join(KIT, 'icon-512.png'));
export const DEV_PHOTO = url(join(ROOT, 'public/developer/shahriar-ahmed.webp'));

/** Raw capture by name; app captures are 1440×900 CSS px at 2x, the popup 380×600. */
export function raw(name) {
  const path = join(RAW, `${name}.png`);
  if (!existsSync(path)) throw new Error(`Missing capture ${path}. Run "npm run store:capture" first.`);
  return url(path);
}

const ICON_NAMES = ['sparkles', 'shield-check', 'lock', 'wifi-off', 'zap', 'check', 'pen-line', 'layout-grid', 'messages-square', 'scan-text', 'star', 'cloud-off', 'file-text', 'user-x', 'minimize-2', 'heart'];
const icons = {};
export async function loadIcons() {
  for (const name of ICON_NAMES) {
    const file = join(ROOT, `node_modules/lucide-react/dist/esm/icons/${name}.mjs`);
    if (!existsSync(file)) continue;
    const { __iconData } = await import(url(file));
    icons[name] = __iconData.node
      .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
      .join('');
  }
}

export function icon(name, size = 18, strokeWidth = 2) {
  const inner = icons[name];
  if (!inner) throw new Error(`Icon ${name} not loaded`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const CSS = `
@font-face { font-family: Geist; src: url('${FONT}') format('woff2'); font-weight: 100 900; font-display: block; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --ink: #0a0a0f; --muted: #555561; --canvas: #f7f7f9; --surface: #ffffff; --line: rgba(15, 15, 40, 0.09); --accent: #4f5bff; }
.dark { --ink: #f4f4f8; --muted: #a3a3b2; --canvas: #050507; --surface: #0d0d12; --line: rgba(255, 255, 255, 0.09); --accent: #8c9fff; }
html, body { overflow: hidden; }
body { font-family: Geist, system-ui, sans-serif; background: var(--canvas); color: var(--ink); position: relative; -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
.bg { position: absolute; inset: 0; overflow: hidden; }
.blob { position: absolute; border-radius: 50%; }
.blob.a { width: 70%; aspect-ratio: 1; left: -18%; top: -38%; background: radial-gradient(closest-side, rgba(61, 90, 254, 0.2), transparent); }
.blob.b { width: 60%; aspect-ratio: 1; right: -16%; top: -26%; background: radial-gradient(closest-side, rgba(124, 77, 255, 0.17), transparent); }
.blob.c { width: 60%; aspect-ratio: 1; left: 28%; bottom: -46%; background: radial-gradient(closest-side, rgba(0, 184, 217, 0.13), transparent); }
.dark .blob.a { background: radial-gradient(closest-side, rgba(91, 116, 255, 0.3), transparent); }
.dark .blob.b { background: radial-gradient(closest-side, rgba(143, 107, 255, 0.24), transparent); }
.dark .blob.c { background: radial-gradient(closest-side, rgba(0, 184, 217, 0.14), transparent); }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(10, 10, 25, 0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(10, 10, 25, 0.045) 1px, transparent 1px); background-size: 48px 48px; -webkit-mask-image: radial-gradient(ellipse 85% 75% at 50% 25%, #000 35%, transparent 100%); }
.dark .grid { background-image: linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px); }
.h { font-weight: 760; letter-spacing: -0.042em; line-height: 1.02; }
.grad { background: linear-gradient(115deg, #3d5afe 0%, #7c4dff 55%, #b14dff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.dark .grad { background: linear-gradient(115deg, #7088ff 0%, #9b7bff 55%, #c47bff 100%); -webkit-background-clip: text; background-clip: text; }
.muted { color: var(--muted); }
.abs { position: absolute; }
.shot { position: absolute; overflow: hidden; background: #fff; box-shadow: 0 60px 120px -50px rgba(20, 20, 60, 0.5), 0 24px 48px -24px rgba(20, 20, 60, 0.25), 0 0 0 1px rgba(15, 15, 40, 0.1); }
.shot img { position: absolute; max-width: none; }
.dark .shot, .shot.on-dark { background: #0b0b10; box-shadow: 0 60px 120px -40px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.09); }
.chip { display: inline-flex; align-items: center; gap: 0.5em; padding: 0.6em 1.05em; border-radius: 999px; background: rgba(255, 255, 255, 0.88); border: 1px solid var(--line); box-shadow: 0 8px 18px -12px rgba(20, 20, 60, 0.3); font-weight: 600; color: var(--ink); white-space: nowrap; }
.dark .chip { background: rgba(22, 22, 30, 0.88); }
.chip svg { color: var(--accent); flex: none; }
.chips { display: flex; flex-wrap: wrap; gap: 12px; }
.brand { display: flex; align-items: center; }
.brand img { display: block; }
.brand b { display: block; font-weight: 700; letter-spacing: -0.025em; line-height: 1; }
.brand small { display: block; font-weight: 500; color: var(--muted); margin-top: 0.35em; }
.callout { position: absolute; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); box-shadow: 0 30px 60px -28px rgba(20, 20, 60, 0.45); padding: 18px 20px; }
.q { margin-left: auto; width: fit-content; border-radius: 16px; background: #f1f1f5; padding: 10px 14px; font-weight: 500; }
.dark .q { background: #1c1c25; }
.a { display: flex; gap: 10px; margin-top: 12px; line-height: 1.45; }
.orb { flex: none; width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #b0b8ff, #5b5bff 45%, #9b4dff 80%); box-shadow: 0 4px 12px -4px rgba(91, 91, 255, 0.7); display: grid; place-items: center; color: #fff; }
.cite { display: inline-flex; align-items: center; border-radius: 7px; background: #eef1ff; color: #3d5afe; font-weight: 650; font-size: 0.82em; padding: 1px 7px; margin-left: 4px; }
.dark .cite { background: rgba(112, 136, 255, 0.16); color: #8c9fff; }
.btn { display: inline-flex; align-items: center; gap: 10px; border-radius: 16px; background: linear-gradient(135deg, #4660ff 0%, #7448ff 60%, #9a45f5 100%); color: #fff; font-weight: 650; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.28) inset, 0 18px 40px -16px rgba(91, 91, 255, 0.75); }
`;

/** A complete HTML document of exactly w×h CSS px. */
export function doc(w, h, body, { dark = false, css = '', background = true } = {}) {
  return `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><style>${CSS} html, body { width: ${w}px; height: ${h}px; } ${css}</style></head><body>${background ? '<div class="bg"><div class="blob a"></div><div class="blob b"></div><div class="blob c"></div><div class="grid"></div></div>' : ''}${body}</body></html>`;
}

/**
 * A framed crop of a capture. `region` is [x, y, w, h] in the capture's CSS px;
 * it is scaled to `width` output px. The frame can be taller than the canvas
 * (it is then cut off at the edge, which reads as "the app continues").
 */
export function shot(name, region, { left, top, width, height, radius = 18, style = '', dark = false, app = [1440, 900] }) {
  const [x, y, w, h] = region;
  const k = width / w;
  const frameHeight = height ?? Math.round(h * k);
  return `<div class="shot${dark ? ' on-dark' : ''}" style="left:${left}px;top:${top}px;width:${width}px;height:${frameHeight}px;border-radius:${radius}px;${style}"><img src="${raw(name)}" style="width:${app[0] * k}px;height:${app[1] * k}px;left:${-x * k}px;top:${-y * k}px"></div>`;
}

export function brand(size = 56, { light = false } = {}) {
  return `<div class="brand" style="gap:${Math.round(size * 0.28)}px"><img src="${APP_ICON}" width="${size}" height="${size}" style="border-radius:${Math.round(size * 0.24)}px"><div><b style="font-size:${Math.round(size * 0.46)}px;${light ? 'color:#fff' : ''}">Unique PDF</b><small style="font-size:${Math.round(size * 0.27)}px;${light ? 'color:rgba(255,255,255,.75)' : ''}">by Unique Labs</small></div></div>`;
}

export function chips(items, fontSize = 18) {
  return `<div class="chips" style="font-size:${fontSize}px">${items.map(([ic, text]) => `<span class="chip">${icon(ic, Math.round(fontSize * 1.05))}${text}</span>`).join('')}</div>`;
}

/** A chat exchange card (the real answer format: bold key fact and a page chip). */
export function chatCallout({ left, top, width, fontSize = 17, question, answer, page }) {
  return `<div class="callout" style="left:${left}px;top:${top}px;width:${width}px;font-size:${fontSize}px"><div class="q">${question}</div><div class="a"><span class="orb">${icon('sparkles', 14, 2.4)}</span><div>${answer}<span class="cite">p. ${page}</span></div></div></div>`;
}
