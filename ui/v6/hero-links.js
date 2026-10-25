/* Every hero portrait on the site opens that hero's page. One delegated
 * listener instead of wrapping each render site in an <a>: portraits sit inside
 * pred.gg links, in-page jump links and clickable rows, where a nested anchor
 * is invalid. Include with <script defer src="hero-links.js"> (v6 pages) or
 * <script defer src="v6/hero-links.js"> (ui/ root pages).
 *
 * A portrait keeps its existing behaviour when it is already wired to that
 * hero: inside an <a> to ?hero=<slug>, or an element with data-slug="<slug>"
 * (index.html rows carry role context; lane-enemy chips and counter-mode cards
 * pick rather than navigate). Pickers opt out with a <button> or data-hero-pick. */
(function () {
  const script = document.currentScript;
  const APP = new URL('./', script ? script.src : location.href);
  const SLUG = /\/img\/heroes\/([a-z0-9-]+)\.webp(?:[?#]|$)/;

  const target = (ev) => {
    const img = ev.target;
    if (!img || img.tagName !== 'IMG') return null;
    const m = SLUG.exec(img.src);
    if (!m) return null;
    const slug = m[1];
    if (img.closest('button, [data-hero-pick]')) return null;
    if (img.closest(`[data-slug="${slug}"]`)) return null;
    const a = img.closest('a[href]');
    if (a && new URL(a.href, location.href).searchParams.get('hero') === slug) return null;
    // the hero's own header on its page
    const here = new URL(location.href);
    if (here.pathname === APP.pathname || here.pathname === APP.pathname + 'index.html') {
      if (here.searchParams.get('hero') === slug) return null;
    }
    return slug;
  };

  const open = (ev) => {
    const slug = target(ev);
    if (!slug) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const url = new URL('./?hero=' + encodeURIComponent(slug), APP).href;
    if (ev.type === 'auxclick' || ev.ctrlKey || ev.metaKey || ev.shiftKey) window.open(url, '_blank', 'noopener');
    else location.href = url;
  };
  // Capture on window so this runs before page-level row handlers and
  // document-level capture listeners.
  window.addEventListener('click', open, true);
  window.addEventListener('auxclick', (ev) => { if (ev.button === 1) open(ev); }, true);

  if (!document.getElementById('hero-links-style')) {
    const st = document.createElement('style');
    st.id = 'hero-links-style';
    st.textContent = 'img[src*="img/heroes/"]{cursor:pointer}';
    (document.head || document.documentElement).appendChild(st);
  }
})();
