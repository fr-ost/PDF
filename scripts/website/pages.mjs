/** Page bodies. Each returns { path, title, description, body, jsonLd?, type?, noindex? }. */
import { SITE } from './config.mjs';
import { CATEGORIES, TOOL_DETAILS, VERSION, icon } from './content.mjs';
import { abs, bg, breadcrumbLd, esc, installButton } from './layout.mjs';

const pub = { '@type': 'Organization', name: SITE.brand, url: SITE.url, logo: abs('/images/icon-512.png') };
const author = { '@type': 'Person', name: SITE.developer.name, url: SITE.developer.url };

const picture = (name, alt, { eager = false, cls = '' } = {}) =>
  `<img${cls ? ` class="${cls}"` : ''} src="/images/${name}-1280.webp" srcset="/images/${name}-640.webp 640w, /images/${name}-1280.webp 1280w" sizes="(max-width: 860px) 100vw, 1200px" width="1280" height="800" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;

async function toolCard(t, i) {
  return `<article class="card tool reveal c-${t.category}" data-category="${t.category}" data-search="${esc(`${t.name} ${t.description}`.toLowerCase())}" style="--d:${(i % 4) * 0.05}s">
    <div class="tile">${await icon(t.icon, 21)}</div>
    <h3>${esc(t.name)}</h3>
    <p>${esc(t.description)}</p>
  </article>`;
}

const faqHtml = async (items) =>
  `<div class="faq">${(
    await Promise.all(items.map(async (f) => `<details class="reveal"><summary>${esc(f.q)}${await icon('plus', 20)}</summary><div class="answer">${esc(f.a)}</div></details>`))
  ).join('')}</div>`;

export const faqLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

const postCard = async (p, level = 3) => `<a class="card post-card reveal" href="/blog/${p.slug}">
  <span class="tag">${esc(p.tag)}</span>
  <h${level}>${esc(p.title)}</h${level}>
  <p>${esc(p.description)}</p>
  <span class="post-meta">${await icon('clock', 15)} ${p.minutes} min read</span>
</a>`;

const DEMO = [
  { q: 'What are the payment terms?', a: 'Invoices are due within **30 days**, and late payments add a **1.5% monthly fee**.', page: 2 },
  { q: 'When does the contract end?', a: 'It runs until **31 December 2027** and renews each year unless cancelled with **60 days’ notice**.', page: 3 },
  { q: 'Summarize it in one line', a: 'A **two-year services agreement** with 30-day payment terms, yearly renewal and a cap on liability.', page: 1 },
];

async function chatDemo() {
  const page = (n, title, marks) =>
    `<div class="page${n === 2 ? ' hit' : ''}" data-page="${n}"><h4>${title}</h4>${['w90', '', 'w80', marks, 'w60', '', 'w90', 'w80', ''].map((c) => `<p class="${c}"></p>`).join('')}</div>`;
  const orb = `<span class="orb">${await icon('sparkles', 15, 2.4)}</span>`;
  const first = DEMO[0];
  return `<div class="demo" data-demo role="img" aria-label="Unique AI answering questions about a service agreement, with page references">
    <div class="demo-bar"><i></i><i></i><i></i><span>${await icon('file-text', 14)} service-agreement.pdf · 3 pages</span></div>
    <div class="demo-body">
      <div class="demo-doc" aria-hidden="true">${page(1, 'Service Agreement', 'w80')}${page(2, '4. Payment terms', 'mark w80')}${page(3, '9. Term and renewal', 'mark w90')}</div>
      <div class="demo-chat" aria-hidden="true">
        <div class="demo-chat-head">${orb}<div>Unique AI<small><span class="live"></span> Ready</small></div></div>
        <div class="thread">
          <div class="msg-q">${first.q}</div>
          <div class="msg-a">${orb}<div>${first.a.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}<span class="cite">p. ${first.page}</span></div></div>
        </div>
        <div class="composer"><span class="composer-text" data-placeholder="Ask anything about this PDF…">Ask anything about this PDF…</span><b>${await icon('arrow-right', 16, 2.4)}</b></div>
      </div>
    </div>
  </div>
  <script type="application/json" id="demo-data">${JSON.stringify(DEMO)}</script>`;
}

export async function home({ tools, faq, posts }) {
  const byCat = (c) => tools.filter((t) => t.category === c);
  const ordered = [...byCat('ai'), ...byCat('organize'), ...byCat('convert'), ...byCat('edit'), ...byCat('security')];
  const check = await icon('check', 18, 2.6);
  const yes = (t) => `<span class="yes">${check} ${t}</span>`;
  const no = async (t) => `<span class="no">${await icon('x', 18, 2.6)} ${t}</span>`;
  const reasons = [
    ['shield-check', 'Private by design', 'Every tool runs inside your browser. Contracts, IDs and bank statements never leave your computer.'],
    ['badge-check', 'Free for real', 'No subscription, no sign-up, no watermarks and no daily task limits. Every feature, for everyone.'],
    ['sparkles', 'AI that shows its sources', 'Unique AI answers with page references you can click, so you can check every answer in seconds.'],
    ['zap', 'Fast, even offline', 'No uploads and no waiting. Large documents open instantly, and everything works without internet.'],
    ['layers', 'Everything in one tab', '20 tools in one clean workspace, with drag and drop, a command palette and a quick-access popup.'],
    ['heart', 'Made with care', 'Light and dark themes, keyboard support, accessible design and an independent developer who listens.'],
  ];
  const shots = [
    ['chat', 'Chat with PDF', '02-ai-chat', 'Ask questions and click page references to check every answer.'],
    ['summary', 'AI Summary', '03-ai-summary', 'Key points, a TL;DR, a teaser or a headline in seconds.'],
    ['editor', 'Edit & sign', '04-editor', 'Add text, highlights, shapes, images and your signature.'],
    ['redact', 'Redact', '05-redact', 'Search and remove sensitive text for good, with automatic verification.'],
    ['organize', 'Organize', '06-organize', 'Reorder, rotate and delete pages from several PDFs in one workspace.'],
    ['compress', 'Compress', '09-compress-result-dark', 'Make large PDFs smaller while text stays sharp and searchable.'],
  ];
  const body = `<main id="main">
