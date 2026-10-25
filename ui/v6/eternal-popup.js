// Eternal detail popup, shared by the build page (index.html) and the coach
// page (coach.html): any element with data-epop="<Eternal name>" opens the whole
// Eternal the way Learn Eternals shows it — major, both minor slots with every
// option, why you'd take it, and how to play against it — plus what each
// blessing gives (eternal-usage.json mechanics), who runs it in ranked, and the
// verified "why it's picked" lines (eternal-why.json). Optional attributes:
//   data-epop-minor="<minor name>"   highlight the minor that was clicked
//   data-epop-picks="<m1>|<m2>"      the minors this hero/role/player took
//   data-epop-label="<text>"         what those picks are ("ran this game", …)
// Click, tap, or Enter/Space on a focused trigger. Zero-API: reads committed
// data only. Uses game-text.js when present.
(() => {
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '');
const slug = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = (s) => (globalThis.GameText ? GameText.plain(s) : String(s ?? '').replace(/<[^>]+>/g, ''));
const style = document.createElement('style');
style.textContent = `
  .epop-back { position:fixed; inset:0; background:rgba(5,5,10,.65); backdrop-filter:blur(3px); z-index:80; display:flex; align-items:center; justify-content:center; padding:1rem; }
  .epop { position:relative; background:var(--bg-1); color:var(--text-1); border:1px solid var(--border); border-radius:16px; max-width:460px; width:100%; max-height:85dvh; overflow-y:auto; overscroll-behavior:contain; padding:1rem 1.1rem; box-shadow:0 18px 50px rgba(0,0,0,.6); line-height:1.5; }
  .epop .ehead { display:flex; gap:.7rem; align-items:center; padding-right:2.4rem; }
  .epop .ex { position:absolute; top:.6rem; right:.6rem; width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:var(--bg-2); border:1px solid var(--border); border-radius:50%; color:var(--text-1); font-size:1.1rem; line-height:1; cursor:pointer; }
  .epop .ex:hover, .epop .ex:focus-visible { color:var(--text-0); border-color:var(--accent); }
  .epop .etags { display:flex; flex-wrap:wrap; gap:.3rem; margin-top:.65rem; }
  .epop .etags span { font-size:.6875rem; font-weight:600; color:var(--accent-ink); background:var(--accent-dim, rgba(124,92,255,.14)); border-radius:999px; padding:.12rem .5rem; }
  .epop .epick { color:var(--gold); font-size:.84rem; font-weight:500; margin-top:.6rem; }
  .epop .eminor .ewm { display:block; color:var(--gold); margin-top:.15rem; }
  .epop .eminor .esh { color:var(--text-2); font-size:.6875rem; font-variant-numeric:tabular-nums; font-weight:400; margin-left:.3rem; }
  .epop .ewho { font-size:.76rem; }
  .epop .ewho .eroles { color:var(--text-1); }
  .epop .eheroes { display:flex; flex-wrap:wrap; gap:.35rem .7rem; margin-top:.35rem; }
  .epop .eheroes span { display:inline-flex; align-items:center; gap:.3rem; font-size:.72rem; color:var(--text-1); white-space:nowrap; }
  .epop .eheroes img { width:22px; height:22px; border-radius:50%; object-fit:cover; background:var(--bg-2); border:1px solid var(--border); }
  .epop .ehead img { width:52px; height:52px; border-radius:50%; object-fit:cover; background:var(--bg-2); border:2px solid var(--accent); flex:none; }
  .epop .ehead b { font-size:1.05rem; color:var(--text-0); display:block; }
  .epop .ehead small { font-size:.74rem; color:var(--text-2); }
  .epop .ek { display:block; color:var(--text-2); font-weight:700; font-size:.6875rem; letter-spacing:0; margin:.8rem 0 .2rem; }
  .epop .emajor { font-size:.84rem; }
  .epop .eminor { display:flex; gap:.5rem; align-items:flex-start; font-size:.78rem; color:var(--text-2); padding:.35rem 0 .35rem .55rem; border-left:2px solid var(--border); margin-bottom:.25rem; border-radius:0 6px 6px 0; }
  .epop .eminor img { width:24px; height:24px; border-radius:50%; object-fit:cover; background:var(--bg-2); flex:none; border:1px solid var(--border); }
  .epop .eminor b { display:block; color:var(--text-1); }
  .epop .eminor.pick { border-left-color:var(--green); }
  .epop .eminor.pick b { color:var(--text-0); }
  .epop .eminor.here { background:var(--bg-2); box-shadow:0 0 0 1px var(--accent) inset; }
  .epop .etag { font-size:.6875rem; font-weight:700; letter-spacing:0; color:var(--green); background:rgba(0,196,140,.16); border-radius:999px; padding:.05rem .4rem; margin-left:.3rem; white-space:nowrap; }
  .epop .enote { font-size:.7rem; color:var(--text-2); margin:.3rem 0 0; }
  .epop .ecounter { font-size:.78rem; color:var(--text-2); border-top:1px dashed var(--border); padding-top:.5rem; margin-top:.7rem; }
  .epop .ecounter b { color:var(--text-1); display:block; font-size:.6875rem; letter-spacing:0; }
  .epop .efoot { display:flex; gap:.5rem; margin-top:.9rem; }
  .epop .efoot a, .epop .efoot button { flex:1; text-align:center; background:var(--bg-2); border:1px solid var(--border); border-radius:10px; color:var(--text-1); padding:.45rem; font:inherit; font-size:.8rem; text-decoration:none; cursor:pointer; }
  [data-epop] { cursor:pointer; }
`;
document.head.appendChild(style);

let CATALOG = null;
const optional = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
async function eternals() {
  if (!CATALOG) {
    CATALOG = Promise.all([
      fetch('../../data/game-data/eternals.json').then((r) => { if (!r.ok) throw Error('Unavailable'); return r.json(); }),
      optional('../../data/aggregates/eternal-usage.json'),
      optional('../../data/aggregates/eternal-why.json'),
    ]).then(([d, usage, why]) => new Map((d.eternals || []).map((e) => [key(e.name), { ...e, usage: usage?.eternals?.[e.id] || null, copy: why?.eternals?.[e.id] || null }])))
      .catch((err) => { CATALOG = null; throw err; });
  }
  return CATALOG;
}
// A minor name alone can be ambiguous across Eternals, so a minor trigger
// should carry its Eternal; when it doesn't, fall back to the unique owner.
function ownerOf(map, minor) {
  const hits = [...map.values()].filter((e) => [...(e.minorSlot1 || []), ...(e.minorSlot2 || [])].some((m) => key(m.name) === key(minor)));
  return hits.length === 1 ? hits[0] : null;
}

const ROLE_LABEL = { midlane: 'Midlane', offlane: 'Offlane', carry: 'Carry', jungle: 'Jungle', support: 'Support' };
const pct = (x) => `${Math.round(x * 100)}%`;
async function showEternal(name, opts = {}) {
  let map;
  try { map = await eternals(); } catch { return; }
  const e = (name && map.get(key(name))) || (opts.minor && ownerOf(map, opts.minor));
  if (!e) return;
  const picks = new Set((opts.picks || []).map(key));
  // Same rule as Learn Eternals: the project default pair shows only once its
  // copy review has cleared.
  const defaults = new Set(e.copyReviewPending ? [] : ((e.recommend && e.recommend.default) || []).map(key));
  const usePicks = picks.size ? picks : defaults;
  const pickLabel = picks.size ? (opts.label || 'picked') : 'default';
  const here = key(opts.minor);
  const roles = Object.entries((e.fit && e.fit.roles) || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => ROLE_LABEL[r] || r);
  const u = e.usage, copy = e.copy;
  const share = (name) => { if (!u) return null; const k = Object.keys(u.minors || {}).find((n) => key(n) === key(name)); return k ? u.minors[k] : null; };
  const why = (name) => { if (!copy) return null; const k = Object.keys(copy.minors || {}).find((n) => key(n) === key(name)); return k ? copy.minors[k] : null; };
  const row = (m) => {
    const on = usePicks.has(key(m.name));
    const sh = share(m.name), w = why(m.name);
    return `<div class="eminor${on ? ' pick' : ''}${key(m.name) === here ? ' here' : ''}"><img src="../img/blessings/${esc(slug(m.name))}.webp" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><b>${esc(m.name)}${on ? `<span class="etag">${esc(pickLabel)}</span>` : ''}${sh ? `<span class="esh" title="share of ranked ${esc(e.name)} games that took ${esc(m.name)} in this slot">${pct(sh.share)} take it</span>` : ''}</b>${esc(clean(m.desc))}${w ? `<span class="ewm">${esc(w)}</span>` : ''}</div></div>`;
  };
  const tags = (u?.mechanics || []).map((m) => `<span title="from ${esc(m.from.join(', '))}">${esc(m.label)}</span>`).join('');
  const pickLine = copy?.why || e.recommend?.note || '';
  const who = u && u.games ? `
      <span class="ek">Who runs it · ranked, this patch</span>
      <div class="ewho"><div class="eroles">${esc(u.roles.filter((r) => r.pickRate >= 0.01).slice(0, 3).map((r) => `${ROLE_LABEL[r.role] || r.role} ${pct(r.pickRate)} of games`).join(' · '))} <span style="color:var(--text-2)">· ${u.games.toLocaleString()} games total</span></div>
      <div class="eheroes">${u.heroes.slice(0, 6).map((h) => `<span title="${esc(h.name)} ${esc(ROLE_LABEL[h.role] || h.role)}: ${esc(e.name)} in ${pct(h.pickRate)} of their ranked games"><img src="../img/heroes/${esc(h.slug)}.webp" alt="" loading="lazy" onerror="this.style.visibility='hidden'">${esc(h.name)} <span style="color:var(--text-2)">${esc((ROLE_LABEL[h.role] || h.role).toLowerCase())} ${pct(h.pickRate)}</span></span>`).join('')}</div>
      ${u.topPair ? `<div style="color:var(--text-2);margin-top:.35rem">Most common pair: <b style="color:var(--text-1)">${esc(u.topPair.minor1)} + ${esc(u.topPair.minor2)}</b> (${pct(u.topPair.share)})</div>` : ''}</div>` : '';
  const back = document.createElement('div');
  back.className = 'epop-back';
  back.innerHTML = `
    <div class="epop" role="dialog" aria-modal="true" aria-label="${esc(e.name)} Eternal">
      <button type="button" class="ex eclose" aria-label="Close">✕</button>
      <div class="ehead">
        <img src="../img/eternals/${esc(e.id || slug(e.name))}.webp" alt="" onerror="this.style.visibility='hidden'">
        <div><b>${esc(e.name)}</b><small>${esc([e.archetype, roles.join(' · ')].filter(Boolean).join(' — '))}</small></div>
      </div>
      ${tags ? `<div class="etags">${tags}</div>` : ''}
      ${pickLine ? `<div class="epick">${esc(pickLine)}</div>` : ''}
      <span class="ek">Major blessing — always on</span>
      <div class="emajor">${esc(clean(e.major))}</div>
      ${who}
      <span class="ek">Minor slot 1 — pick one</span>
      ${(e.minorSlot1 || []).map(row).join('')}
      <span class="ek">Minor slot 2 — pick one</span>
      ${(e.minorSlot2 || []).map(row).join('')}
      ${usePicks.size ? `<p class="enote">${picks.size ? `“${esc(pickLabel)}” marks ${esc(opts.labelNote || 'the minors taken here')}.` : '“Default” marks this project\'s default pair for the Eternal. Open a hero for a pick tuned to that hero and role.'}</p>` : ''}
      ${e.counterTip ? `<div class="ecounter"><b>Playing against it</b>${esc(e.counterTip)}</div>` : ''}
      <div class="efoot"><a href="../learn-eternals.html#et-${esc(e.id || slug(e.name))}">All Eternals</a><button type="button" class="eclose efoot-close">close</button></div>
    </div>`;
  const opener = document.activeElement;
  const dismiss = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (opener && opener.focus) opener.focus(); };
  // Capture phase so Escape closes this popup before an underlying dialog
  // (the coach loadout sheet) sees it.
  const onKey = (ev) => {
    if (ev.key === 'Escape') { ev.stopImmediatePropagation(); dismiss(); }
    if (ev.key === 'Tab') {
      const f = [...back.querySelectorAll('a,button')];
      const i = f.indexOf(document.activeElement);
      ev.preventDefault(); ev.stopImmediatePropagation();
      f[(i + (ev.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  };
  back.onclick = (ev) => { if (ev.target === back || ev.target.classList.contains('eclose')) { ev.stopPropagation(); dismiss(); } };
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  back.querySelector('.ex').focus();
}
const open = (el) => showEternal(el.dataset.epop, {
  minor: el.dataset.epopMinor,
  picks: (el.dataset.epopPicks || '').split('|').filter(Boolean),
  label: el.dataset.epopLabel,
  labelNote: el.dataset.epopNote,
});
document.addEventListener('click', (ev) => {
  const el = ev.target.closest && ev.target.closest('[data-epop]');
  if (el) { ev.preventDefault(); ev.stopPropagation(); open(el); }
}, true);
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const el = ev.target.closest && ev.target.closest('[data-epop]');
  if (el) { ev.preventDefault(); ev.stopPropagation(); open(el); }
});
// Triggers are rendered dynamically; make each focusable + labelled as it appears.
function enhance(root) {
  const els = [];
  if (root.matches && root.matches('[data-epop]')) els.push(root);
  if (root.querySelectorAll) els.push(...root.querySelectorAll('[data-epop]'));
  for (const el of els) {
    if (el.hasAttribute('tabindex')) continue;
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', `${el.dataset.epopMinor || el.dataset.epop || 'Eternal'} — full Eternal details`);
  }
}
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) enhance(n);
}).observe(document.body, { childList: true, subtree: true });
enhance(document);

window.showEternal = showEternal;
})();
