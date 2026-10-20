// Recorded match choices only. Catalog descriptions are loaded on demand.
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function choices(lo) {
    if (!lo) return [];
    return [
      lo.eternal && {kind:'eternal', name:lo.eternal, key:lo.eternal, image:`eternals/${slug(lo.eternal)}`},
      lo.minor1 && {kind:'minor', name:lo.minor1, key:lo.minor1, parent:lo.eternal, image:`blessings/${slug(lo.minor1)}`},
      lo.minor2 && {kind:'minor', name:lo.minor2, key:lo.minor2, parent:lo.eternal, image:`blessings/${slug(lo.minor2)}`},
      lo.augment?.id != null && {kind:'augment', name:lo.augment.name, key:String(lo.augment.id), image:`augments/${encodeURIComponent(lo.augment.id)}`},
    ].filter(Boolean);
  }
  const players = new Map();
  let nextPlayer = 0;
  function icons(lo, player = {}) {
    const list = choices(lo);
    if (lo?.crest) list.push({name:lo.crest,image:`crests/${lo.crestSlug || slug(lo.crest)}`});
    if (!list.length && !(player.items || []).length && !lo?.crest) return '';
    const id = String(++nextPlayer);
    players.set(id, { ...player, loadout: lo });
    const name = player.squadName || player.name || player.heroName || 'Player';
    return `<button type="button" class="ran-icons" data-loadout-player="${id}" title="View complete loadout and build" aria-label="${esc(name)}: view complete loadout and build">${list.map(c => `<img src="../img/${esc(c.image)}.webp" alt="${esc(c.name)}" loading="lazy">`).join('') || '<span>Build</span>'}</button>`;
  }
  function detail(kind, key, parent, eternals, augments) {
    if (kind === 'augment') return augments?.catalog?.[key]?.description || null;
    const all=eternals?.eternals || [];
    if (kind === 'eternal') return all.find(e=>e.name===key)?.major || null;
    // A minor belongs to its recorded Eternal, not an arbitrary matching name.
    const deity=all.find(e=>e.name===parent);
    return [...(deity?.minorSlot1 || []), ...(deity?.minorSlot2 || [])].find(m=>m.name===key)?.desc || null;
  }
  const clean = text => (window.GameText?.plain || (s=>String(s ?? '').replace(/<[^>]+>/g,'')))(text);
  function renderDetails(player, eternals, augments, itemCatalog) {
    const lo = player.loadout;
    const perks = choices(lo);
    const catalogItems = Array.isArray(itemCatalog) ? itemCatalog : itemCatalog?.items || [];
    const items = (player.items || []).map(i => ({ ...i, category: 'Item' }));
    if (lo?.crest) items.unshift({ name:lo.crest, slug:lo.crestSlug || slug(lo.crest), category:'Crest' });
    return `<h3>Eternal, minors &amp; augment</h3>${perks.length ? perks.map(c => `<div class="loadout-entry"><img src="../img/${esc(c.image)}.webp" alt=""><div><b>${esc(c.name)}</b><small>${c.kind === 'minor' ? 'Minor blessing' : c.kind === 'augment' ? 'Hero augment' : 'Eternal'}</small><p>${esc(clean(detail(c.kind,c.key,c.parent,eternals,augments) || 'Description unavailable in the saved catalog.'))}</p></div></div>`).join('') : '<p>No perks recorded for this match.</p>'}
      <h3>Build</h3><p class="loadout-note">Recorded end-of-match inventory, not purchase order.</p>${items.length ? items.map(i => {
        const it = catalogItems.find(x=>x.slug===i.slug);
        const stats = Object.entries(it?.stats || {}).filter(([,v])=>v).map(([k,v])=>`${String(k).replace(/_/g,' ')}: ${v}`).join(' · ');
        const effects=(it?.effects || []).filter(e=>e.name && (e.menu_description || e.game_description)).map(e=>`<p><b>${esc(e.name)}${e.cooldown ? ` · ${esc(e.cooldown)} cooldown` : ''}</b>${e.condition ? ` ${esc(clean(e.condition))}` : ''} ${esc(clean(e.menu_description || e.game_description))}</p>`).join('');
        return `<div class="loadout-entry"><img src="../img/${i.category === 'Crest' ? 'crests' : 'items'}/${esc(i.slug)}.webp" alt=""><div><b>${esc(i.name || it?.display_name || i.slug)}</b><small>${i.category}</small>${stats ? `<p class="loadout-note">${esc(stats)}</p>` : ''}${effects}</div></div>`;
      }).join('') : '<p>No build recorded for this match.</p>'}`;
  }
  window.CoachLoadouts = Object.freeze({icons, choices, detail, renderDetails});
  let catalog;
  async function descriptions() {
    if (!catalog) catalog=Promise.all(['../../data/game-data/eternals.json','../../data/aggregates/predgg-augments.json','../../data/catalog/items.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Unavailable');return r.json();})).catch(error=>{catalog=null;throw error;});
    return catalog;
  }
  let generation=0, currentClose=null;
  document.addEventListener('click', async ev=>{
    const trigger=ev.target.closest?.('[data-loadout-player]');
    if (!trigger) return;
    const player=players.get(trigger.dataset.loadoutPlayer);
    if (!player) return;
    const ticket=++generation;
    let catalogs=[];
    try { catalogs=await descriptions(); } catch {}
    if (ticket!==generation || !trigger.isConnected) return;
    currentClose?.();
    const name=player.squadName || player.name || player.heroName || 'Player';
    const back=document.createElement('div');back.className='loadout-back';
    back.innerHTML=`<section class="loadout-dialog" role="dialog" aria-modal="true" aria-label="${esc(name)} loadout"><header class="loadout-header"><div><b>${esc(name)}</b><small>${esc(player.heroName || '')} ${esc(player.role || '')}</small></div><button type="button" aria-label="Close loadout">Close</button></header><div class="loadout-content" tabindex="0" aria-label="Loadout and build details">${renderDetails(player,...catalogs)}</div></section>`;
    const closeButton=back.querySelector('button');
    const close=()=>{back.remove();document.removeEventListener('keydown',key);currentClose=null;if(trigger.isConnected)trigger.focus();};
    const key=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const controls=[closeButton,back.querySelector('.loadout-content')];const first=controls[0],last=controls[1];if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}}};
    back.addEventListener('click',e=>{if(e.target===back || e.target===closeButton)close();});
    document.addEventListener('keydown',key);document.body.appendChild(back);currentClose=close;closeButton.focus();
  });
})();