<section class="hero">${bg}
  <div class="container rel hero-grid">
    <div>
      <a class="pill reveal" href="#unique-ai"><b>New</b> Unique AI — chat with any PDF ${await icon('arrow-right', 15)}</a>
      <h1>The free PDF editor with <span class="grad">AI chat</span>. Private by design.</h1>
      <p class="lead">Chat with any PDF and get answers with page references, summarize long reports in seconds, and merge, compress, edit, sign and protect documents — all inside Chrome. Your files are never uploaded.</p>
      <div class="hero-cta reveal" style="--d:.15s">${installButton('btn btn-primary btn-lg')}<a class="btn btn-secondary btn-lg" href="#tools">See all 20 tools</a></div>
      <div class="trust reveal" style="--d:.2s"><span>${check} Free forever</span><span>${check} No sign-up</span><span>${check} Nothing uploaded</span><span>${check} Works offline</span></div>
    </div>
    <div class="hero-visual reveal" style="--d:.15s">
      ${await chatDemo()}
      <div class="float-card fc-1"><span class="tile c-security" style="--c1:#10b981;--c2:#14b8a6">${await icon('lock', 18)}</span><div>Nothing uploaded<small>Processed in your browser</small></div></div>
      <div class="float-card fc-2"><span class="tile c-ai">${await icon('sparkles', 18)}</span><div>Answers cite pages<small>Click to check the source</small></div></div>
    </div>
  </div>
</section>

<section class="section-sm">
  <div class="container">
    <div class="stats reveal">
      <div class="stat"><b data-count="20">20</b><span>PDF tools in one tab</span></div>
      <div class="stat"><b data-count="0">0</b><span>files uploaded, ever</span></div>
      <div class="stat"><b data-count="1">1</b><span>permission: your settings</span></div>
      <div class="stat"><b data-count="100" data-suffix="%">100%</b><span>free, no watermarks</span></div>
    </div>
  </div>
</section>

