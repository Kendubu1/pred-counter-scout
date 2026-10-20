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
  function icons(lo) {
    const list=choices(lo);
    return list.length ? `<span class="ran-icons" aria-label="Recorded Eternal, minor blessings and hero augment">${list.map(c => `<button type="button" class="ran-icon" data-loadout-kind="${c.kind}" data-loadout-key="${esc(c.key)}" data-loadout-parent="${esc(c.parent || '')}" data-loadout-name="${esc(c.name)}" title="${esc(c.name)} (${c.kind === 'minor' ? 'Minor blessing' : c.kind}) · click for details" aria-label="${esc(c.name)}: recorded ${c.kind}, show details"><img src="../img/${esc(c.image)}.webp" alt="" loading="lazy"></button>`).join('')}</span>` : '';
  }
  function detail(kind, key, parent, eternals, augments) {
    if (kind === 'augment') return augments?.catalog?.[key]?.description || null;
    const all=eternals?.eternals || [];
    if (kind === 'eternal') return all.find(e=>e.name===key)?.major || null;
    // A minor belongs to its recorded Eternal, not an arbitrary matching name.
    const deity=all.find(e=>e.name===parent);
    return [...(deity?.minorSlot1 || []), ...(deity?.minorSlot2 || [])].find(m=>m.name===key)?.desc || null;
  }
  window.CoachLoadouts = Object.freeze({icons, choices, detail});
  let catalog;
  async function descriptions() {
    if (!catalog) catalog=Promise.all(['../../data/game-data/eternals.json','../../data/aggregates/predgg-augments.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Unavailable');return r.json();})).catch(error=>{catalog=null;throw error;});
    return catalog;
  }
  let generation=0, currentClose=null;
  document.addEventListener('click', async ev=>{
    const trigger=ev.target.closest?.('[data-loadout-kind]');
    if (!trigger) return;
    const ticket=++generation;
    let description='Description unavailable in the saved catalog.';
    try { const [eternals, augments]=await descriptions(); description=detail(trigger.dataset.loadoutKind,trigger.dataset.loadoutKey,trigger.dataset.loadoutParent,eternals,augments) || description; } catch {}
    if (ticket!==generation || !trigger.isConnected) return;
    currentClose?.();
    const name=trigger.dataset.loadoutName;
    const back=document.createElement('div');back.className='loadout-back';
    const plain=window.GameText?.plain || (s=>String(s).replace(/<[^>]+>/g,''));
    back.innerHTML=`<section class="loadout-dialog" role="dialog" aria-modal="true" aria-label="${esc(name)}"><div class="loadout-title"><img src="${esc(trigger.querySelector('img').getAttribute('src'))}" alt=""><div><b>${esc(name)}</b><small>Recorded ${esc(trigger.dataset.loadoutKind === 'minor' ? 'minor blessing' : trigger.dataset.loadoutKind)}</small></div></div><p>${esc(plain(description))}</p><button type="button">Close</button></section>`;
    const closeButton=back.querySelector('button');
    const close=()=>{back.remove();document.removeEventListener('keydown',key);currentClose=null;if(trigger.isConnected)trigger.focus();};
    const key=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){e.preventDefault();closeButton.focus();}};
    back.addEventListener('click',e=>{if(e.target===back || e.target===closeButton)close();});
    document.addEventListener('keydown',key);document.body.appendChild(back);currentClose=close;closeButton.focus();
  });
})();
