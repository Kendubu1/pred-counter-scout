/* Shared side-drawer ("hamburger") navigation for all v6 pages.
 * Augments the existing top tabs — it does not replace them. One source of
 * truth for every destination; include with <script defer src="nav.js"></script>.
 * All v6 pages live in ui/v6/, so these relative links are identical per page. */
(function () {
  const LINKS = [
    { href: './',                    label: 'Pick & Build',           icon: 'counter-pick',     match: ['', 'index.html'] },
    { href: 'squad.html',            label: 'Pre-Game',               icon: 'team-comp',        match: ['squad.html'] },
    { href: 'coach.html',            label: 'Coach',                  icon: 'scout',            match: ['coach.html'] },
    { sep: true },
    { href: 'livedraft.html',        label: 'Live draft',             icon: 'weakness-counter', match: ['livedraft.html'] },
    { href: '../patch-1.15.html',    label: 'Patch 1.15 review',      icon: 'patch-strategy', tag: 'new', match: ['patch-1.15.html'] },
    { href: '../learn-eternals.html',label: 'Learn Eternals',         icon: 'eternal-augment',  match: ['learn-eternals.html'] },
    { href: 'about.html',            label: 'About & how this works', icon: 'tap-to-learn',     match: ['about.html'] },
  ];
  const bic = (name) => (window.BrandIcons ? window.BrandIcons.svg(name, 18) : '');

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
    display:flex; flex-direction:column; box-shadow:12px 0 40px rgba(0,0,0,.45); }
  .nav-drawer.open { transform:translateX(0); }
  .nav-drawer-head { display:flex; align-items:center; justify-content:space-between;
    padding:.85rem 1rem; border-bottom:1px solid var(--border); }
  .nav-drawer-head b { font-size:.9rem; color:var(--text-0); font-weight:800; }
  .nav-close { background:transparent; border:none; color:var(--text-2); font-size:1.3rem; line-height:1;
    cursor:pointer; padding:.1rem .3rem; }
  .nav-close:hover { color:var(--text-0); }
  .nav-list { list-style:none; margin:0; padding:.5rem; overflow-y:auto; }
  .nav-list li { margin:0; }
  .nav-list li.nav-sep { height:1px; background:var(--border); margin:.5rem .6rem; }
  .nav-list a { display:flex; align-items:center; gap:.7rem; padding:.7rem .7rem; border-radius:10px;
    color:var(--text-1); text-decoration:none; font-size:.9rem; }
  .nav-list a:hover { background:var(--bg-2); color:var(--text-0); }
  .nav-list a.active { background:var(--accent-soft); color:var(--text-0); font-weight:700; }
  .nav-list a .nav-ic { display:inline-flex; width:20px; color:var(--text-2); flex:none; }
  .nav-list a:hover .nav-ic, .nav-list a.active .nav-ic { color:var(--text-0); }
  .nav-drawer-head b { display:inline-flex; align-items:center; gap:.5rem; }
  .nav-logo { display:block; }
  .nav-list a .nav-tag { margin-left:auto; font-size:.56rem; font-weight:700; text-transform:uppercase;
    letter-spacing:.06em; background:var(--accent); color:#fff; border-radius:99px; padding:.1rem .42rem; }
  /* ── global hero search (every page): topbar pill + overlay ── */
  .gs-pill { margin-left:auto; display:inline-flex; align-items:center; gap:.4rem; background:var(--bg-2);
    border:1px solid var(--border); border-radius:99px; padding:.28rem .7rem; color:var(--text-2);
    font:inherit; font-size:.78rem; cursor:pointer; flex-shrink:1; min-width:0; }
  .gs-pill:hover { color:var(--text-0); border-color:var(--accent); }
  .gs-pill .gs-kbd { border:1px solid var(--border); border-radius:4px; padding:0 .3rem; font-size:.66rem; }
  .gs-pill svg { width:14px; height:14px; flex:none; }
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
  .gs-hint { padding:.45rem .8rem .6rem; color:var(--text-2); font-size:.68rem; border-top:1px solid var(--border); }
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
        '<span class="gs-acts"><button data-act="build">build</button><button data-act="counter">⚔ beat them</button></span></div>').join('') ||
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
    const topInner = document.querySelector('.top .top-inner') || document.querySelector('.top-inner');
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
    const firstLink = topInner.querySelector('.navlink, .patch-pill');
    topInner.insertBefore(pill, firstLink || null);

    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';

    const drawer = document.createElement('aside');
    drawer.className = 'nav-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Site menu');
    drawer.setAttribute('aria-hidden', 'true');

    const items = LINKS.map((l) => {
      if (l.sep) return '<li class="nav-sep" role="separator"></li>';
      const active = l.match && l.match.includes(here) ? ' active' : '';
      const tag = l.tag ? `<span class="nav-tag">${l.tag}</span>` : '';
      return `<li><a class="${active.trim()}" href="${l.href}"><span class="nav-ic">${bic(l.icon)}</span><span>${l.label}</span>${tag}</a></li>`;
    }).join('');

    const searchItem = `<li class="nav-search-item"><button type="button"><span class="nav-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span><span>Search heroes — build or counter</span></button></li><li class="nav-sep" role="separator"></li>`;
    drawer.innerHTML =
      '<div class="nav-drawer-head"><b><img class="nav-logo" src="../img/brand/logo.svg" alt="" width="22" height="22"> Pred Scout</b>' +
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