<section class="section" id="unique-ai">
  <div class="container">
    <div class="section-head reveal"><span class="kicker">${await icon('sparkles', 16)} Unique AI</span><h2 class="h2">Understand any PDF in <span class="grad">seconds</span></h2><p class="lead">Ask questions in plain language or get a summary of a 100-page report. Every answer shows where it came from.</p></div>
    <div class="ai-grid">
      <article class="card ai-card reveal">
        <span class="badge-ai">${await icon('messages-square', 15)} Chat with PDF</span>
        <h3>Ask anything. Check every answer.</h3>
        <p>Unique AI answers in seconds with clickable page references, keeps the conversation for follow-ups and suggests questions that fit your document.</p>
        <ul><li>${check}Page references and a sources list on every answer</li><li>${check}Suggested questions for contracts, reports and papers</li><li>${check}Replies in English, Spanish or Japanese; export the chat</li></ul>
        <div class="shot">${picture('02-ai-chat', 'Chat with PDF answering questions about an annual report with page references')}</div>
      </article>
      <article class="card ai-card reveal" style="--d:.08s">
        <span class="badge-ai">${await icon('sparkles', 15)} AI Summary</span>
        <h3>The key points, without the reading.</h3>
        <p>Turn long documents into key points, a short overview, a teaser or a headline. Choose the length and language and tell it what to focus on.</p>
        <ul><li>${check}Four styles and three lengths</li><li>${check}Summarize all pages or just a range</li><li>${check}Copy as clean text or download as Markdown</li></ul>
        <div class="shot">${picture('03-ai-summary', 'AI Summary showing the key points of a report')}</div>
      </article>
    </div>
  </div>
</section>

<section class="section" id="tools" style="padding-top:0">
  <div class="container">
    <div class="section-head reveal"><span class="kicker">${await icon('layers', 16)} 20 tools</span><h2 class="h2">Every PDF tool you need. <span class="grad">Free.</span></h2><p class="lead">Organize, convert, edit and secure your documents — no uploads, no limits, no watermarks.</p></div>
    <div class="filters" role="group" aria-label="Filter tools by category">
      <button class="chip" type="button" data-filter="all" aria-pressed="true">All tools</button>
      ${CATEGORIES.map((c) => `<button class="chip c-${c.id}" type="button" data-filter="${c.id}" aria-pressed="false"><i></i>${c.title}</button>`).join('')}
    </div>
    <label class="tool-search">${await icon('search', 18)}<span class="sr-only">Search tools</span><input id="tool-search" type="search" placeholder="Search tools, e.g. compress" autocomplete="off"></label>
    <div class="tools" data-tools>${(await Promise.all(ordered.map(toolCard))).join('')}</div>
    <p class="tools-empty" hidden>No tool matches that search. Try “merge”, “sign” or “summary”.</p>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="container">
    <div class="section-head reveal"><span class="kicker">${await icon('mouse-pointer-click', 16)} How it works</span><h2 class="h2">Three steps. No uploads.</h2></div>
    <div class="steps">
      <div class="card step reveal"><span class="step-n">1</span><h3>Add to Chrome</h3><p>Install Unique PDF from the Chrome Web Store and pin it to your toolbar. It is free and takes a few seconds.</p></div>
      <div class="card step reveal" style="--d:.08s"><span class="step-n">2</span><h3>Drop your files</h3><p>Pick a tool, or drop files anywhere and Unique PDF suggests the right one. Everything runs in your browser.</p></div>
      <div class="card step reveal" style="--d:.16s"><span class="step-n">3</span><h3>Download the result</h3><p>Adjust the options, click once and save the new file. Your original is never changed.</p></div>
    </div>
  </div>
</section>

