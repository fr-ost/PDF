/**
 * The showcase video: store-assets/unique-pdf-showcase.mp4 (1920×1080, 30 fps,
 * H.264 + AAC, about 45 s). Each scene is an HTML layout made from the raw UI
 * captures; every frame is rendered in Chromium (text slides in, slow camera
 * moves) and piped to ffmpeg. Scenes are joined with crossfades and laid over
 * an original music bed synthesized by music.py.
 *
 * Run: npm run store:video   (needs ffmpeg and python3 with numpy)
 *      STILLS=1 node video.mjs   saves one still per scene instead
 */
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ICON, DEV_PHOTO, HERE, KIT, TMP, brand, chatCallout, chips, doc, icon, loadIcons, shot } from './templates.mjs';

await loadIcons();
const W = 1920;
const H = 1080;
const FPS = 30;
const FADE = 0.6;
const OUT = join(KIT, 'unique-pdf-showcase.mp4');

const VIDEO_CSS = `
.in1, .in2, .in3, .in4, .in5, .in6 { will-change: transform, opacity; }
.in1 { opacity: var(--a1); transform: translateY(calc((1 - var(--a1)) * 40px)); }
.in2 { opacity: var(--a2); transform: translateY(calc((1 - var(--a2)) * 40px)); }
.in3 { opacity: var(--a3); transform: translateY(calc((1 - var(--a3)) * 40px)); }
.in4 { opacity: var(--a4); transform: translateY(calc((1 - var(--a4)) * 40px)); }
.in5 { opacity: var(--a5); transform: translateY(calc((1 - var(--a5)) * 30px)) scale(calc(0.94 + 0.06 * var(--a5))); }
.in6 { opacity: var(--a6); transform: translateY(calc((1 - var(--a6)) * 30px)); }
.pop { opacity: var(--a1); transform: scale(calc(0.72 + 0.28 * var(--pop))); }
.cam { position: absolute; inset: 0; transform-origin: var(--ox, 50%) var(--oy, 50%); transform: scale(calc(1 + var(--zoom, 0.06) * var(--e))) translate(calc(var(--e) * var(--dx, 0px)), calc(var(--e) * var(--dy, 0px))); }
.camin { opacity: var(--a2); }
.blob.a { transform: translate(calc(var(--p) * 90px), calc(var(--p) * 40px)); }
.blob.b { transform: translate(calc(var(--p) * -70px), calc(var(--p) * 50px)); }
.blob.c { transform: translate(calc(var(--p) * 40px), calc(var(--p) * -60px)); }
`;

const scene = (body, opts = {}) => doc(W, H, body, { ...opts, css: VIDEO_CSS + (opts.css ?? '') });

/** Left-hand title block used by the feature scenes. */
const title = (kicker, heading, sub) => `
  <div class="abs" style="left:120px;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center">
    <div class="in1"><span class="chip" style="font-size:24px">${icon(kicker[0], 26)}${kicker[1]}</span></div>
    <h1 class="h in2" style="font-size:96px;margin-top:30px">${heading}</h1>
    <p class="muted in3" style="font-size:32px;line-height:1.38;margin-top:26px">${sub}</p>
  </div>`;

