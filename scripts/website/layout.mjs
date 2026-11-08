/** Page shell: <head> with SEO metadata, header, footer. */
import { SITE } from './config.mjs';
import { VERSION, icon } from './content.mjs';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const abs = (path) => `${SITE.url}${path === '/' ? '' : path}`;

/** Chrome-style logo for the Add to Chrome buttons. */
export const CHROME = `<svg class="chrome" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#fff"/><path fill="#db4437" d="M24 4a20 20 0 0 1 17.32 10H24a10 10 0 0 0-9.33 6.4L8.2 9.2A20 20 0 0 1 24 4z"/><path fill="#0f9d58" d="M4 24a20 20 0 0 1 4.2-14.8l8.65 15A10 10 0 0 0 24 34l-6.47 11.2A20 20 0 0 1 4 24z"/><path fill="#ffcd40" d="M41.32 14A20 20 0 0 1 24 44l8.66-15A10 10 0 0 0 34 24a9.9 9.9 0 0 0-2-6h9.32z"/><circle cx="24" cy="24" r="8.2" fill="#4285f4"/><circle cx="24" cy="24" r="8.2" fill="none" stroke="#fff" stroke-width="2.4"/></svg>`;

export const installButton = (cls = 'btn btn-primary', label = 'Add to Chrome — it’s free') =>
  `<a class="${cls}" href="${esc(SITE.storeUrl)}" target="_blank" rel="noopener" data-install>${CHROME}<span>${label}</span></a>`;

const NAV = [
  ['Features', '/features'],
  ['Unique AI', '/#unique-ai'],
  ['Tools', '/#tools'],
  ['Privacy', '/#privacy'],
  ['Blog', '/blog'],
  ['FAQ', '/faq'],
];

export async function head({ title, description, path, type = 'website', image = '/images/og.jpg', jsonLd = [], assets, noindex = false }) {
  const url = abs(path);
  const ld = jsonLd.map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`).join('\n');
  return `<!doctype html>
<html lang="${SITE.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#f7f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#050507" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${abs(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Unique PDF — free PDF tools with AI chat">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${abs(image)}">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/images/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.css}">
<script>${assets.themeScript}</script>
<script src="${assets.js}" defer></script>
${ld}
</head>`;
}

export async function header(path) {
  const current = (href) => (href === path ? ' aria-current="page"' : '');
  const links = NAV.map(([label, href]) => `<a href="${href}"${current(href)}>${label}</a>`).join('');
  return `<body>
<a class="skip" href="#main">Skip to content</a>
<header class="header">
  <div class="container">
    <a class="logo" href="/" aria-label="Unique PDF home"><img src="/images/app-icon.webp" width="34" height="34" alt=""><span>Unique PDF<small>by Unique Labs</small></span></a>
    <nav class="nav" aria-label="Main">${links}</nav>
    <div class="header-actions">
      <button class="icon-btn theme-toggle" type="button" aria-label="Switch between light and dark theme">${await icon('sun', 18, 2, 'sun')}${await icon('moon', 18, 2, 'moon')}</button>
      ${installButton('btn btn-primary btn-sm', 'Add to Chrome')}
      <button class="icon-btn menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="mobile-nav">${await icon('menu', 20)}</button>
    </div>
  </div>
</header>
<nav class="mobile-nav" id="mobile-nav" aria-label="Main (mobile)">${links}</nav>`;
}

export async function footer() {
  const col = (title, items) => `<div><h3>${title}</h3><ul>${items.map(([l, h, ext]) => `<li><a href="${h}"${ext ? ' target="_blank" rel="noopener"' : ''}>${l}</a></li>`).join('')}</ul></div>`;
  return `<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="logo" href="/"><img src="/images/app-icon.webp" width="34" height="34" alt="" loading="lazy"><span>Unique PDF<small>by Unique Labs</small></span></a>
        <p>Free PDF tools with Unique AI. Chat with any PDF, summarize, edit, merge, compress, sign and protect — your files never leave your device.</p>
        <div class="dev-credit"><img src="/images/shahriar-ahmed.webp" width="32" height="32" alt="" loading="lazy"><span>Developed by <a href="${SITE.developer.url}" target="_blank" rel="noopener">${SITE.developer.name}</a></span></div>
      </div>
      ${col('Product', [['Features', '/features'], ['Unique AI', '/#unique-ai'], ['All 20 tools', '/#tools'], ['Add to Chrome', SITE.storeUrl, true]])}
      ${col('Resources', [['Blog', '/blog'], ['FAQ', '/faq'], ['Chat with a PDF', '/blog/chat-with-a-pdf-without-uploading'], ['Merge PDF files', '/blog/merge-pdf-files-free-offline']])}
      ${col('Company', [['About', '/about'], ['Donate', '/donate'], ['Privacy policy', '/privacy'], ['Contact the developer', SITE.developer.telegram, true]])}
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} Unique Labs · Useful technology. Accessible to everyone.</span>
      <span>Version ${VERSION} · Chrome extension</span>
    </div>
  </div>
</footer>
</body>
</html>`;
}

/** Background blobs + grid. */
export const bg = '<div class="bg" aria-hidden="true"><div class="blob a"></div><div class="blob b"></div><div class="blob c"></div></div>';

export const breadcrumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })),
});