<section class="section" id="privacy" style="padding-top:0">
  <div class="container">
    <div class="privacy-panel reveal">
      <div class="privacy-grid">
        <div>
          <span class="kicker" style="color:#8c9fff">${await icon('shield-check', 16)} Private by design</span>
          <h2 class="h2" style="margin-top:14px">Your files never leave your device.</h2>
          <p class="lead">Online PDF sites upload your documents to their servers. Unique PDF does the work right inside your browser, so contracts, IDs and bank statements stay with you.</p>
          <ul class="privacy-list">
            <li>${check}No uploads, no cloud storage, no account</li>
            <li>${check}No ads, and usage stats only if you opt in</li>
            <li>${check}One permission only: saving your settings</li>
            <li>${check}Works offline once installed</li>
          </ul>
        </div>
        <div class="meter" aria-label="What Unique PDF sends while you work">
          <div class="meter-head">${await icon('gauge', 18)} While you work</div>
          <div class="meter-row">Files uploaded <b class="ok" data-count="0">0</b></div>
          <div class="meter-row">Document bytes sent <b class="ok" data-count="0">0</b></div>
          <div class="meter-row">Ad trackers <b class="ok" data-count="0">0</b></div>
          <div class="meter-row">Accounts required <b class="ok" data-count="0">0</b></div>
          <div class="meter-row">Tools available <b data-count="20">20</b></div>
        </div>
      </div>
    </div>
    <div class="table-wrap compare reveal" style="margin-top:32px">
      <table>
        <caption class="sr-only">Unique PDF compared with typical online PDF websites</caption>
        <thead><tr><th scope="col">Feature</th><th scope="col">Unique PDF</th><th scope="col">Typical online PDF sites</th></tr></thead>
        <tbody>
          <tr><td>Your files are uploaded to a server</td><td>${yes('Never')}</td><td>${await no('Yes')}</td></tr>
          <tr><td>Account required</td><td>${yes('No')}</td><td>${await no('Often')}</td></tr>
          <tr><td>Daily task limits</td><td>${yes('None')}</td><td>${await no('Common')}</td></tr>
          <tr><td>Watermarks on free results</td><td>${yes('Never')}</td><td>${await no('Common')}</td></tr>
          <tr><td>Works offline</td><td>${yes('Yes')}</td><td>${await no('No')}</td></tr>
          <tr><td>AI chat with page references</td><td>${yes('Included, free')}</td><td>${await no('Often paid')}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="container">
    <div class="section-head reveal"><span class="kicker">${await icon('star', 16)} Take a look</span><h2 class="h2">Beautifully simple. <span class="grad">Seriously capable.</span></h2></div>
    <div class="tabs" role="tablist" aria-label="Screenshots">
      ${shots.map(([id, label], i) => `<button class="chip" type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join('')}
    </div>
    ${shots.map(([id, , file, caption], i) => `<div class="tab-panel-wrap"><div class="tab-panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}"${i ? ' hidden' : ''}>${picture(file, caption)}</div></div>`).join('')}
    <div class="video-wrap reveal"><video controls preload="none" playsinline poster="/media/showcase-poster.webp" width="1280" height="720" aria-label="Unique PDF showcase video"><source src="/media/showcase.mp4" type="video/mp4"></video></div>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="container">
    <div class="section-head reveal"><span class="kicker">${await icon('heart', 16)} Why Unique PDF</span><h2 class="h2">Why people choose Unique PDF</h2></div>
    <div class="reasons">${(await Promise.all(reasons.map(async ([ic, t, d], i) => `<div class="card reason reveal" style="--d:${(i % 3) * 0.06}s"><span class="ic">${await icon(ic, 22)}</span><h3>${t}</h3><p>${d}</p></div>`))).join('')}</div>
  </div>
</section>

<section class="section" style="padding-top:0" id="faq">
  <div class="container narrow">
    <div class="section-head reveal"><span class="kicker">${await icon('book-open', 16)} FAQ</span><h2 class="h2">Questions, answered</h2></div>
    ${await faqHtml(faq.slice(0, 8))}
    <p class="center" style="margin-top:28px"><a class="btn btn-secondary" href="/faq">See all ${faq.length} questions ${await icon('arrow-right', 16)}</a></p>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="container">
    <div class="section-head reveal"><span class="kicker">${await icon('file-text', 16)} Guides</span><h2 class="h2">From the blog</h2></div>
    <div class="posts">${(await Promise.all(posts.slice(0, 3).map((p) => postCard(p)))).join('')}</div>
    <p class="center" style="margin-top:28px"><a class="btn btn-secondary" href="/blog">All guides ${await icon('arrow-right', 16)}</a></p>
  </div>
</section>

<section class="section-sm"><div class="container">${await ctaBand()}</div></section>
</main>`;
  return {
    path: '/',
    title: 'Unique PDF — Free PDF Editor for Chrome with AI Chat',
    description: 'Chat with any PDF, get AI summaries, and merge, compress, edit, sign and protect PDFs in Chrome. Free, private and nothing is ever uploaded.',
    body,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Unique PDF',
        alternateName: 'Unique PDF: Offline PDF Editor',
        applicationCategory: 'BrowserApplication',
        applicationSubCategory: 'PDF editor',
        operatingSystem: 'Google Chrome',
        softwareVersion: VERSION,
        description: 'Free PDF editor for Chrome with Unique AI: chat with PDFs, AI summaries, merge, split, compress, convert, edit, sign, protect and redact. Files are processed in the browser and never uploaded.',
        url: SITE.url,
        image: abs('/images/og.jpg'),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        author,
        publisher: pub,
        featureList: tools.map((t) => t.name),
      },
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url, publisher: pub },
      { '@context': 'https://schema.org', '@type': 'Organization', name: SITE.brand, url: SITE.url, logo: abs('/images/icon-512.png'), founder: author },
    ],
  };
}

