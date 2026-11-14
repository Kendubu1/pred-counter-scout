/* Shared side-drawer ("hamburger") navigation for all v6 pages.
 * Augments the existing top tabs (Pick & Build, Coach, Reports) — it does not replace them. One source of
 * truth for every destination; include with <script defer src="nav.js"></script>.
 * All v6 pages live in ui/v6/, so these relative links are identical per page. */
(function () {
  const LINKS = [
    { group: 'Meta' },
    { href: './',                    label: 'Pick & Build',           icon: 'counter-pick',     match: ['', 'index.html'] },
    { href: 'bans.html',             label: 'Most banned',            icon: 'meta-guide',       match: ['bans.html'] },
    // the builds that lead a job AND win: tankiest, healing, shielding, magic and carry damage (npm run tanks)
    { href: 'tanks.html',            label: 'Top builds by job',      icon: 'meta-guide', tag: 'new', match: ['tanks.html'] },
    // only the current review; older ones are listed at the bottom of What's new
    { href: '../patch-1.18.html',    label: 'Patch 1.18 review',      icon: 'patch-strategy',   match: ['patch-1.18.html'] },
    { group: 'Coach' },
    { href: 'coach.html',            label: 'Game review',            icon: 'scout',            match: ['coach.html'] },
    { href: 'reports.html',          label: 'Player reports',         icon: 'scout',            match: ['reports.html'] },
    // who OUR squad should ban (from our reviewed games); the league boards stay on Most banned
    { href: 'ban-planner.html',      label: 'Ban planner',            icon: 'matchup',          match: ['ban-planner.html'] },
    { group: 'Learn' },
    { href: 'climb.html',            label: 'How to play ranked',     icon: 'power-spike',      match: ['climb.html'] },
    { href: '../learn-eternals.html',label: 'Learn Eternals',         icon: 'eternal-augment',  match: ['learn-eternals.html'] },
    // Tools still being proven: grouped so nobody mistakes them for finished pages.
    { group: 'Experimental' },
    { href: 'squad.html',            label: '5-stack picker',         icon: 'team-comp',        match: ['squad.html'] },
    // built on the kit-math sim; shown under Experimental even while sim-flag.js has the
    // sim off elsewhere (the page itself labels its counters as sim theory)
    { href: 'livedraft.html',        label: 'Live draft counter',     icon: 'weakness-counter', match: ['livedraft.html'] },
    { sep: true },
    { href: 'changes.html',          label: "What's new",             icon: 'role-path', tag: 'new', match: ['changes.html'] },
    { href: 'about.html',            label: 'About & how this works', icon: 'tap-to-learn',     match: ['about.html'] },
  ];
  const bic = (name) => (window.BrandIcons ? window.BrandIcons.svg(name, 18) : '');
  // The patch reviews and Learn Eternals live one folder up, in ui/, with their
  // own <header>. Links above are written from ui/v6/, so re-base them there.
  const IN_V6 = location.pathname.includes('/v6/');
  const rebase = (href) => (IN_V6 ? href : href.startsWith('../') ? href.slice(3) : href === './' ? 'v6/' : 'v6/' + href);

  const here = (location.pathname.split('/').pop() || '').toLowerCase();

  const css = `
  .nav-burger { margin-right:.5rem; background:transparent; border:1px solid var(--border); border-radius:10px;
    width:36px; height:32px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
    color:var(--text-1); flex-shrink:0; padding:0; }
  .nav-burger:hover { color:var(--text-0); border-color:var(--accent); }
  .nav-burger svg { width:18px; height:18px; }
  .nav-overlay { position:fixed; inset:0; background:rgba(4,4,8,.6); opacity:0; pointer-events:none;
    transition:opacity .2s ease; z-index:9998; }
  .nav-overlay.open { opacity:1; pointer-events:auto; }
  .nav-drawer { position:fixed; top:0; left:0; bottom:0; width:min(82vw, 320px);
    background:var(--bg-1); border-right:1px solid var(--border); z-index:9999;
    transform:translateX(-100%); transition:transform .22s cubic-bezier(.4,0,.2,1);
    display:flex; flex-direction:column; }
  .nav-drawer.open { transform:translateX(0); box-shadow:12px 0 40px rgba(0,0,0,.45); }
  .nav-drawer-head { display:flex; align-items:center; justify-content:space-between;
    padding:.85rem 1rem; border-bottom:1px solid var(--border); }
  .nav-drawer-head b { font-size:.9rem; color:var(--text-0); font-weight:800; }
  .nav-close { background:transparent; border:none; color:var(--text-2); font-size:1.3rem; line-height:1;
    cursor:pointer; padding:.1rem .3rem; }
  .nav-close:hover { color:var(--text-0); }
  .nav-list { list-style:none; margin:0; padding:.5rem; overflow-y:auto; }
  .nav-list li { margin:0; }
  .nav-list li.nav-sep { height:1px; background:var(--border); margin:.5rem .6rem; }
  .nav-list li.nav-group { padding:.35rem .7rem .2rem; font-size:.8rem; font-weight:600; color:var(--text-2); }
  .nav-list a { display:flex; align-items:center; gap:.7rem; padding:.7rem .7rem; border-radius:10px;
    color:var(--text-1); text-decoration:none; font-size:.9rem; }
  .nav-list a:hover { background:var(--bg-2); color:var(--text-0); }
  .nav-list a.active { background:var(--bg-3); color:var(--text-0); font-weight:700; }
  .nav-list a .nav-ic { display:inline-flex; width:20px; color:var(--text-2); flex:none; }
  .nav-list a:hover .nav-ic, .nav-list a.active .nav-ic { color:var(--text-0); }
  .nav-drawer-head b { display:inline-flex; align-items:center; gap:.5rem; }
  .nav-logo { display:block; }
  .nav-list a .nav-tag { margin-left:auto; font-size:.6875rem; font-weight:700; letter-spacing:0; background:var(--accent); color:#fff; border-radius:99px; padding:.1rem .42rem; }
  /* ── global hero search (every page): topbar pill + overlay ── */
  .gs-pill { margin-left:auto; display:inline-flex; align-items:center; gap:.4rem; background:var(--bg-2);
    border:1px solid var(--border); border-radius:99px; padding:.28rem .7rem; color:var(--text-2);
    font:inherit; font-size:.78rem; cursor:pointer; flex-shrink:1; min-width:0; }
  .gs-pill:hover { color:var(--text-0); border-color:var(--accent); }
  .gs-pill .gs-kbd { border:1px solid var(--border); border-radius:4px; padding:0 .3rem; font-size:.6875rem; }
  .gs-pill svg { width:14px; height:14px; flex:none; }
  /* On phones the burger drawer IS the nav, so the inline top-bar tabs + the
     patch pill are redundant and squeeze the wordmark down to "Pred". Hide both
     so the full "Pred Scout" lockup fits (the compact search pill stays). */
  /* ui/ root pages (patch reviews, Learn Eternals): burger, logo, search pill, then the tabs */
  header .header-inner { justify-content:flex-start; gap:.5rem; }
  header .nav-burger { margin-right:0; }
  @media (max-width:720px) { header .header-links { display:none; } }
  @media (max-width:720px) { .top .navlink { display:none; } .gs-pill .gs-txt, .gs-pill .gs-kbd { display:none; } .gs-pill { padding:.34rem .55rem; } }
  .gs-overlay { position:fixed; inset:0; background:rgba(4,4,8,.72); z-index:10000; display:none;
    align-items:flex-start; justify-content:center; padding:10vh 1rem 1rem; }
  .gs-overlay.open { display:flex; }
  .gs-panel { width:min(94vw, 520px); background:var(--bg-1); border:1px solid var(--border); border-radius:14px;
    box-shadow:0 18px 60px rgba(0,0,0,.55); overflow:hidden; }
  .gs-panel input { width:100%; background:var(--bg-2); border:none; border-bottom:1px solid var(--border);
    padding:.85rem 1rem; color:var(--text-0); font:inherit; font-size:1rem; outline:none; box-sizing:border-box; }
  .gs-list { max-height:52vh; overflow-y:auto; padding:.35rem; }
  .gs-row { display:flex; align-items:center; gap:.6rem; padding:.45rem .55rem; border-radius:10px; cursor:pointer; }
  .gs-row img { width:30px; height:30px; border-radius:7px; object-fit:cover; flex:none; }
  .gs-row .gs-n { color:var(--text-0); font-weight:700; font-size:.9rem; }
  .gs-row .gs-r { color:var(--text-2); font-size:.7rem; text-transform:capitalize; }
  .gs-row.sel, .gs-row:hover { background:var(--bg-2); }
  .gs-row .gs-acts { margin-left:auto; display:flex; gap:.35rem; }
  .gs-row .gs-acts button { background:transparent; border:1px solid var(--border); border-radius:8px;
    color:var(--text-1); font:inherit; font-size:.7rem; padding:.22rem .55rem; cursor:pointer; white-space:nowrap; }
  .gs-row .gs-acts button:hover { border-color:var(--accent); color:var(--text-0); }
  .gs-hint { padding:.45rem .8rem .6rem; color:var(--text-2); font-size:.6875rem; border-top:1px solid var(--border); }
  .gs-hint b { color:var(--text-1); }
  .nav-list .nav-search-item button { display:flex; align-items:center; gap:.7rem; width:100%; padding:.7rem;
    border-radius:10px; background:transparent; border:none; color:var(--text-1); font:inherit; font-size:.9rem;
    cursor:pointer; text-align:left; }
  .nav-list .nav-search-item button:hover { background:var(--bg-2); color:var(--text-0); }
  `;

  /* Global hero search: works from EVERY page that loads nav.js (v6 pages and
   * the ui/ root pages like the patch review). Each result offers the two jobs
   * the app exists for: open the hero's build, or open the lane room with them
   * locked in as the enemy ("how do I beat X"). */
  function heroSearch() {
    const inV6 = location.pathname.includes('/v6/');
    const DATA = inV6 ? '../../data/artifacts/index.json' : '../data/artifacts/index.json';
    const APP = inV6 ? './' : 'v6/';
    const IMGP = inV6 ? '../img/heroes/' : 'img/heroes/';
    let heroes = null, sel = 0, rows = [];

    const overlay = document.createElement('div');
    overlay.className = 'gs-overlay';
    overlay.innerHTML = '<div class="gs-panel" role="dialog" aria-label="Search heroes">' +
      '<input type="search" placeholder="Search a hero…" autocomplete="off">' +
      '<div class="gs-list"></div>' +
      '<div class="gs-hint"><b>Enter</b> build · <b>Shift+Enter</b> how to beat them · <b>Esc</b> close</div></div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector('input');
    const list = overlay.querySelector('.gs-list');

    const go = (slug, counter) => { location.href = APP + (counter ? '?counter=' : '?hero=') + slug; };
    const render = () => {
      const q = input.value.trim().toLowerCase();
      rows = (heroes || []).filter((h) => !q || h.name.toLowerCase().includes(q)).slice(0, q ? 12 : 8);
      sel = Math.min(sel, Math.max(rows.length - 1, 0));
      list.innerHTML = rows.map((h, i) => '<div class="gs-row' + (i === sel ? ' sel' : '') + '" data-slug="' + h.slug + '">' +
        '<img loading="lazy" src="' + IMGP + h.slug + '.webp" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<span><span class="gs-n">' + h.name + '</span> <span class="gs-r">' + h.role + '</span></span>' +
        '<span class="gs-acts"><button data-act="build">build</button><button data-act="counter">beat them</button></span></div>').join('') ||
        '<div class="gs-hint">no hero matches</div>';
      list.querySelectorAll('.gs-row').forEach((r, i) => {
        r.onclick = (e) => { const act = e.target.dataset && e.target.dataset.act; go(r.dataset.slug, act === 'counter'); };
        r.onmousemove = () => { if (sel !== i) { sel = i; list.querySelectorAll('.gs-row').forEach((x, j) => x.classList.toggle('sel', j === sel)); } };
      });
    };
    const open = async () => {
      overlay.classList.add('open');
      input.value = ''; sel = 0;
      input.focus();
      if (!heroes) {
        try { heroes = (await (await fetch(DATA)).json()).heroes || []; } catch { heroes = []; }
      }
      render();
    };
    const close = () => overlay.classList.remove('open');

    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter' && rows[sel]) { go(rows[sel].slug, e.shiftKey); }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
      else if (e.key === '/' && !overlay.classList.contains('open') &&
        !/^(input|textarea|select)$/i.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); open(); }
    });
    return { open };
  }

  function build() {
    const topInner = document.querySelector('.top .top-inner') || document.querySelector('.top-inner')
      || document.querySelector('header .header-inner');
    if (!topInner) return;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const burger = document.createElement('button');
    burger.className = 'nav-burger';
    burger.setAttribute('aria-label', 'Open menu');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    topInner.insertBefore(burger, topInner.firstChild);

    // global hero search — pill sits in the topbar of every page
    const search = heroSearch();
    const pill = document.createElement('button');
    pill.className = 'gs-pill';
    pill.setAttribute('aria-label', 'Search heroes');
    pill.title = 'Search a hero — build or how to beat them (press /)';
    pill.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span class="gs-txt">Search heroes</span><span class="gs-kbd">/</span>';
    pill.onclick = () => search.open();
    const firstLink = topInner.querySelector('.navlink') || topInner.querySelector('.header-links');
    topInner.insertBefore(pill, firstLink || null);

    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';

    const drawer = document.createElement('aside');
    drawer.className = 'nav-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Site menu');
    drawer.setAttribute('aria-hidden', 'true');

    const items = LINKS.filter((l) => !l.sim || window.SIM_ON === true).map((l, i) => {
      if (l.sep) return '<li class="nav-sep" role="separator"></li>';
      // the search row above already ends in a separator, so the first group skips its own
      if (l.group) return `${i ? '<li class="nav-sep" role="separator"></li>' : ''}<li class="nav-group">${l.group}</li>`;
      const active = l.match && l.match.includes(here) ? ' active' : '';
      const tag = l.tag ? `<span class="nav-tag">${l.tag}</span>` : '';
      return `<li><a class="${active.trim()}" href="${rebase(l.href)}"><span class="nav-ic">${bic(l.icon)}</span><span>${l.label}</span>${tag}</a></li>`;
    }).join('');

    const searchItem = `<li class="nav-search-item"><button type="button"><span class="nav-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span><span>Search heroes — build or counter</span></button></li><li class="nav-sep" role="separator"></li>`;
    drawer.innerHTML =
      '<div class="nav-drawer-head"><b><img class="nav-logo" src="' + (IN_V6 ? '../' : '') + 'img/brand/logo.svg" alt="" width="22" height="22"> Pred Scout</b>' +
      '<button class="nav-close" aria-label="Close menu">×</button></div>' +
      `<ul class="nav-list">${searchItem}${items}</ul>`;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    let lastFocus = null;
    const open = () => {
      lastFocus = document.activeElement;
      overlay.classList.add('open');
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      burger.setAttribute('aria-expanded', 'true');
      const first = drawer.querySelector('.nav-list a');
      if (first) first.focus();
    };
    const close = () => {
      overlay.classList.remove('open');
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      burger.setAttribute('aria-expanded', 'false');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };

    burger.addEventListener('click', open);
    overlay.addEventListener('click', close);
    drawer.querySelector('.nav-close').addEventListener('click', close);
    drawer.querySelector('.nav-search-item button').addEventListener('click', () => { close(); search.open(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
  }

  // One disclosure pattern for every fold on every page (2026-11-09: people could not tell what
  // opens). A chevron on the left that turns down when open; the larger rows (block folds) also get
  // a Show / Hide label on the right; hover background and focus ring. Injected here, at script
  // start, because every page loads nav.js. The :not(#allHeroes) also lifts these rules above each
  // page's older ▸/▾ rules. Opt out with data-fold="own" (Pick & Build's "Browse all heroes" header
  // draws its own chevron and uses ::before as a divider).
  (function folds() {
    if (document.getElementById('fold-style')) return;
    const D = 'details:not(#allHeroes):not([data-fold="own"])';
    const BIG = ':is(.sec-fold,.pf-row,.tb-fold,.deepdive,.sim-collapse,.evidence-section,.build-player,.more,.scope,.hero-augment-catalog,.sim-only)';
    const css = `
${D}>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:.5rem;border-radius:8px;-webkit-tap-highlight-color:transparent}
${D}>summary::-webkit-details-marker{display:none}
${D}>summary::marker{content:""}
${D}>summary::before{content:"";flex:none;width:.42rem;height:.42rem;margin:0 .2rem 0 .1rem;border-right:2px solid var(--text-1);border-bottom:2px solid var(--text-1);transform:rotate(-45deg);transition:transform .15s;color:inherit}
${D}[open]>summary::before{transform:rotate(45deg);margin-top:-.2rem}
${D}${BIG}>summary::after{content:"Show";margin-left:auto;flex:none;font-size:.68rem;font-weight:700;letter-spacing:.02em;color:var(--text-1);border:1px solid var(--border);border-radius:99px;padding:.1rem .55rem;background:var(--bg-2)}
${D}${BIG}[open]>summary::after{content:"Hide";color:var(--text-2)}
${D}>summary:hover{background:var(--bg-2)}
${D}>summary:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
${D}>summary .chev{display:none}
`;
    const st = document.createElement('style');
    st.id = 'fold-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
