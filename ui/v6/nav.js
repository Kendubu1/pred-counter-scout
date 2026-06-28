/* Shared side-drawer ("hamburger") navigation for all v6 pages.
 * Augments the existing top tabs — it does not replace them. One source of
 * truth for every destination; include with <script defer src="nav.js"></script>.
 * All v6 pages live in ui/v6/, so these relative links are identical per page. */
(function () {
  const LINKS = [
    { href: './',                    label: 'Pick & Build',           match: ['', 'index.html'] },
    { href: 'squad.html',            label: 'Pre-Game',               match: ['squad.html'] },
    { href: 'coach.html',            label: 'Coach',                  match: ['coach.html'] },
    { sep: true },
    { href: 'livedraft.html',        label: 'Live draft',             match: ['livedraft.html'] },
    { href: '../patch-1.15.html',    label: 'Patch 1.15 review',      tag: 'new', match: ['patch-1.15.html'] },
    { href: '../learn-eternals.html',label: 'Learn Eternals',         match: ['learn-eternals.html'] },
    { href: 'about.html',            label: 'About & how this works', match: ['about.html'] },
  ];

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
  .nav-list a .nav-tag { margin-left:auto; font-size:.56rem; font-weight:700; text-transform:uppercase;
    letter-spacing:.06em; background:var(--accent); color:#fff; border-radius:99px; padding:.1rem .42rem; }
  `;

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
      return `<li><a class="${active.trim()}" href="${l.href}"><span>${l.label}</span>${tag}</a></li>`;
    }).join('');

    drawer.innerHTML =
      '<div class="nav-drawer-head"><b>Pred Scout</b>' +
      '<button class="nav-close" aria-label="Close menu">×</button></div>' +
      `<ul class="nav-list">${items}</ul>`;

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
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