export async function ctaBand() {
  return `<div class="cta-band reveal"><h2>Your next PDF, done in seconds.</h2><p>Join people who chat with, edit and sign PDFs without uploading them anywhere. Free, private and ready in one click.</p>${installButton('btn btn-lg')}</div>`;
}

const pageHero = (crumbs, kicker, title, lead) => `<section class="page-hero">${bg}<div class="container rel">
  <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([l, h], i) => (i < crumbs.length - 1 ? `<a href="${h}">${l}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${l}</span>`)).join('')}</nav>
  ${kicker ? `<p class="kicker" style="margin-top:22px">${kicker}</p>` : ''}
  <h1>${title}</h1>
  ${lead ? `<p class="lead">${lead}</p>` : ''}
</div></section>`;

export async function features({ tools }) {
  const sections = await Promise.all(
    CATEGORIES.map(async (c) => {
      const list = tools.filter((t) => t.category === c.id);
      const items = await Promise.all(
        list.map(async (t) => {
          const d = TOOL_DETAILS[t.id];
          return `<article class="card feature reveal c-${t.category}" id="${t.id}"><div class="tile">${await icon(t.icon, 21)}</div><div><h3>${esc(t.name)}</h3><p>${esc(d.long)}</p><ul>${d.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div></article>`;
        }),
      );
      return `<section class="feature-cat" aria-labelledby="cat-${c.id}"><div class="feature-cat-head"><span class="tile c-${c.id}">${await icon(list[0].icon, 21)}</span><div><h2 id="cat-${c.id}">${c.title}</h2><p class="muted">${c.blurb}</p></div></div><div class="feature-list">${items.join('')}</div></section>`;
    }),
  );
  const extras = [
    ['mouse-pointer-click', 'Drag and drop anywhere', 'Drop files on the home screen for tool suggestions, or straight onto a tool card.'],
    ['search', 'Command palette', 'Press Ctrl+K (Cmd+K on Mac) to jump to any tool or page by name.'],
    ['zap', 'Quick-access popup', 'Open favourite tools from the toolbar, or press Alt+Shift+U.'],
    ['moon', 'Light and dark themes', 'Choose light, dark or match your system.'],
    ['clock', 'Recent files', 'An optional list of recent tasks — file names and sizes only, never contents.'],
    ['wifi-off', 'Works offline', 'Every PDF tool works without an internet connection once installed.'],
    ['lock', 'Password-protected PDFs', 'Enter the password once and use the document in any tool. No guessing, no bypassing.'],
    ['badge-check', 'Accessible', 'Keyboard operable, screen-reader friendly and tested against WCAG 2.2 AA.'],
  ];
  const body = `<main id="main">
${pageHero([['Home', '/'], ['Features', '/features']], `${await icon('layers', 16)} Features`, 'Everything Unique PDF can do', 'Twenty PDF tools and Unique AI in one free Chrome extension. Every one of them runs in your browser, so your files are never uploaded.')}
<div class="container">${sections.join('')}
<section class="feature-cat" aria-labelledby="cat-extras"><div class="feature-cat-head"><span class="tile c-ai">${await icon('star', 21)}</span><div><h2 id="cat-extras">And everything around them</h2><p class="muted">Small details that make everyday PDF work faster.</p></div></div>
<div class="feature-list">${(await Promise.all(extras.map(async ([ic, t, d]) => `<article class="card feature reveal"><div class="tile c-organize">${await icon(ic, 21)}</div><div><h3>${t}</h3><p>${d}</p></div></article>`))).join('')}</div></section>
<section class="section-sm">${await ctaBand()}</section>
</div></main>`;
  return {
    path: '/features',
    title: 'Features — 20 Free PDF Tools and AI Chat | Unique PDF',
    description: 'Chat with PDFs, AI summaries, merge, split, organize, compress, convert, edit, sign, watermark, protect and redact. See every Unique PDF feature.',
    body,
    jsonLd: [breadcrumbLd([['Home', '/'], ['Features', '/features']])],
  };
}

