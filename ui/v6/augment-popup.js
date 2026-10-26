// Augment detail popup, shared by the build page (index.html) and the coach
// page (coach.html): any element with data-apop="<augment id>" opens the
// augment the way data-epop opens an Eternal — what it does (catalog text),
// the verified "why take it" line for this hero and lane (augment-reviews.json),
// and how the ranked field does with it: every augment of this hero in this
// lane side by side (pick share + win rate), and this augment in the hero's
// other lanes. Optional attributes:
//   data-apop-role="<role>"     the lane being viewed (else every lane is shown)
//   data-apop-band="plat+"      show Plat+ counts (rank at match time) when the lane has them
//   data-apop-label="<text>"    a tag for the clicked augment ("ran this game", …)
// Click, tap, or Enter/Space on a focused trigger. Zero-API: reads committed
// data only. Uses game-text.js when present.
(() => {
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = (s) => (globalThis.GameText ? GameText.plain(s) : String(s ?? '').replace(/<[^>]+>/g, ''));
const style = document.createElement('style');
style.textContent = `
  .apop-back { position:fixed; inset:0; background:rgba(5,5,10,.65); backdrop-filter:blur(3px); z-index:80; display:flex; align-items:center; justify-content:center; padding:1rem; }
  .apop { position:relative; background:var(--bg-1); color:var(--text-1); border:1px solid var(--border); border-radius:16px; max-width:440px; width:100%; max-height:85dvh; overflow-y:auto; overscroll-behavior:contain; padding:1rem 1.1rem; box-shadow:0 18px 50px rgba(0,0,0,.6); line-height:1.5; }
  .apop .ahead { display:flex; gap:.7rem; align-items:center; padding-right:2.4rem; }
  .apop .ahead img { width:52px; height:52px; border-radius:50%; object-fit:contain; padding:2px; background:var(--bg-2); border:2px solid var(--accent); flex:none; }
  .apop .ahead b { font-size:1.05rem; color:var(--text-0); display:block; }
  .apop .ahead small { font-size:.74rem; color:var(--text-2); }
  .apop .ax { position:absolute; top:.6rem; right:.6rem; width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:var(--bg-2); border:1px solid var(--border); border-radius:50%; color:var(--text-1); font-size:1.1rem; line-height:1; cursor:pointer; }
  .apop .ax:hover, .apop .ax:focus-visible { color:var(--text-0); border-color:var(--accent); }
  .apop .ak { display:block; color:var(--text-2); font-weight:700; font-size:.6875rem; margin:.8rem 0 .2rem; }
  .apop .adesc { font-size:.84rem; color:var(--text-0); }
  .apop .awhy { color:var(--gold); font-size:.84rem; font-weight:500; margin-top:.6rem; }
  .apop .atag { font-size:.6875rem; font-weight:700; color:var(--green); background:rgba(0,196,140,.16); border-radius:999px; padding:.05rem .4rem; margin-left:.35rem; white-space:nowrap; }
  .apop .arow { display:grid; grid-template-columns:24px 1fr auto auto; gap:.5rem; align-items:center; font-size:.78rem; padding:.3rem .4rem; border-radius:8px; }
  .apop .arow img { width:24px; height:24px; border-radius:50%; object-fit:contain; background:var(--bg-2); border:1px solid var(--border); }
  .apop .aitem { border-radius:8px; padding:.1rem 0; border-bottom:1px dashed var(--border); }
  .apop .aitem:last-of-type { border-bottom:0; }
  .apop .aitem.here { background:var(--bg-2); box-shadow:0 0 0 1px var(--accent) inset; border-bottom-color:transparent; }
  .apop .aitem.here .arow { color:var(--text-0); font-weight:600; }
  .apop .aexp { font-size:.74rem; color:var(--text-2); line-height:1.45; padding:0 .4rem .4rem calc(.4rem + 24px + .5rem); }
  .apop .aexp .aw { display:block; color:var(--text-1); margin-bottom:.15rem; }
  .apop .arow .n { color:var(--text-2); font-size:.6875rem; font-variant-numeric:tabular-nums; text-align:right; }
  .apop .arow .wr { font-variant-numeric:tabular-nums; text-align:right; min-width:3.2em; }
  .apop .wr.good { color:var(--green); } .apop .wr.bad { color:var(--red); }
  .apop .anote { font-size:.7rem; color:var(--text-2); margin:.35rem 0 0; }
  .apop .afoot { display:flex; gap:.5rem; margin-top:.9rem; }
  .apop .afoot a, .apop .afoot button { flex:1; text-align:center; background:var(--bg-2); border:1px solid var(--border); border-radius:10px; color:var(--text-1); padding:.45rem; font:inherit; font-size:.8rem; text-decoration:none; cursor:pointer; }
  [data-apop] { cursor:pointer; }
`;
document.head.appendChild(style);

let DATA = null;
const optional = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
function load() {
  if (!DATA) {
    DATA = Promise.all([
      fetch('../../data/aggregates/predgg-augments.json').then((r) => { if (!r.ok) throw Error('Unavailable'); return r.json(); }),
      optional('../../data/aggregates/augment-reviews.json'),
      optional('../../data/catalog/heroes.json'),
    ]).then(([augs, reviews, heroes]) => {
      const list = Array.isArray(heroes) ? heroes : (heroes && heroes.heroes) || [];
      return { augs, reviews, names: new Map(list.map((h) => [h.slug, h.display_name || h.name || h.slug])) };
    }).catch((err) => { DATA = null; throw err; });
  }
  return DATA;
}

const ROLE_LABEL = { midlane: 'Midlane', offlane: 'Offlane', carry: 'Carry', jungle: 'Jungle', support: 'Support' };
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const wrClass = (wr) => (wr >= 0.52 ? 'good' : wr <= 0.48 ? 'bad' : '');

async function showAugment(id, opts = {}) {
  let d;
  try { d = await load(); } catch { return; }
  const cat = d.augs.catalog && d.augs.catalog[id];
  if (!cat) return;
  const hero = cat.hero;
  const heroName = d.names.get(hero) || hero;
  const cells = (d.augs.heroes && d.augs.heroes[hero]) || {};
  const role = opts.role && cells[opts.role] ? opts.role : null;
  // Plat+ only on the match-time basis, and only when this lane has Plat+ games.
  const platOf = (c) => (opts.band === 'plat+' && d.augs.goldBasis === 'match-time' && c && c.platPlus && c.platPlus.games ? c.platPlus : null);
  const roleCell = role ? (platOf(cells[role]) || cells[role]) : null;
  const plat = !!(role && platOf(cells[role]));
  const why = role && d.reviews && d.reviews.heroes && d.reviews.heroes[hero] && d.reviews.heroes[hero][role] && d.reviews.heroes[hero][role][id];

  // Every other augment is explained in place (what it does + the verified
  // "why" for this lane), so the lane list reads as a comparison, not just numbers.
  // The clicked augment's own text is already at the top.
  const reviewOf = (aid) => role && d.reviews && d.reviews.heroes && d.reviews.heroes[hero] && d.reviews.heroes[hero][role] && d.reviews.heroes[hero][role][aid];
  const explain = (aid) => {
    if (aid === id) return '';
    const desc = clean(d.augs.catalog[aid] && d.augs.catalog[aid].description);
    const w = reviewOf(aid);
    return desc || w ? `<div class="aexp">${w ? `<span class="aw">${esc(w)}</span>` : ''}${desc ? `<span>${esc(desc)}</span>` : ''}</div>` : '';
  };
  const augRow = (g, games) => {
    const wr = g.n ? g.w / g.n : null;
    return `<div class="aitem${g.id === id ? ' here' : ''}"><div class="arow">
      <img src="../img/augments/${esc(g.id)}.webp" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span>${esc(g.name)}${g.id === id ? `<span class="atag">${esc(opts.label || 'this one')}</span>` : ''}</span>
      <span class="n">${g.n ? `${games ? `${pct(g.n / games)} pick · ` : ''}${g.n.toLocaleString()}` : 'not picked here'}</span>
      <span class="wr ${wr == null ? '' : wrClass(wr)}">${wr == null ? '—' : pct(wr, 1)}</span>
    </div>${explain(g.id)}</div>`;
  };
  // The hero's whole augment list: the lane's counted ones by games, then any
  // catalog augment this lane never took.
  // No lane given (coach page): every lane summed.
  const allLanes = () => {
    const sum = new Map();
    for (const c of Object.values(cells)) for (const g of c.augments || []) {
      const p = sum.get(g.id) || { id: g.id, name: g.name, n: 0, w: 0 };
      sum.set(g.id, { ...p, n: p.n + g.n, w: p.w + g.w });
    }
    return [...sum.values()];
  };
  const laneAugs = (role ? (roleCell && roleCell.augments) || [] : allLanes()).slice().sort((x, y) => y.n - x.n);
  const laneGames = role ? roleCell && roleCell.games : Object.values(cells).reduce((t, c) => t + (c.games || 0), 0);
  const unpicked = Object.entries(d.augs.catalog).filter(([aid, c]) => c.hero === hero && !laneAugs.some((g) => g.id === aid)).map(([aid, c]) => ({ id: aid, name: c.name, n: 0, w: 0 }));
  const laneBlock = laneAugs.length || unpicked.length ? `
      <span class="ak">All ${esc(heroName)} augments · ${role ? esc(ROLE_LABEL[role] || role) : 'every lane'} · ${plat ? 'Plat+ (rank in that game)' : 'ranked, all ranks'} · this patch</span>
      ${[...laneAugs, ...unpicked].map((g) => augRow(g, laneGames)).join('')}
      ${laneGames ? `<p class="anote">pick = share of ${laneGames.toLocaleString()} ${esc(heroName)} ${role ? esc(role) + ' ' : ''}games · win rate on the right${laneGames < 300 ? ' · thin sample, read loosely' : ''}</p>` : ''}` : '';
  // The same augment in the hero's other lanes (or every lane when none was given).
  const others = Object.entries(cells).filter(([r]) => r !== role).map(([r, c]) => {
    const g = (c.augments || []).find((x) => x.id === id);
    return g && g.n >= 20 ? { r, g, games: c.games } : null;
  }).filter(Boolean).sort((x, y) => y.g.n - x.g.n);
  const otherBlock = others.length ? `
      <span class="ak">${role ? 'In other lanes' : 'By lane'} · ranked, all ranks</span>
      ${others.map(({ r, g, games }) => `<div class="arow"><span></span><span>${esc(ROLE_LABEL[r] || r)}</span><span class="n">${pct(g.n / games)} pick · ${g.n.toLocaleString()}</span><span class="wr ${wrClass(g.w / g.n)}">${pct(g.w / g.n, 1)}</span></div>`).join('')}` : '';

  const back = document.createElement('div');
  back.className = 'apop-back';
  back.innerHTML = `
    <div class="apop" role="dialog" aria-modal="true" aria-label="${esc(cat.name)} augment">
      <button type="button" class="ax aclose" aria-label="Close">✕</button>
      <div class="ahead">
        <img src="../img/augments/${esc(id)}.webp" alt="" onerror="this.style.visibility='hidden'">
        <div><b>${esc(cat.name)}</b><small>${esc(heroName)} augment${role ? ` · ${esc(ROLE_LABEL[role] || role)}` : ''}</small></div>
      </div>
      ${why ? `<div class="awhy">${esc(why)}</div>` : ''}
      <span class="ak">What it does</span>
      <div class="adesc">${esc(clean(cat.description))}</div>
      ${laneBlock}
      ${otherBlock}
      <div class="afoot"><a href="index.html?hero=${esc(hero)}${role ? `&role=${esc(role)}` : ''}">${esc(heroName)} page</a><button type="button" class="aclose">close</button></div>
    </div>`;
  const opener = document.activeElement;
  const dismiss = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (opener && opener.focus) opener.focus(); };
  const onKey = (ev) => {
    if (ev.key === 'Escape') { ev.stopImmediatePropagation(); dismiss(); }
    if (ev.key === 'Tab') {
      const f = [...back.querySelectorAll('a,button')];
      const i = f.indexOf(document.activeElement);
      ev.preventDefault(); ev.stopImmediatePropagation();
      f[(i + (ev.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  };
  back.onclick = (ev) => { if (ev.target === back || ev.target.classList.contains('aclose')) { ev.stopPropagation(); dismiss(); } };
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  back.querySelector('.ax').focus();
}
const open = (el) => showAugment(el.dataset.apop, { role: el.dataset.apopRole, band: el.dataset.apopBand, label: el.dataset.apopLabel });
document.addEventListener('click', (ev) => {
  const el = ev.target.closest && ev.target.closest('[data-apop]');
  if (el) { ev.preventDefault(); ev.stopPropagation(); open(el); }
}, true);
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const el = ev.target.closest && ev.target.closest('[data-apop]');
  if (el) { ev.preventDefault(); ev.stopPropagation(); open(el); }
});
function enhance(root) {
  const els = [];
  if (root.matches && root.matches('[data-apop]')) els.push(root);
  if (root.querySelectorAll) els.push(...root.querySelectorAll('[data-apop]'));
  for (const el of els) {
    if (el.hasAttribute('tabindex')) continue;
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Augment details');
  }
}
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) enhance(n);
}).observe(document.body, { childList: true, subtree: true });
enhance(document);

window.showAugment = showAugment;
})();
