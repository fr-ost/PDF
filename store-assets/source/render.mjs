/**
 * Renders the store graphics at their exact sizes (24-bit PNG, no alpha) from
 * the raw UI captures: promo tiles, the five designed screenshots, social
 * images and Google Ads images. Run: npm run store:render  (or: node render.mjs <name>)
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ICON, DEV_PHOTO, KIT, ROOT, TMP, brand, chatCallout, chips, doc, icon, loadIcons, shot } from './templates.mjs';

await loadIcons();

// Crop regions of the 1440×900 captures (CSS px): the app without its sidebar.
const CONTENT = [280, 112, 1160, 788];
const CHAT_PANEL = [600, 124, 812, 748];

const screenshot = ({ kicker, title, sub, capture, region = CONTENT, dark = false }) =>
  doc(
    1280,
    800,
    `<div class="abs" style="left:0;right:0;top:54px;text-align:center">
       <span class="chip" style="font-size:17px">${icon(kicker[0], 18)}${kicker[1]}</span>
       <h1 class="h" style="font-size:56px;margin-top:20px">${title}</h1>
       <p class="muted" style="font-size:21px;margin-top:14px;line-height:1.4">${sub}</p>
     </div>
     ${shot(capture, region, { left: 96, top: 278, width: 1088, dark })}`,
    { dark },
  );

const ASSETS = {
  // ---- Chrome Web Store -------------------------------------------------------
  'promo-small-440x280': {
    w: 440,
    h: 280,
    html: () =>
      doc(
        440,
        280,
        `<div class="abs" style="inset:0;background:linear-gradient(135deg,#3d5afe 0%,#6a4dff 55%,#9a45f5 100%)"></div>
         <div class="abs" style="width:340px;height:340px;right:-120px;top:-150px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.28),transparent)"></div>
         <div class="abs" style="width:300px;height:300px;left:-130px;bottom:-170px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,184,217,.35),transparent)"></div>
         <div class="abs" style="left:32px;top:30px;display:flex;align-items:center;gap:14px">
           <img src="${APP_ICON}" width="62" height="62" style="border-radius:16px;box-shadow:0 10px 24px -10px rgba(0,0,0,.45),0 0 0 2px rgba(255,255,255,.35)">
           <div style="color:#fff"><div class="h" style="font-size:36px">Unique PDF</div><div style="font-size:14px;font-weight:500;opacity:.8;margin-top:4px">by Unique Labs</div></div>
         </div>
         <p class="abs" style="left:32px;right:28px;top:118px;color:#fff;font-size:22px;font-weight:650;line-height:1.25;letter-spacing:-.02em">Chat with any PDF.<br>Edit, merge, compress &amp; sign.</p>
         <div class="abs" style="left:32px;bottom:26px;display:flex;gap:8px;font-size:13px;font-weight:650;color:#fff">
           ${['Free', 'Nothing uploaded', 'AI chat'].map((t) => `<span style="padding:6px 11px;border-radius:999px;background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)">${t}</span>`).join('')}
         </div>`,
        { background: false },
      ),
  },
  'promo-marquee-1400x560': {
    w: 1400,
    h: 560,
    html: () =>
      doc(
        1400,
        560,
        `<div class="abs" style="left:84px;top:70px;width:560px">
           ${brand(58)}
           <h1 class="h" style="font-size:60px;margin-top:34px">The free PDF editor<br>with <span class="grad">AI chat</span></h1>
           <p class="muted" style="font-size:20px;line-height:1.45;margin-top:18px">Chat with any PDF, get instant summaries, and edit, merge, compress, sign and protect. Your files never leave your device.</p>
           <div style="margin-top:26px">${chips([['sparkles', 'Unique AI'], ['lock', 'Nothing uploaded'], ['zap', '20 tools, free']], 16)}</div>
         </div>
         ${shot('chat-light', [290, 18, 1130, 860], { left: 712, top: 54, width: 760 })}
         ${chatCallout({ left: 650, top: 380, width: 380, fontSize: 16, question: 'What are the main risks?', answer: '<b>Supplier concentration, rising interest rates</b> and stricter data rules', page: 3 })}`,
      ),
  },
  'screenshot-1-chat': {
    w: 1280,
    h: 800,
    html: () =>
      screenshot({
        kicker: ['sparkles', 'Unique AI'],
        title: 'Chat with any <span class="grad">PDF</span>',
        sub: 'Ask anything. Answers stream in with page references you can click.',
        capture: 'chat-light',
      }),
  },
  'screenshot-2-summary': {
    w: 1280,
    h: 800,
    html: () =>
      screenshot({
        kicker: ['sparkles', 'Unique AI'],
        title: 'Long PDF? Get the <span class="grad">key points</span>',
        sub: 'Key points, a TL;DR, a teaser or a headline — in seconds, even for long reports.',
        capture: 'summary-light',
      }),
  },
  'screenshot-3-tools': {
    w: 1280,
    h: 800,
    html: () =>
      screenshot({
        kicker: ['layout-grid', '20 PDF tools'],
        title: 'Every PDF tool. <span class="grad">Free.</span>',
        sub: 'Merge, split, compress, convert, edit, sign, protect and redact — no limits, no watermarks.',
        capture: 'tools-light',
        region: [280, 168, 1160, 788],
      }),
  },
  'screenshot-4-edit': {
    w: 1280,
    h: 800,
    html: () =>
      screenshot({
        kicker: ['pen-line', 'Edit &amp; sign'],
        title: 'Edit and <span class="grad">sign</span> PDFs',
        sub: 'Add text, highlights, shapes, images and your signature — then save a new PDF.',
        capture: 'editor-light',
      }),
  },
  'screenshot-5-private': {
    w: 1280,
    h: 800,
    html: () =>
      screenshot({
        kicker: ['shield-check', 'Private by design'],
        title: 'Your files <span class="grad">never leave</span> your device',
        sub: 'No uploads, no account, works offline. Redaction that really removes the text.',
        capture: 'redact-light',
      }),
  },

  // ---- Social ----------------------------------------------------------------------
  'social/x-header-1500x500': {
    w: 1500,
    h: 500,
    html: () =>
      doc(
        1500,
        500,
        // Words stay clear of the profile photo (lower left) and the mobile buttons (top corners).
        `<div class="abs" style="left:430px;top:96px;width:560px">
           <h1 class="h" style="font-size:54px">Free PDF tools<br>with <span class="grad">AI chat</span></h1>
           <p class="muted" style="font-size:20px;margin-top:16px;line-height:1.4">Chat, summarize, edit, merge, compress and sign — nothing uploaded.</p>
           <div style="margin-top:22px">${chips([['sparkles', 'Unique AI'], ['lock', 'Private'], ['zap', 'Free']], 15)}</div>
         </div>
         ${shot('chat-dark', [600, 124, 812, 748], { left: 1040, top: 70, width: 560, dark: true })}`,
        { dark: true },
      ),
  },
  'social/youtube-thumbnail-1280x720': {
    w: 1280,
    h: 720,
    html: () =>
      doc(
        1280,
        720,
        `<div class="abs" style="left:70px;top:92px;width:600px">
           <span class="chip" style="font-size:22px;background:linear-gradient(135deg,#4660ff,#9a45f5);color:#fff;border:none">FREE · CHROME</span>
           <h1 class="h" style="font-size:104px;margin-top:26px;line-height:.96">Chat with<br>any <span class="grad">PDF</span></h1>
           <p style="font-size:30px;font-weight:650;margin-top:26px;letter-spacing:-.02em">Answers with page references</p>
           <div style="margin-top:34px">${brand(64)}</div>
         </div>
         ${shot('chat-light', CHAT_PANEL, { left: 690, top: 70, width: 640 })}
         ${chatCallout({ left: 600, top: 470, width: 470, fontSize: 21, question: 'How many warehouses were merged?', answer: '<b>Two regional warehouses</b> were merged into one automated facility', page: 2 })}`,
      ),
  },
  'social/og-image-1200x630': {
    w: 1200,
    h: 630,
    html: () =>
      doc(
        1200,
        630,
        `<div class="abs" style="left:72px;top:76px;width:520px">
           ${brand(56)}
           <h1 class="h" style="font-size:58px;margin-top:34px">Free PDF tools with <span class="grad">AI chat</span></h1>
           <p class="muted" style="font-size:20px;margin-top:18px;line-height:1.45">Chat with PDFs, get summaries, edit, merge, compress and sign. Nothing is uploaded.</p>
         </div>
         ${shot('chat-light', [290, 18, 1130, 860], { left: 640, top: 70, width: 700 })}`,
      ),
  },

  // ---- Google Ads (responsive display) ---------------------------------------------
  'google-ads/ad-landscape-1-chat': {
    w: 1200,
    h: 628,
    html: () =>
      doc(
        1200,
        628,
        `<div class="abs" style="left:64px;top:80px;width:470px">
           ${brand(52)}
           <h1 class="h" style="font-size:56px;margin-top:34px">Chat with any <span class="grad">PDF</span></h1>
           <p class="muted" style="font-size:21px;margin-top:16px">Free · Nothing uploaded</p>
         </div>
         ${shot('chat-light', CHAT_PANEL, { left: 600, top: 60, width: 560 })}`,
      ),
  },
  'google-ads/ad-landscape-2-tools': {
    w: 1200,
    h: 628,
    html: () =>
      doc(
        1200,
        628,
        `<div class="abs" style="left:64px;top:80px;width:470px">
           ${brand(52)}
           <h1 class="h" style="font-size:56px;margin-top:34px">20 PDF tools. <span class="grad">Free.</span></h1>
           <p class="muted" style="font-size:21px;margin-top:16px">Merge · Compress · Edit · Sign</p>
         </div>
         ${shot('tools-light', [290, 168, 1130, 788], { left: 590, top: 70, width: 700 })}`,
      ),
  },
  'google-ads/ad-square-1-chat': {
    w: 1200,
    h: 1200,
    html: () =>
      doc(
        1200,
        1200,
        `<div class="abs" style="left:0;right:0;top:96px;text-align:center">
           <div style="display:inline-block">${brand(64)}</div>
           <h1 class="h" style="font-size:84px;margin-top:40px">Chat with any <span class="grad">PDF</span></h1>
           <p class="muted" style="font-size:30px;margin-top:20px">Free · Nothing uploaded</p>
         </div>
         ${shot('chat-light', CHAT_PANEL, { left: 170, top: 470, width: 860 })}`,
      ),
  },
  'google-ads/ad-square-2-private': {
    w: 1200,
    h: 1200,
    html: () =>
      doc(
        1200,
        1200,
        `<div class="abs" style="left:0;right:0;top:96px;text-align:center">
           <div style="display:inline-block">${brand(64)}</div>
           <h1 class="h" style="font-size:80px;margin-top:40px">Edit, sign &amp; redact<br><span class="grad">privately</span></h1>
         </div>
         ${shot('editor-light', [280, 112, 1160, 788], { left: 110, top: 520, width: 980 })}`,
      ),
  },
  'google-ads/ad-portrait-1-popup': {
    w: 960,
    h: 1200,
    html: () =>
      doc(
        960,
        1200,
        `<div class="abs" style="left:0;right:0;top:92px;text-align:center">
           <div style="display:inline-block">${brand(60)}</div>
           <h1 class="h" style="font-size:66px;margin-top:36px">Every PDF tool,<br><span class="grad">one click away</span></h1>
         </div>
         ${shot('popup-light', [0, 0, 380, 600], { left: 214, top: 450, width: 532, radius: 24, app: [380, 600] })}`,
      ),
  },
  'google-ads/logo-square-1200': {
    w: 1200,
    h: 1200,
    html: () => doc(1200, 1200, `<img class="abs" src="${APP_ICON}" style="left:210px;top:210px;width:780px;height:780px">`, { background: false, css: 'body{background:#fff}' }),
  },
  'google-ads/logo-landscape-1200x300': {
    w: 1200,
    h: 300,
    html: () =>
      doc(
        1200,
        300,
        `<div class="abs" style="inset:0;display:flex;align-items:center;justify-content:center;gap:40px">
           <img src="${APP_ICON}" width="190" height="190" style="border-radius:44px">
           <div><div class="h" style="font-size:104px">Unique PDF</div><div style="font-size:34px;font-weight:500;color:#555561;margin-top:8px">by Unique Labs</div></div>
         </div>`,
        { background: false, css: 'body{background:#fff}' },
      ),
  },
};

// Full-HD thumbnail for the showcase video: the same design rendered at 1.5x.
ASSETS['social/youtube-thumbnail-1920x1080'] = { ...ASSETS['social/youtube-thumbnail-1280x720'], scale: 1.5 };

// Extra asset used by the README of the kit: the developer card (for the website / social posts).
ASSETS['social/developer-card-1200x630'] = {
  w: 1200,
  h: 630,
  html: () =>
    doc(
      1200,
      630,
      `<div class="abs" style="left:0;right:0;top:120px;text-align:center">
         <img src="${DEV_PHOTO}" width="150" height="150" style="border-radius:50%;box-shadow:0 0 0 6px #fff,0 0 0 10px #7c4dff,0 30px 60px -24px rgba(20,20,60,.5)">
         <h1 class="h" style="font-size:54px;margin-top:34px">Shahriar Ahmed</h1>
         <p class="muted" style="font-size:24px;margin-top:12px">Developer of Unique PDF · Unique Labs</p>
         <p style="font-size:22px;margin-top:18px;font-weight:600;color:#4f5bff">www.shahriarahmed.net</p>
       </div>`,
    ),
};

const only = process.argv[2];
const names = Object.keys(ASSETS).filter((n) => !only || n.includes(only));
if (names.length === 0) throw new Error(`No asset matches "${only}"`);

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const outputs = [];
for (const name of names) {
  const { w, h, html, scale = 1 } = ASSETS[name];
  const target = scale === 1 ? page : await browser.newPage({ deviceScaleFactor: scale });
  const file = join(TMP, `${name.replace(/\//g, '_')}.html`);
  writeFileSync(file, html());
  await target.setViewportSize({ width: w, height: h });
  await target.goto(pathToFileURL(file).href);
  await target.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => img.addEventListener('load', r, { once: true })))));
  });
  const out = join(KIT, `${name}.png`);
  mkdirSync(dirname(out), { recursive: true });
  await target.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
  if (target !== page) await target.close();
  outputs.push(out);
  console.log(`✓ ${name}.png (${w * scale}×${h * scale})`);
}
await browser.close();

// The store wants 24-bit PNGs without an alpha channel.
execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nfor p in sys.argv[1:]:\n    im = Image.open(p)\n    if im.mode != "RGB": im.convert("RGB").save(p, optimize=True)\n    else: im.save(p, optimize=True)', ...outputs]);
copyFileSync(join(ROOT, 'public/icons/icon-128.png'), join(KIT, 'store-icon-128.png'));
console.log('✓ store-icon-128.png (128×128)');
rmSync(TMP, { recursive: true, force: true });
await import('./privacy-page.mjs');