export async function faqPage({ faq }) {
  const body = `<main id="main">
${pageHero([['Home', '/'], ['FAQ', '/faq']], `${await icon('book-open', 16)} FAQ`, 'Frequently asked questions', 'Everything you might want to know about Unique PDF, Unique AI and your privacy.')}
<section class="section-sm" style="padding-top:24px"><div class="container narrow">${await faqHtml(faq)}
<p class="center muted" style="margin-top:32px">Still have a question? <a href="${SITE.developer.telegram}" target="_blank" rel="noopener">Ask the developer on Telegram</a>.</p></div></section>
<section class="section-sm"><div class="container">${await ctaBand()}</div></section>
</main>`;
  return {
    path: '/faq',
    title: 'FAQ — Unique PDF Questions Answered',
    description: 'Is Unique PDF free? Are files uploaded? What does Unique AI need? Answers to the most common questions about the free PDF editor for Chrome.',
    body,
    jsonLd: [faqLd(faq), breadcrumbLd([['Home', '/'], ['FAQ', '/faq']])],
  };
}

export async function blogIndex({ posts }) {
  const body = `<main id="main">
${pageHero([['Home', '/'], ['Blog', '/blog']], `${await icon('file-text', 16)} Blog`, 'Guides for working with PDFs', 'Practical, privacy-friendly how-tos: chat with a PDF, summarize, merge, compress, sign and redact — without uploading your files.')}
<section class="section-sm" style="padding-top:24px"><div class="container"><h2 class="sr-only">All guides</h2><div class="posts">${(await Promise.all(posts.map((p) => postCard(p, 3)))).join('')}</div></div></section>
<section class="section-sm"><div class="container">${await ctaBand()}</div></section>
</main>`;
  return {
    path: '/blog',
    title: 'Blog — PDF Guides and Tips | Unique PDF',
    description: 'How to chat with a PDF, summarize with AI, merge, compress, sign and redact PDFs privately in Chrome. Practical guides from Unique PDF.',
    body,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'Blog', name: 'Unique PDF Blog', url: abs('/blog'), publisher: pub, blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: abs(`/blog/${p.slug}`), datePublished: p.date })) },
      breadcrumbLd([['Home', '/'], ['Blog', '/blog']]),
    ],
  };
}

