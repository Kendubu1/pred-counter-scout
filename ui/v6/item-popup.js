// Item detail popup, shared by the build page (index.html) and the coach page
// (coach.html): any element with data-ipop="<item-slug>" opens the item's
// price, stats, effect text, the verified "why" line and the simulator's
// known limits. Click, tap, or Enter/Space on a focused trigger. Zero-API:
// reads the committed catalog and aggregates. Needs game-text.js loaded first.
(() => {
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const getJson = async (path) => (await fetch(path)).json();
const style = document.createElement('style');
style.textContent = `
  .ipop-back { position:fixed; inset:0; background:rgba(5,5,10,.6); backdrop-filter:blur(3px); z-index:50; display:flex; align-items:center; justify-content:center; padding:1.2rem; }
  .ipop { background:var(--bg-1); border:1px solid var(--border); border-radius:16px; max-width:380px; width:100%; max-height:80vh; overflow-y:auto; padding:1rem 1.1rem; box-shadow:0 18px 50px rgba(0,0,0,.6); }
  .ipop .ihead { display:flex; gap:.7rem; align-items:center; }
  .ipop .ihead img { width:52px; height:52px; border-radius:10px; object-fit:cover; background:var(--bg-2); border:1px solid var(--border); }
  .ipop .ihead b { font-size:1.05rem; }
  .ipop .iprice { color:var(--gold); font-size:.8rem; font-weight:700; }
  .ipop .istats { display:grid; grid-template-columns:1fr auto; gap:.15rem .8rem; margin-top:.7rem; font-size:.8rem; color:var(--text-1); }
  .ipop .istats .v { text-align:right; font-variant-numeric:tabular-nums; color:var(--text-0); font-weight:600; }
  .ipop .ifx { margin-top:.7rem; border-top:1px dashed var(--border); padding-top:.6rem; font-size:.76rem; color:var(--text-1); line-height:1.5; }
  .ipop .ifx b { color:var(--gold); }
  .ipop .iclose { margin-top:.8rem; width:100%; background:var(--bg-2); border:1px solid var(--border); border-radius:10px; color:var(--text-1); padding:.4rem; font-size:.8rem; }
  [data-ipop] { cursor:pointer; }
`;
document.head.appendChild(style);

// ── item info popup: tap any item icon for the v2-style quick view ──
let ITEMS_RAW = null, ITEM_WHY = null, ITEM_MODEL = null;
const STAT_LABELS = { physical_power: 'Physical Power', magical_power: 'Magical Power', attack_speed: 'Attack Speed %', critical_chance: 'Crit Chance %', physical_penetration: 'Physical Pen', magical_penetration: 'Magical Pen', ability_haste: 'Ability Haste', health: 'Health', max_health: 'Health', magical_lifesteal: 'Magical Lifesteal %', physical_armor: 'Physical Armor', magical_armor: 'Magical Armor', max_mana: 'Mana', lifesteal: 'Lifesteal %', omnivamp: 'Omnivamp %', heal_shield_increase: 'Heal & Shield Power %', gold_per_second: 'Gold / sec', tenacity: 'Tenacity', movement_speed: 'Move Speed', health_regeneration: 'Health Regen', mana_regeneration: 'Mana Regen' };
async function showItem(slug) {
  if (!ITEMS_RAW) {
    const [raw, why, model] = await Promise.all([
      getJson('../../data/catalog/items.json').catch(() => null),
      getJson('../../data/aggregates/item-reviews.json').catch(() => null),
      getJson('../../data/aggregates/catalog-model-audit.json').catch(() => null),
    ]);
    ITEMS_RAW = new Map((Array.isArray(raw) ? raw : raw?.items ?? []).map((i) => [i.slug, i]));
    ITEM_WHY = why?.items ?? {};
    ITEM_MODEL = new Map((model?.items ?? []).map(i => [i.slug, i]));
  }
  const it = ITEMS_RAW.get(slug);
  if (!it) return;
  const limitations = ITEM_MODEL?.get(slug)?.limitations ?? [];
  const clean = GameText.plain;
  const stats = Object.entries(it.stats || {}).filter(([k, v]) => v && STAT_LABELS[k]);
  const back = document.createElement('div');
  back.className = 'ipop-back';
  back.innerHTML = `
    <div class="ipop" role="dialog" aria-modal="true" aria-label="${esc(it.display_name)}">
      <div class="ihead">
        <img src="../img/items/${esc(slug)}.webp" alt="" onerror="this.style.visibility='hidden'">
        <div><b>${esc(it.display_name)}</b>
          <div class="iprice">${it.total_price ? `${it.total_price.toLocaleString()} gold` : 'crest — free at game start'}</div>
        </div>
      </div>
      ${stats.length ? `<div class="istats">${stats.map(([k, v]) => `<span>${STAT_LABELS[k]}</span><span class="v">+${v}</span>`).join('')}</div>` : ''}
      ${(it.effects || []).filter((e) => GameText.hasEffectDescription(e)).map((e) => `
        <div class="ifx"><b>${esc(e.name || 'Effect')}${e.cooldown ? ` · ${esc(String(e.cooldown))} cooldown` : ''}</b>${e.condition ? `<div class="icondition">${esc(clean(e.condition))}</div>` : '<br>'}${esc(clean(e.menu_description || e.game_description))}</div>`).join('')}
      ${ITEM_WHY[slug] ? `<div class="ifx" style="color:var(--text-0)">${esc(ITEM_WHY[slug])}<div style="font-size:.6875rem;color:var(--text-2);margin-top:.25rem">AI-written from this item's stats and effects only; numbers machine-verified</div></div>` : ''}
      ${limitations.length ? `<details class="ifx"><summary>What the simulator does not fully count</summary>${limitations.map(note => `<p>${esc(note)}</p>`).join('')}</details>` : ''}
      <button class="iclose">close</button>
    </div>`;
  const opener = document.activeElement;            // restore focus here on close
  const dismiss = () => { back.remove(); document.removeEventListener('keydown', onKey); if (opener && opener.focus) opener.focus(); };
  const onKey = (ev) => { if (ev.key === 'Escape') dismiss(); };
  back.onclick = (ev) => { if (ev.target === back || ev.target.classList.contains('iclose')) dismiss(); };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  // Move focus into the dialog and keep it there (single control); Esc/close
  // restore focus to the trigger. Makes the "numbers one tap away" popup usable
  // by keyboard, not just mouse/touch.
  const closeBtn = back.querySelector('.iclose');
  back.addEventListener('keydown', (ev) => { if (ev.key === 'Tab') { ev.preventDefault(); closeBtn && closeBtn.focus(); } });
  if (closeBtn) closeBtn.focus();
}
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-ipop]');
  if (el) { ev.preventDefault(); showItem(el.dataset.ipop); }
});

// Keyboard activation: Enter/Space on a focused item trigger opens its details.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const el = ev.target.closest && ev.target.closest('[data-ipop]');
  if (el) { ev.preventDefault(); showItem(el.dataset.ipop); }
});
// Item triggers are rendered dynamically all over the hero view; make each one
// focusable + screen-reader labelled as it appears (was click-only, mouse-only).
function enhanceIpop(root) {
  const els = [];
  if (root.matches && root.matches('[data-ipop]')) els.push(root);
  if (root.querySelectorAll) els.push(...root.querySelectorAll('[data-ipop]'));
  for (const el of els) {
    if (el.hasAttribute('tabindex')) continue;
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', `${el.getAttribute('title') || 'item'} — details`);
  }
}
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) enhanceIpop(n);
}).observe(document.body, { childList: true, subtree: true });
enhanceIpop(document);

window.showItem = showItem;
})();
