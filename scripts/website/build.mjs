/**
 * Builds the static website into website/ (deploy that folder to Vercel).
 * Run: npm run website   (SITE_URL=… STORE_URL=… npm run website to override config.mjs)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SITE } from './config.mjs';
import { ROOT, loadFaq, loadTools, loadWallets } from './content.mjs';
import { footer, head, header } from './layout.mjs';
import { frontMatter, markdown } from './md.mjs';
import * as pages from './pages.mjs';

const SRC = join(ROOT, 'scripts/website');
const OUT = join(ROOT, 'website');
const KEEP_MEDIA = join(ROOT, 'website/media'); // the encoded video is reused between builds when unchanged
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);
const write = (rel, data) => {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
};

// Keep the encoded video across builds (it takes a while to encode).
const media = {};
for (const f of ['showcase.mp4', 'showcase-poster.webp']) if (existsSync(join(KEEP_MEDIA, f))) media[f] = readFileSync(join(KEEP_MEDIA, f));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const [f, data] of Object.entries(media)) write(`media/${f}`, data);

// ---- CSS, JS, font -------------------------------------------------------------
const minCss = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
const css = minCss(readFileSync(join(SRC, 'site.css'), 'utf8'));
const js = readFileSync(join(SRC, 'site.js'), 'utf8');
const assets = {
  css: `/assets/site.${hash(css)}.css`,
  js: `/assets/site.${hash(js)}.js`,
  themeScript: "(function(){var d=document.documentElement;d.classList.add('js');try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')d.dataset.theme=t}catch(e){}})();",
};
write(assets.css, css);
write(assets.js, js);
copyFileSync(join(ROOT, 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'), join(OUT, 'assets/geist.woff2'));
const themeHash = createHash('sha256').update(assets.themeScript).digest('base64');

// ---- Images ----------------------------------------------------------------------
mkdirSync(join(OUT, 'images/donate'), { recursive: true });
mkdirSync(join(OUT, 'media'), { recursive: true });
const SHOTS = ['01-home', '02-ai-chat', '03-ai-summary', '04-editor', '05-redact', '06-organize', '07-home-dark', '09-compress-result-dark'];
const imageJobs = {
  shots: SHOTS.map((n) => [join(ROOT, `store-assets/screenshots/${n}.png`), join(OUT, `images/${n}`)]),
  icon: join(ROOT, 'store-assets/icon-512.png'),
  og: [join(ROOT, 'store-assets/social/og-image-1200x630.png'), join(OUT, 'images/og.jpg')],
  poster: [join(ROOT, 'store-assets/social/youtube-thumbnail-1920x1080.png'), join(OUT, 'media/showcase-poster.webp')],
  out: OUT,
};
execFileSync(
  'python3',
  [
    '-I',
    '-c',
    `
import json, sys
from PIL import Image
job = json.loads(sys.argv[1]); out = job['out']
for src, dst in job['shots']:
    im = Image.open(src).convert('RGB')
    for w in (1280, 640):
        im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(f'{dst}-{w}.webp', 'WEBP', quality=82, method=6)
icon = Image.open(job['icon']).convert('RGBA')
icon.resize((68, 68), Image.LANCZOS).save(f'{out}/images/app-icon.webp', 'WEBP', quality=90, method=6)
for s, name in ((180, 'apple-touch-icon.png'), (192, 'images/icon-192.png'), (512, 'images/icon-512.png')):
    bg = Image.new('RGBA', icon.size, (255, 255, 255, 255)) if s == 180 else None
    im = icon.resize((s, s), Image.LANCZOS)
    if bg is not None:
        base = Image.new('RGBA', (s, s), (255, 255, 255, 255)); base.alpha_composite(im); im = base.convert('RGB')
    im.save(f'{out}/{name}', optimize=True)
icon.resize((32, 32), Image.LANCZOS).save(f'{out}/favicon.ico', sizes=[(32, 32), (16, 16)])
src, dst = job['og']; Image.open(src).convert('RGB').save(dst, 'JPEG', quality=86, optimize=True, progressive=True)
src, dst = job['poster']
import os
if not os.path.exists(dst): Image.open(src).convert('RGB').resize((1280, 720), Image.LANCZOS).save(dst, 'WEBP', quality=80, method=6)
`,
    JSON.stringify(imageJobs),
  ],
  { stdio: 'inherit' },
);
copyFileSync(join(ROOT, 'public/developer/shahriar-ahmed.webp'), join(OUT, 'images/shahriar-ahmed.webp'));
for (const f of readdirSync(join(ROOT, 'public/donate'))) copyFileSync(join(ROOT, 'public/donate', f), join(OUT, 'images/donate', f));
write(
  'images/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b74ff"/><stop offset="1" stop-color="#9a45f5"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/><path d="M22 14h14l10 10v24a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3z" fill="#fff"/><rect x="25" y="30" width="15" height="3" rx="1.5" fill="#5b5bff"/><rect x="25" y="36" width="15" height="3" rx="1.5" fill="#5b5bff"/><rect x="25" y="42" width="10" height="3" rx="1.5" fill="#5b5bff"/></svg>`,
);

// ---- Showcase video (web size), encoded once ------------------------------------------
const video = join(OUT, 'media/showcase.mp4');
const videoSrc = join(ROOT, 'store-assets/unique-pdf-showcase.mp4');
if (!existsSync(video) || statSync(video).mtimeMs < statSync(videoSrc).mtimeMs) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoSrc, '-vf', 'scale=1280:720', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', video], { stdio: 'inherit' });
}

// ---- Content ---------------------------------------------------------------------
const tools = loadTools();
const faq = loadFaq();
const wallets = loadWallets();
const posts = readdirSync(join(SRC, 'blog'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const { data, body } = frontMatter(readFileSync(join(SRC, 'blog', f), 'utf8'));
    const { html, headings } = markdown(body);
    const words = body.split(/\s+/).filter(Boolean).length;
    return { slug: f.replace(/\.md$/, ''), ...data, html, headings, words, minutes: Math.max(2, Math.round(words / 220)) };
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
const privacyMd = readFileSync(join(ROOT, 'PRIVACY.md'), 'utf8').replace(/^# .*\n/, '');

const list = [
  await pages.home({ tools, faq, posts }),
  await pages.features({ tools }),
  await pages.faqPage({ faq }),
  await pages.blogIndex({ posts }),
  ...(await Promise.all(posts.map((p) => pages.blogPost(p, posts)))),
  await pages.privacy({ html: markdown(privacyMd).html }),
  await pages.about(),
  await pages.donate({ wallets }),
  await pages.notFound(),
];

for (const p of list) {
  const html = `${await head({ ...p, assets })}\n${await header(p.path)}\n${p.body}\n${await footer()}`;
  const file = p.path === '/' ? 'index.html' : p.path === '/blog' ? 'blog/index.html' : `${p.path.slice(1)}.html`;
  write(file, html.replace(/\n\s+/g, '\n'));
}

// ---- SEO and hosting files ----------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const indexable = list.filter((p) => !p.noindex);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable
    .map((p) => `  <url><loc>${SITE.url}${p.path === '/' ? '/' : p.path}</loc><lastmod>${p.type === 'article' ? posts.find((x) => p.path.endsWith(x.slug))?.date ?? today : today}</lastmod><priority>${p.path === '/' ? '1.0' : p.path.startsWith('/blog/') ? '0.7' : '0.8'}</priority></url>`)
    .join('\n')}\n</urlset>\n`,
);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
write(
  'site.webmanifest',
  JSON.stringify({ name: 'Unique PDF', short_name: 'Unique PDF', description: SITE.tagline, start_url: '/', display: 'standalone', background_color: '#f7f7f9', theme_color: '#3d5afe', icons: [{ src: '/images/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/images/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2),
);
const csp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${themeHash}'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');
write(
  'vercel.json',
  JSON.stringify(
    {
      $schema: 'https://openapi.vercel.sh/vercel.json',
      cleanUrls: true,
      trailingSlash: false,
      headers: [
        { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
        { source: '/(images|media)/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
        {
          source: '/(.*)',
          headers: [
            { key: 'Content-Security-Policy', value: csp },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
            { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          ],
        },
      ],
    },
    null,
    2,
  ),
);
write(
  'README.md',
  `# Unique PDF website\n\nStatic site generated by \`npm run website\` from \`scripts/website/\`. Do not edit these files by hand.\n\nDeploy: import the repository in Vercel and set the **Root Directory** to \`website\` (framework preset: Other, no build command).\n\nBefore going live, set the site address and the Chrome Web Store link in \`scripts/website/config.mjs\` (or run \`SITE_URL=https://your.domain STORE_URL=https://chromewebstore.google.com/detail/… npm run website\`) and commit the regenerated folder.\n`,
);
console.log(`✓ website/ built: ${list.length} pages, ${posts.length} blog posts → ${SITE.url}`);