const SCENES = [
  {
    name: 'intro',
    seconds: 4.2,
    html: () =>
      scene(`
        <div class="abs" style="inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
          <img class="pop" src="${APP_ICON}" width="210" height="210" style="border-radius:50px;box-shadow:0 40px 90px -30px rgba(91,91,255,.65)">
          <h1 class="h in2" style="font-size:132px;margin-top:46px">Unique PDF</h1>
          <p class="in3" style="font-size:44px;font-weight:600;margin-top:22px;letter-spacing:-.02em">Free PDF tools with <span class="grad">Unique AI</span></p>
          <p class="muted in4" style="font-size:28px;margin-top:20px">by Unique Labs</p>
        </div>`),
  },
  {
    name: 'chat',
    seconds: 7,
    vars: { '--zoom': 0.07, '--ox': '45%', '--oy': '40%' },
    html: () =>
      scene(`
        ${title(['sparkles', 'Unique AI'], 'Chat with<br>any <span class="grad">PDF</span>', 'Ask anything. Answers link to the pages they come from.')}
        <div class="cam camin">${shot('chat-light', [600, 124, 812, 748], { left: 860, top: 96, width: 980 })}</div>
        <div class="in5">${chatCallout({ left: 700, top: 690, width: 620, fontSize: 27, question: 'How many warehouses were merged?', answer: '<b>Two regional warehouses</b> were merged into one automated facility', page: 2 })}</div>`),
  },
  {
    name: 'summary',
    seconds: 6,
    vars: { '--zoom': 0.06, '--ox': '40%', '--oy': '35%' },
    html: () =>
      scene(`
        ${title(['sparkles', 'Unique AI'], 'Long PDF?<br>Get the <span class="grad">key points</span>', 'Key points, a TL;DR, a teaser or a headline — in seconds.')}
        <div class="cam camin">${shot('summary-light', [296, 120, 1112, 520], { left: 830, top: 250, width: 1240 })}</div>`),
  },
  {
    name: 'tools',
    seconds: 6,
    vars: { '--zoom': 0.02, '--dy': '-150px', '--ox': '50%', '--oy': '0%' },
    html: () =>
      scene(`
        <div class="abs" style="left:0;right:0;top:86px;text-align:center">
          <h1 class="h in2" style="font-size:96px">20 tools. <span class="grad">All free.</span></h1>
          <p class="muted in3" style="font-size:32px;margin-top:22px">Merge · Split · Compress · Convert · Edit · Sign · Protect · Redact</p>
        </div>
        <div class="cam camin">${shot('tools-light', [290, 168, 1130, 900], { left: 230, top: 340, width: 1460 })}</div>`),
  },
  {
    name: 'edit',
    seconds: 5.5,
    vars: { '--zoom': 0.08, '--ox': '55%', '--oy': '30%' },
    html: () =>
      scene(`
        ${title(['pen-line', 'Edit &amp; sign'], 'Edit and <span class="grad">sign</span>', 'Text, highlights, shapes, images and your signature.')}
        <div class="cam camin">${shot('editor-light', [280, 112, 1160, 788], { left: 840, top: 150, width: 1240 })}</div>`),
  },
  {
    name: 'redact',
    seconds: 5.5,
    vars: { '--zoom': 0.08, '--ox': '45%', '--oy': '35%' },
    html: () =>
      scene(`
        ${title(['shield-check', 'Redact'], 'Redact <span class="grad">for real</span>', 'The text is removed, not just covered — and checked.')}
        <div class="cam camin">${shot('redact-light', [280, 112, 1160, 788], { left: 840, top: 150, width: 1240 })}</div>`),
  },
  {
    name: 'compress',
    seconds: 5,
    vars: { '--zoom': 0.07, '--ox': '40%', '--oy': '30%' },
    html: () =>
      scene(
        `
        ${title(['minimize-2', 'Compress'], 'Smaller <span class="grad">files</span>', 'Images are optimised; text stays sharp and searchable.')}
        <div class="cam camin">${shot('compress-dark', [280, 112, 1160, 520], { left: 840, top: 300, width: 1240, dark: true })}</div>`,
        { dark: true },
      ),
  },
  {
    name: 'privacy',
    seconds: 4.6,
    html: () =>
      scene(`
        <div class="abs" style="inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
          <div class="in1" style="width:120px;height:120px;border-radius:36px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#4660ff,#9a45f5);box-shadow:0 30px 70px -26px rgba(91,91,255,.7)">${icon('shield-check', 64, 2)}</div>
          <h1 class="h in2" style="font-size:108px;margin-top:44px">Your files <span class="grad">never leave</span><br>your device</h1>
          <div style="display:flex;gap:18px;margin-top:48px;font-size:28px">
            <span class="chip in3">${icon('cloud-off', 30)}No uploads</span>
            <span class="chip in4">${icon('wifi-off', 30)}Works offline</span>
            <span class="chip in6">${icon('user-x', 30)}No account</span>
            <span class="chip in5">${icon('heart', 30)}Free</span>
          </div>
        </div>`),
  },
  {
    name: 'outro',
    seconds: 5.6,
    html: () =>
      scene(`
        <div class="abs" style="inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
          <img class="pop" src="${APP_ICON}" width="170" height="170" style="border-radius:40px;box-shadow:0 40px 90px -30px rgba(91,91,255,.65)">
          <h1 class="h in2" style="font-size:118px;margin-top:40px">Unique PDF</h1>
          <div class="in3" style="margin-top:40px"><span class="btn" style="font-size:40px;padding:24px 40px">${icon('zap', 38, 2.2)}Add to Chrome — it’s free</span></div>
          <div class="in5" style="display:flex;align-items:center;gap:18px;margin-top:64px;font-size:28px">
            <img src="${DEV_PHOTO}" width="64" height="64" style="border-radius:50%;box-shadow:0 0 0 3px #fff,0 0 0 5px #7c4dff">
            <span class="muted">Developed by <b style="color:var(--ink)">Shahriar Ahmed</b> · Unique Labs · www.shahriarahmed.net</span>
          </div>
        </div>`),
  },
];