export async function blogPost(post, posts) {
  const others = posts.filter((p) => p.slug !== post.slug);
  const related = [...others.filter((p) => p.tag === post.tag), ...others.filter((p) => p.tag !== post.tag)].slice(0, 3);
  const date = new Date(`${post.date}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const path = `/blog/${post.slug}`;
  const body = `<main id="main">
${pageHero([['Home', '/'], ['Blog', '/blog'], [post.title, path]], esc(post.tag), esc(post.title), esc(post.description))}
<div class="container">
  <div class="author" style="margin-top:0"><img src="/images/shahriar-ahmed.webp" width="44" height="44" alt="" loading="lazy"><span><b>${SITE.developer.name}</b>Developer of Unique PDF · <time datetime="${post.date}">${date}</time> · ${post.minutes} min read</span></div>
  <div class="article" style="margin-top:40px">
    <article class="prose">${post.html}
      <div class="card article-cta"><div><h2>Try Unique PDF free</h2><p class="muted" style="margin-top:6px">20 PDF tools and Unique AI in Chrome. Nothing is ever uploaded.</p></div>${installButton('btn btn-primary')}</div>
    </article>
    ${post.headings.length ? `<aside class="card toc" aria-label="On this page"><b>On this page</b>${post.headings.map((h) => `<a href="#${h.id}">${esc(h.text)}</a>`).join('')}</aside>` : ''}
  </div>
  <section class="section-sm"><h2 class="h2" style="font-size:30px;margin-bottom:26px">More guides</h2><div class="posts">${(await Promise.all(related.map((p) => postCard(p)))).join('')}</div></section>
</div>
</main>`;
  return {
    path,
    type: 'article',
    title: post.title.length > 52 ? post.title : `${post.title} | Unique PDF`,
    description: post.description,
    body,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.date,
        author,
        publisher: pub,
        image: abs('/images/og.jpg'),
        mainEntityOfPage: abs(path),
        wordCount: post.words,
      },
      breadcrumbLd([['Home', '/'], ['Blog', '/blog'], [post.title, path]]),
    ],
  };
}

export async function privacy({ html }) {
  const body = `<main id="main">
${pageHero([['Home', '/'], ['Privacy policy', '/privacy']], `${await icon('shield-check', 16)} Privacy`, 'Privacy policy', 'Unique PDF is built so that your documents never leave your device. Here are the details, in plain language.')}
<section class="section-sm" style="padding-top:24px"><div class="container narrow"><div class="card" style="padding:clamp(24px,5vw,48px)"><div class="prose">${html}</div></div></div></section>
</main>`;
  return { path: '/privacy', title: 'Privacy Policy | Unique PDF', description: 'Unique PDF processes your files in your browser. Documents are never uploaded, and usage stats are optional. Read the full privacy policy.', body, jsonLd: [breadcrumbLd([['Home', '/'], ['Privacy policy', '/privacy']])] };
}

export async function about() {
  const body = `<main id="main">
${pageHero([['Home', '/'], ['About', '/about']], `${await icon('heart', 16)} About`, 'Useful technology. Accessible to everyone.', 'Unique PDF exists because working with PDFs should not mean handing your private documents to strangers, paying a subscription or fighting watermarks.')}
<section class="section-sm" style="padding-top:24px"><div class="container narrow">
  <div class="card dev-card reveal">
    <img class="dev-photo" src="/images/shahriar-ahmed.webp" width="140" height="140" alt="${SITE.developer.name}">
    <div>
      <p class="kicker">About the developer</p>
      <h2 style="margin-top:8px">${SITE.developer.name}</h2>
      <p class="muted" style="margin-top:4px">Developer of Unique PDF · Unique Labs</p>
      <p style="margin-top:14px">Unique PDF is designed and built by ${SITE.developer.name} at Unique Labs, with one goal: useful technology that is accessible to everyone — free, private and without sign-ups.</p>
      <div class="links"><a class="btn btn-secondary btn-sm" href="${SITE.developer.url}" target="_blank" rel="noopener">${await icon('globe', 16)} www.shahriarahmed.net</a><a class="btn btn-secondary btn-sm" href="${SITE.developer.telegram}" target="_blank" rel="noopener">${await icon('send', 16)} Telegram ${SITE.developer.handle}</a></div>
    </div>
  </div>
  <div class="prose" style="margin-top:56px">
    <h2>What we believe</h2>
    <p><strong>Your documents are yours.</strong> Unique PDF processes every file inside your browser. There is no server that receives your documents and no account. Anonymous usage stats are off unless you turn them on.</p>
    <p><strong>Good tools should be free.</strong> Every feature, including Unique AI, is free for everyone, with no daily limits and no watermarks. If Unique PDF helps you, you can support it with a <a href="/donate">donation</a> or a review.</p>
    <p><strong>Details matter.</strong> Light and dark themes, keyboard support, accessible design, careful handling of password-protected and unusual files, and redaction that really removes text — not just covers it.</p>
    <h2>Get in touch</h2>
    <p>Found a bug or have an idea? Message ${SITE.developer.name} on <a href="${SITE.developer.telegram}" target="_blank" rel="noopener">Telegram</a> or visit <a href="${SITE.developer.url}" target="_blank" rel="noopener">www.shahriarahmed.net</a>.</p>
  </div>
</div></section>
<section class="section-sm"><div class="container">${await ctaBand()}</div></section>
</main>`;
  return {
    path: '/about',
    title: 'About Unique PDF and the Developer, Shahriar Ahmed',
    description: 'Unique PDF is made by Unique Labs and developed by Shahriar Ahmed: free, private PDF tools for everyone, with no uploads and no watermarks.',
    body,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About Unique PDF', url: abs('/about'), about: { '@type': 'Person', name: SITE.developer.name, url: SITE.developer.url, image: abs('/images/shahriar-ahmed.webp'), jobTitle: 'Developer', worksFor: pub } }, breadcrumbLd([['Home', '/'], ['About', '/about']])],
  };
}

export async function donate({ wallets }) {
  const tokens = { evm: ['eth', 'usdt', 'bnb', 'avax'], sol: ['sol'], btc: ['btc'] };
  const cards = await Promise.all(
    wallets.map(
      async (w) => `<article class="card wallet reveal">
      <div class="tokens">${tokens[w.id].map((t) => `<img src="/images/donate/tok-${t}.svg" width="30" height="30" alt="${t.toUpperCase()}" loading="lazy">`).join('')}</div>
      <h3>${esc(w.name)}</h3><p class="muted" style="font-size:14px">${esc(w.subtitle)}</p>
      <div class="qr"><img src="/images/donate/qr-${w.id}.svg" width="160" height="160" alt="QR code for the ${esc(w.name)} donation address" loading="lazy"></div>
      <code class="addr">${esc(w.address)}</code>
      <button class="btn btn-primary btn-sm" type="button" data-copy="${esc(w.address)}">${await icon('copy', 16)}<span>Copy address</span></button>
      <small>${esc(w.note)}</small>
    </article>`,
    ),
  );
  const body = `<main id="main">
${pageHero([['Home', '/'], ['Donate', '/donate']], `${await icon('hand-heart', 16)} Donate`, 'Keep Unique PDF free for everyone', 'Unique PDF has no subscriptions, no ads and no watermarks. If it saved you time, a small tip helps keep it that way. Even $0.10 means a lot.')}
<section class="section-sm" style="padding-top:24px"><div class="container">
  <h2 class="h2 center" style="font-size:30px;margin-bottom:28px">Donation addresses</h2>
  <div class="wallets">${cards.join('')}</div>
  <p class="center muted" style="margin-top:22px">Always double-check the network before you send. Crypto sent on the wrong network can’t be recovered.</p>
  <div class="section-head" style="margin-top:72px;margin-bottom:28px"><h2 class="h2" style="font-size:34px">Other ways to help — all free</h2></div>
  <div class="reasons">
    <div class="card reason"><span class="ic">${await icon('star', 22)}</span><h3>Leave a review</h3><p>A 5-star review on the Chrome Web Store helps other people find free, private PDF tools.</p></div>
    <div class="card reason"><span class="ic">${await icon('send', 22)}</span><h3>Share it</h3><p>Tell a friend or colleague who works with PDFs. Word of mouth is how Unique PDF grows.</p></div>
    <div class="card reason"><span class="ic">${await icon('sparkles', 22)}</span><h3>Suggest a feature</h3><p>Have an idea? <a href="${SITE.developer.telegram}" target="_blank" rel="noopener">Message the developer on Telegram</a>.</p></div>
  </div>
</div></section>
</main>`;
  return { path: '/donate', title: 'Donate — Support Unique PDF', description: 'Unique PDF is free with no ads or subscriptions. Support development with a small crypto donation (EVM, Solana or Bitcoin) or a review.', body, jsonLd: [breadcrumbLd([['Home', '/'], ['Donate', '/donate']])] };
}

export async function notFound() {
  const body = `<main id="main"><section class="page-hero" style="padding:120px 0">${bg}<div class="container rel center">
  <p class="kicker" style="justify-content:center">404</p><h1>This page doesn’t exist</h1><p class="lead" style="margin:18px auto 0">The link may be broken or the page may have moved.</p>
  <p style="margin-top:32px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="/">Go to the home page</a><a class="btn btn-secondary" href="/blog">Read the guides</a></p></div></section></main>`;
  return { path: '/404', title: 'Page not found | Unique PDF', description: 'This page does not exist.', body, noindex: true };
}
