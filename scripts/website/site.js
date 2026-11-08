/* Unique PDF website — progressive enhancement only; every page works without it. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header border once the page scrolls.
  const header = $('.header');
  const onScroll = () => header && header.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu.
  const menuBtn = $('.menu-btn');
  const mobileNav = $('.mobile-nav');
  if (menuBtn && mobileNav) {
    menuBtn.addEventListener('click', () => {
      const open = mobileNav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    mobileNav.addEventListener('click', (e) => e.target.closest('a') && mobileNav.classList.remove('open'));
  }

  // Theme: light ⇄ dark (the first click flips whatever is showing now).
  $$('.theme-toggle').forEach((btn) =>
    btn.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem('theme', next);
      } catch {
        /* private mode */
      }
    }),
  );

  // Reveal on scroll.
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
      { rootMargin: '0px 0px -8% 0px' },
    );
    reveals.forEach((el) => io.observe(el));
  } else reveals.forEach((el) => el.classList.add('in'));

  // Count-up numbers.
  $$('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    if (reduce || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / 1200);
        el.textContent = Math.round(target * (1 - (1 - p) ** 3)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
  });

  // Spotlight that follows the pointer on tool cards.
  $$('.tool').forEach((card) =>
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }),
  );

  // Tool filters and search.
  const toolGrid = $('[data-tools]');
  if (toolGrid) {
    const chips = $$('[data-filter]');
    const search = $('#tool-search');
    const empty = $('.tools-empty');
    let category = 'all';
    const apply = () => {
      const q = (search?.value || '').trim().toLowerCase();
      let shown = 0;
      $$('.tool', toolGrid).forEach((card) => {
        const ok = (category === 'all' || card.dataset.category === category) && (!q || card.dataset.search.includes(q));
        card.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    };
    chips.forEach((chip) =>
      chip.addEventListener('click', () => {
        category = chip.dataset.filter;
        chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        apply();
      }),
    );
    search?.addEventListener('input', apply);
  }

  // Tabs (screenshot showcase).
  $$('[role="tablist"]').forEach((list) => {
    const tabs = $$('[role="tab"]', list);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) select(tabs[(i + d + tabs.length) % tabs.length], true);
      });
    });
  });

  // Copy buttons.
  $$('[data-copy]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const label = btn.querySelector('span');
      const before = label ? label.textContent : '';
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        if (label) label.textContent = 'Copied';
      } catch {
        if (label) label.textContent = 'Select and copy the address';
      }
      setTimeout(() => label && (label.textContent = before), 1800);
    }),
  );

  // Hero chat demo: types a question, streams the answer, highlights the cited page.
  const demo = $('[data-demo]');
  const data = $('#demo-data');
  if (demo && data && !reduce) {
    const script = JSON.parse(data.textContent);
    const thread = $('.thread', demo);
    const composer = $('.composer-text', demo);
    const pages = $$('.page', demo);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(demo);
    const whenVisible = async () => {
      while (!visible || document.hidden) await wait(400);
    };
    const el = (tag, cls, html = '') => Object.assign(document.createElement(tag), { className: cls, innerHTML: html });
    const orb = $('.msg-a .orb', demo)?.outerHTML || '';

    const run = async () => {
      thread.innerHTML = '';
      for (let i = 0; ; i = (i + 1) % script.length) {
        const item = script[i];
        await whenVisible();
        pages.forEach((p) => p.classList.remove('hit'));
        // Type the question.
        for (let c = 1; c <= item.q.length; c++) {
          composer.textContent = item.q.slice(0, c);
          await wait(28 + Math.random() * 30);
        }
        await wait(350);
        composer.textContent = composer.dataset.placeholder;
        thread.append(el('div', 'msg-q', item.q));
        while (thread.children.length > 4) thread.firstElementChild.remove();
        // Thinking, then stream the answer word by word.
        const answer = el('div', 'msg-a', `${orb}<div><span class="out"></span><span class="caret"></span></div>`);
        thread.append(answer);
        const out = $('.out', answer);
        await wait(650);
        // Segments of plain and **bold** text, streamed word by word.
        const segments = item.a.split(/(\*\*[^*]+\*\*)/).filter(Boolean);
        for (const seg of segments) {
          const bold = seg.startsWith('**');
          const node = bold ? document.createElement('strong') : document.createTextNode('');
          out.append(node);
          for (const w of (bold ? seg.slice(2, -2) : seg).split(/(\s+)/)) {
            node.textContent += w;
            if (w.trim()) await wait(42);
          }
        }
        $('.caret', answer).remove();
        out.insertAdjacentHTML('beforeend', `<span class="cite">p. ${item.page}</span>`);
        pages[item.page - 1]?.classList.add('hit');
        await wait(3600);
      }
    };
    run();
  }
})();