const clamp = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - (1 - clamp(x)) ** 3;
const easeInOut = (x) => -(Math.cos(Math.PI * clamp(x)) - 1) / 2;
const easeOutBack = (x) => {
  const c = 1.4;
  const v = clamp(x) - 1;
  return 1 + (c + 1) * v ** 3 + c * v ** 2;
};
const DELAYS = [0.12, 0.36, 0.62, 1.0, 2.2, 1.45];

function frameVars(t, seconds) {
  const vars = { '--p': t / seconds, '--e': easeInOut(t / seconds), '--pop': easeOutBack(t / 0.8) };
  DELAYS.forEach((d, i) => (vars[`--a${i + 1}`] = easeOut((t - d) / 0.7)));
  return vars;
}

function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    if (input) input(p.stdin);
  });
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const segments = [];
for (const [index, s] of SCENES.entries()) {
  const file = join(TMP, `${s.name}.html`);
  writeFileSync(file, s.html());
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(async (fixed) => {
    for (const [k, v] of Object.entries(fixed)) document.documentElement.style.setProperty(k, String(v));
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => img.addEventListener('load', r, { once: true })))));
  }, s.vars ?? {});
  const setVars = (vars) => page.evaluate((v) => Object.entries(v).forEach(([k, val]) => document.documentElement.style.setProperty(k, String(val))), vars);
  if (process.env.STILLS) {
    await setVars(frameVars(s.seconds * 0.6, s.seconds));
    await page.screenshot({ path: join(KIT, 'source', `still-${index + 1}-${s.name}.png`) });
    console.log(`still ${s.name}`);
    continue;
  }
  const segment = join(TMP, `${String(index).padStart(2, '0')}-${s.name}.mp4`);
  const frames = Math.round(s.seconds * FPS);
  await ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', segment], async (stdin) => {
    for (let f = 0; f < frames; f++) {
      await setVars(frameVars(f / FPS, s.seconds));
      const jpg = await page.screenshot({ type: 'jpeg', quality: 94 });
      if (!stdin.write(jpg)) await new Promise((r) => stdin.once('drain', r));
    }
    stdin.end();
  });
  segments.push({ file: segment, seconds: frames / FPS });
  console.log(`✓ ${s.name} (${frames} frames)`);
}
await browser.close();
if (process.env.STILLS) process.exit(0);

// Crossfade the scenes together.
const total = segments.reduce((sum, s) => sum + s.seconds, 0) - FADE * (segments.length - 1);
let graph = '';
let last = '[0:v]';
let offset = 0;
for (let i = 1; i < segments.length; i++) {
  offset += segments[i - 1].seconds - FADE;
  const label = i === segments.length - 1 ? '[v]' : `[x${i}]`;
  graph += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${label};`;
  last = label;
}
const silent = join(TMP, 'silent.mp4');
await ffmpeg([...segments.flatMap((s) => ['-i', s.file]), '-filter_complex', graph.slice(0, -1), '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), silent]);

// Music sized to the cut, loudness-normalised, then muxed.
const music = join(TMP, 'music.wav');
execFileSync('python3', [join(HERE, 'music.py'), total.toFixed(2), music], { stdio: 'inherit' });
await ffmpeg(['-i', silent, '-i', music, '-filter_complex', '[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);
try {
  await ffmpeg(['-i', music, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'libmp3lame', '-b:a', '192k', join(KIT, 'unique-pdf-showcase-music.mp3')]);
} catch {
  console.log('(no MP3 encoder; the music is in the video only)');
}
if (existsSync(OUT)) console.log(`✓ ${OUT} (${total.toFixed(1)} s)`);
rmSync(TMP, { recursive: true, force: true });
