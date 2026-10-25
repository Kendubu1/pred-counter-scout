/* Shared sticky section menu (the pill row under the top bar) for every v6 page.
 * Each page picks its sections and labels; this wires the pills, gives each
 * section a readable id (#wave-control, #matchups), keeps the address bar on the
 * section being read so a copied link opens right there (and previews as that
 * section where the page has share pages), and on page load jumps to the
 * section a shared link names.
 *
 *   SectionNav.build(hostEl, [{ el: sectionEl, label: 'Matchups' }, ...])
 *
 * Load with a plain <script src="section-nav.js"></script> before the page's own
 * script: most pages build their menu as soon as their data renders. */
(function () {
  const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
  // Sections listed in <meta name="section-share"> have a generated preview page
  // (climb-when-to-swap.html, engine/scripts/share-pages.mjs) that redirects back
  // here. Link previews ignore the #fragment, so the bar shows that page instead
  // and a copied link previews the section, not the whole page.
  const shared = new Set((document.querySelector('meta[name="section-share"]')?.content || '').split(/\s+/).filter(Boolean));
  const page = location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
  const setHash = (id) => {
    const url = shared.has(id) ? `${page}-${id}.html` : '#' + id;
    try { history.replaceState(history.state, '', url); } catch { /* file:// etc. */ }
  };
  let firstBuild = true;
  let ready = false;

  function build(host, items) {
    if (!host) return;
    if (host._snIO) { host._snIO.disconnect(); host._snIO = null; }
    host.innerHTML = '';
    const used = new Set();
    for (const { el, label } of items) {
      // keep a meaningful id the page already set; replace the old generated ones
      if (!el.id || /^sec\d+$/.test(el.id)) {
        const base = slug(label);
        let id = base, n = 2;
        while (used.has(id) || (document.getElementById(id) && document.getElementById(id) !== el)) id = `${base}-${n++}`;
        el.id = id;
      }
      used.add(el.id);
      const b = document.createElement('button');
      b.className = 'snpill';
      b.dataset.t = el.id;
      b.textContent = label;
      host.appendChild(b);
    }
    document.documentElement.style.setProperty('--toph', `${document.querySelector('.top')?.offsetHeight ?? 96}px`);
    const pills = [...host.querySelectorAll('.snpill')];
    pills.forEach((p) => {
      p.onclick = () => { document.getElementById(p.dataset.t)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setHash(p.dataset.t); };
    });
    // centre the active pill by scrolling the pill ROW only — letting the browser
    // scroll ancestors pans the pinch-zoom viewport on iOS
    const centerPill = (p) => host.scrollTo({ left: p.offsetLeft - host.clientWidth / 2 + p.offsetWidth / 2, behavior: 'smooth' });
    const byId = new Map(pills.map((p) => [p.dataset.t, p]));
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        pills.forEach((p) => p.classList.toggle('active', p.dataset.t === e.target.id));
        const p = byId.get(e.target.id);
        if (p) centerPill(p);
        if (ready) setHash(e.target.id);
      }
    }, { rootMargin: '-15% 0px -75% 0px' });
    items.forEach(({ el }) => io.observe(el));
    host._snIO = io;

    // First menu on this page load: honour a shared #section link. The ids are
    // set here, after the browser's own anchor jump, so jump once now. Hash
    // updates from scrolling start afterwards, so landing doesn't rewrite it.
    if (firstBuild) {
      firstBuild = false;
      const want = location.hash && decodeURIComponent(location.hash.slice(1));
      const target = want && items.find(({ el }) => el.id === want);
      if (target) requestAnimationFrame(() => target.el.scrollIntoView({ block: 'start' }));
      // the last sections can't scroll up to the reading band, so mark the
      // linked one directly once the jump's scrollspy updates have run
      setTimeout(() => {
        ready = true;
        if (target) pills.forEach((p) => p.classList.toggle('active', p.dataset.t === target.el.id));
      }, 700);
    }
  }

  window.SectionNav = { build };
})();
