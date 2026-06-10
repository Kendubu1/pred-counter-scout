// Predecessor Scout V7 — editorial identity, answer-first density.
//
// Architecture decisions (vs v2):
// - The hero grid IS the landing page: 2 taps from open to any answer.
// - Three tabs (Build / Matchups / Learn) instead of seven.
// - One enemy state, shared by everything, reflected in the URL hash.
// - Verdict-first matchup view: the conclusion in a banner, evidence below.
// - Zero inline styles: all rendering goes through design.css classes.
// - Data cached per data-version (manifest.latest), not per page load.

(() => {
'use strict';

const DATA = '../data';
const DAY = new Date().toISOString().slice(0, 10); // manifest cache key, refreshes daily

// ── State ──
const S = {
  dataV: null,
  profiles: {},        // slug → curated profile (+ merged playstyle)
  heroList: [],        // [{slug, name}] sorted
  nameToSlug: {},
  patch: { patch: null, heroes: {} },
  heroCache: {},       // slug → scraped data
  slug: null, hero: null, role: null, tab: 'build', enemy: '',
  gridRole: 'all', search: '',
  draft: { your: Array(5).fill(null), enemy: Array(5).fill(null), target: null },
};

// ── Tiny helpers ──
const $ = id => document.getElementById(id);
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
const pw = v => parseFloat(String(v)) || 0;
const pm = v => { const m = String(v ?? '').match(/(\d+)/); return m ? parseInt(m[1]) : 0; };
const adjWR = (wr, m) => (typeof MatchupEngine !== 'undefined') ? MatchupEngine.adjustedWinRate(wr, m) : wr;
const wrCls = n => n >= 52 ? 'wr-up' : n <= 48 ? 'wr-down' : 'wr-mid';
const name = slug => S.profiles[slug]?.name || slug;
const heroImg = (slug, cls) => `<img class="${cls || ''}" src="img/heroes/${esc(slug)}.webp" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
const itemIco = (n, lg) => `<img class="item-ico${lg ? ' lg' : ''}" src="img/items/${itemSlug(n)}.webp" alt="${esc(n)}" title="${esc(n)}" loading="lazy" onerror="this.style.visibility='hidden'">`;
const crestIco = n => `<img class="item-ico crest-ico" src="img/crests/${itemSlug(n)}.webp" alt="${esc(n)}" title="${esc(n)}" loading="lazy" onerror="this.style.visibility='hidden'">`;
const itemStrip = items => `<span class="item-strip">${(items || []).map((n, i) => (i ? '<span class="item-arrow">›</span>' : '') + itemIco(n)).join('')}</span>`;

function slugFromName(n) {
  return S.nameToSlug[String(n || '').toLowerCase()] || null;
}

function kitOf(slug) { return (typeof KitEngine !== 'undefined' && KitEngine.isReady()) ? KitEngine.getProfile(slug) : null; }

// E/M/L phase-edge chips: a vs b (kit-only)
function phaseChips(a, b) {
  const ka = kitOf(a), kb = kitOf(b);
  if (!ka || !kb) return '';
  const c = [['E', 'early'], ['M', 'mid'], ['L', 'late']].map(([l, ph]) => {
    const d = ka.phases[ph] - kb.phases[ph];
    const cls = d > 7 ? 'win' : d < -7 ? 'lose' : '';
    return `<span class="pchip ${cls}" title="${ph}: ${ka.phases[ph]} vs ${kb.phases[ph]}">${l}</span>`;
  }).join('');
  return `<span class="phase-chips">${c}</span>`;
}

function trendChip(slug) {
  const st = S.patch.heroes?.[slug];
  if (!st || !['buff', 'nerf', 'mixed'].includes(st.trend)) return '';
  const cls = st.trend === 'buff' ? 'up' : st.trend === 'nerf' ? 'down' : 'gold';
  const ico = st.trend === 'buff' ? '▲' : st.trend === 'nerf' ? '▼' : '◆';
  return `<span class="chip ${cls}" title="${esc((st.changes || []).join(' · '))}">${ico} ${esc(S.patch.patch || '')}</span>`;
}

function expander(title, bodyHtml, sub) {
  return `<div class="exp"><button class="exp-head"><span class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}</span><span class="caret">›</span></button><div class="exp-body">${bodyHtml}</div></div>`;
}

// ── Data ──
async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.json(); }
async function loadHero(slug) {
  if (S.heroCache[slug]) return S.heroCache[slug];
  const d = await getJSON(`${DATA}/${S.dataV}/${slug}.json?v=${S.dataV}`);
  S.heroCache[slug] = d;
  return d;
}
function roleData(hero, role) {
  if (!hero?.roles) return null;
  return hero.roles[role] || hero.roles[hero.activeRoles?.[0]] || Object.values(hero.roles)[0] || null;
}

// ── Router: #h/<slug>/<role>/<tab>/<enemy> | #draft | '' ──
function setHash() {
  const h = S.slug ? `#h/${S.slug}/${S.role || ''}/${S.tab}/${S.enemy || ''}` : (S.view === 'draft' ? '#draft' : '');
  if (location.hash !== h) history.replaceState(null, '', h || location.pathname);
}
function route() {
  const h = location.hash;
  if (h.startsWith('#h/')) {
    const [, slug, role, tab, enemy] = h.split('/');
    openHero(slug, { role: role || null, tab: tab || 'build', enemy: enemy || '', fromRoute: true });
  } else if (h === '#draft') {
    show('draft');
  } else {
    show('grid');
  }
}
function show(view) {
  S.view = view;
  if (view !== 'hero') S.slug = null;
  $('viewGrid').classList.toggle('hidden', view !== 'grid');
  $('viewHero').classList.toggle('hidden', view !== 'hero');
  $('viewDraft').classList.toggle('hidden', view !== 'draft');
  if (view === 'grid') renderGrid();
  if (view === 'draft') renderDraft();
  setHash();
}

// ── Landing: movers + grid ──
function renderMovers() {
  const heroes = S.patch.heroes || {};
  const entries = Object.entries(heroes).filter(([, v]) => ['buff', 'nerf'].includes(v.trend));
  entries.sort((a, b) => (a[1].trend === 'buff' ? 0 : 1) - (b[1].trend === 'buff' ? 0 : 1));
  $('movers').innerHTML = entries.slice(0, 10).map(([slug, v]) =>
    `<button class="mover" data-hero="${esc(slug)}">${heroImg(slug)}<span class="nm">${esc(name(slug))}</span><span class="tr ${v.trend}">${v.trend === 'buff' ? '▲' : '▼'}</span></button>`
  ).join('');
}
function renderGrid() {
  const q = S.search.toLowerCase();
  const tiles = S.heroList.filter(h => {
    if (q && !h.name.toLowerCase().includes(q)) return false;
    if (S.gridRole !== 'all') {
      const roles = (S.profiles[h.slug]?.roles || []).map(r => String(r).toLowerCase());
      const map = { offlane: 'offlane', jungle: 'jungle', midlane: 'midlane', carry: 'carry', support: 'support' };
      if (!roles.includes(map[S.gridRole])) return false;
    }
    return true;
  });
  $('heroGrid').innerHTML = tiles.map(h =>
    `<button class="hero-tile" data-hero="${esc(h.slug)}">${heroImg(h.slug)}<div class="nm">${esc(h.name)}</div></button>`
  ).join('') || '<div class="empty">No heroes match.</div>';
}

// ── Hero view ──
async function openHero(slug, opts = {}) {
  if (!S.profiles[slug]) { show('grid'); return; }
  S.slug = slug;
  S.tab = opts.tab || 'build';
  S.enemy = opts.enemy || '';
  S.view = 'hero';
  $('viewGrid').classList.add('hidden');
  $('viewDraft').classList.add('hidden');
  $('viewHero').classList.remove('hidden');
  $('heroHead').innerHTML = '<div class="empty">Loading…</div>';
  try { S.hero = await loadHero(slug); } catch { S.hero = null; }
  const active = S.hero?.activeRoles || [];
  S.role = (opts.role && active.includes(opts.role)) ? opts.role : (active[0] || null);
  renderHeroHead();
  renderKitStrip();
  renderTab();
  setHash();
  if (!opts.fromRoute) window.scrollTo(0, 0);
}

function renderHeroHead() {
  const p = S.profiles[S.slug];
  const active = S.hero?.activeRoles || [];
  const roleSel = active.length > 1
    ? `<select class="role-select" id="roleSelect">${active.map(r => `<option value="${r}"${r === S.role ? ' selected' : ''}>${r}</option>`).join('')}</select>`
    : `<span class="chip">${esc(S.role || '—')}</span>`;
  $('heroHead').innerHTML =
    heroImg(S.slug, 'portrait') +
    `<div><div class="hh-name">${esc(p.name)}</div>
      <div class="hh-sub">${(p.classes || []).map(c => `<span class="chip">${esc(c)}</span>`).join('')}${trendChip(S.slug)}${roleSel}</div>
    </div>`;
  const sel = $('roleSelect');
  if (sel) sel.onchange = () => { S.role = sel.value; renderKitStrip(); renderTab(); setHash(); };
}

function renderKitStrip() {
  const kit = kitOf(S.slug);
  if (!kit) { $('kitStrip').innerHTML = ''; return; }
  const curve = `<span class="kit-curve">${['early', 'mid', 'late'].map(ph =>
    `<span class="kc" title="${ph}: ${kit.phases[ph]}"><i style="height:${kit.phases[ph]}%"></i><span>${ph[0].toUpperCase()}</span></span>`
  ).join('')}</span>`;
  const tags = `<span class="chip-strip">${kit.playstyle.map(t => {
    const [head, ...rest] = KitEngine.playstyleLabel(t).split(' — ');
    return `<span class="chip gold" title="${esc(rest.join(' — '))}">${esc(head)}</span>`;
  }).join('')}</span>`;
  const rd = roleData(S.hero, S.role);
  const spike = rd ? KitEngine.skillSpike(rd) : null;
  const spikeHtml = spike ? `<span class="kit-spike">maxes <b>${esc(spike.ability)}</b>${spike.maxedAt ? ` · spike lv ${Math.max(1, spike.maxedAt - 4)}–${spike.maxedAt}` : ''}</span>` : '';
  $('kitStrip').innerHTML = tags + curve + spikeHtml;
}

function renderTab() {
  document.querySelectorAll('#heroTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === S.tab));
  ['build', 'matchups', 'learn'].forEach(t => $('tab-' + t).classList.toggle('hidden', t !== S.tab));
  if (S.tab === 'build') renderBuildTab();
  if (S.tab === 'matchups') renderMatchupsTab();
  if (S.tab === 'learn') renderLearnTab();
}

// ── Build tab ──
function renderBuildTab() {
  const el = $('tab-build');
  const rd = roleData(S.hero, S.role);
  const p = S.profiles[S.slug];
  if (!rd) { el.innerHTML = '<div class="empty">No data for this role.</div>'; return; }
  let h = '';

  // Builds — sorted by confidence-adjusted WR, slot options in the expander
  const builds = [...(rd.buildTabs || [])].sort((a, b) => adjWR(pw(b.winRate), pm(b.matches)) - adjWR(pw(a.winRate), pm(a.matches)));
  h += `<div class="h-section">Builds <span class="h-note">sorted by confidence-adjusted WR</span></div>`;
  if (!builds.length) h += '<div class="empty">No build data.</div>';
  builds.slice(0, 3).forEach(b => {
    const wr = pw(b.winRate), m = pm(b.matches);
    const slots = rd.itemSlots ? ['4th', '5th', '6th'].map(k => {
      const opts = (rd.itemSlots[k] || []).slice(0, 4);
      if (!opts.length) return '';
      return `<div class="row"><span class="bar-label">${k}</span><span class="item-strip">${opts.map(o =>
        `${itemIco(o.name)}<span class="xs num ${wrCls(pw(o.winRate))}">${pw(o.winRate).toFixed(0)}</span>`).join('')}</span></div>`;
    }).join('') : '<div class="empty">No slot data.</div>';
    h += expander(
      `${esc(b.name || 'Build')} ${itemStrip(b.items)}`,
      slots,
      `<span class="num ${wrCls(wr)}">${wr.toFixed(1)}%</span> · ${m} games · tap for 4th–6th item options`
    );
  });

  // Crest + augments — one compact block each
  const crests = [...(rd.crests || [])].sort((a, b) => adjWR(pw(b.winRate), pm(b.matches)) - adjWR(pw(a.winRate), pm(a.matches)));
  if (crests.length) {
    h += `<div class="h-section">Crests</div>`;
    crests.slice(0, 3).forEach(c => {
      h += `<div class="row">${crestIco(c.name)}<span class="row-main"><span class="row-title">${esc(c.name)}</span></span><span class="row-end num ${wrCls(pw(c.winRate))}">${pw(c.winRate).toFixed(1)}% <span class="dim2 xs">${pm(c.matches)}g</span></span></div>`;
    });
  }
  const augs = [...(rd.augments || [])].sort((a, b) => adjWR(pw(b.winRate), pm(b.matches)) - adjWR(pw(a.winRate), pm(a.matches)));
  if (augs.length) {
    h += `<div class="h-section">Augments</div>`;
    augs.slice(0, 3).forEach(a => {
      const pa = (p.augments || []).find(x => x.name.trim().toLowerCase() === (a.name || '').trim().toLowerCase());
      const shift = pa?.playstyleShift ? `<span class="chip gold">+${esc(pa.playstyleShift)}</span>` : '';
      const desc = pa?.description ? esc(pa.description.replace(/<[^>]+>/g, '').slice(0, 160)) : '';
      h += expander(
        `${esc((a.name || '').trim())} ${shift}`,
        desc || 'No description.',
        `<span class="num ${wrCls(pw(a.winRate))}">${pw(a.winRate).toFixed(1)}%</span> · ${pm(a.matches)} games`
      );
    });
  }

  // Eternals — playstyle-aware top 3
  if (typeof EternalsEngine !== 'undefined' && EternalsEngine.isReady()) {
    const res = EternalsEngine.recommend(p, S.role);
    if (res.ranked?.length) {
      h += `<div class="h-section">Eternals <span class="h-note">kit fit — no WR data exists yet</span></div>`;
      res.ranked.slice(0, 3).forEach(e => {
        const why = (e.reasons || []).map(r => esc(r.text)).join(' · ');
        const body = `${esc(e.major || '')}${e.recommend?.default ? `<div class="row-sub">minors: ${esc(e.recommend.default.join(' + '))}</div>` : ''}${e.recommend?.note ? `<div class="row-sub">${esc(e.recommend.note)}</div>` : ''}`;
        h += expander(
          `${esc(e.name)} <span class="chip${e.tier === 'best' ? ' gold' : ''}">${esc(e.tier)}</span>`,
          body,
          why || esc(e.archetype || '')
        );
      });
    }
  }

  // Attributes — one mono line
  const a = p.attributes || {};
  h += `<div class="h-section">Attributes</div><div class="attr-line">${['attackPower', 'abilityPower', 'durability', 'mobility'].map(k =>
    `<span><b>${a[k] ?? '—'}</b>${k.replace(/([A-Z])/g, ' $1')}</span>`).join('')}</div>`;

  el.innerHTML = h;
}

// ── Matchups tab ──
function renderMatchupsTab() {
  const el = $('tab-matchups');
  const rd = roleData(S.hero, S.role);
  let h = `<div class="enemy-bar"><select id="enemySel"><option value="">vs — pick the enemy laner…</option>${S.heroList.filter(x => x.slug !== S.slug).map(x =>
    `<option value="${esc(x.slug)}"${x.slug === S.enemy ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`;
  h += `<div id="matchupResult">${S.enemy ? '<div class="empty">Analyzing…</div>' : ''}</div>`;

  // Counter lists — always visible, one tap sets the enemy
  const counters = (rd?.counters || []).filter(c => (c.matches || 0) >= 20);
  const rows = counters.map(c => ({ ...c, slug: slugFromName(c.hero), adj: adjWR(c.winRate, c.matches) })).filter(c => c.slug);
  const beats = rows.filter(c => c.winRate < 50).sort((a, b) => a.adj - b.adj);
  const wins = rows.filter(c => c.winRate >= 50).sort((a, b) => b.adj - a.adj);
  const rowHtml = c =>
    `<div class="row tappable" data-enemy="${esc(c.slug)}">${heroImg(c.slug, 'item-ico lg')}<span class="row-main"><span class="row-title">${esc(name(c.slug))} ${phaseChips(S.slug, c.slug)}</span></span><span class="row-end num ${wrCls(c.winRate)}">${c.winRate.toFixed(1)}% <span class="dim2 xs">${c.matches}g</span></span></div>`;
  h += `<div class="h-section">Threats — they beat ${esc(name(S.slug))} <span class="h-note">your WR · 20+ games</span></div>`;
  h += beats.length ? beats.map(rowHtml).join('') : '<div class="empty">No data.</div>';
  h += `<div class="h-section">Prey — ${esc(name(S.slug))} beats them</div>`;
  h += wins.length ? wins.map(rowHtml).join('') : '<div class="empty">No data.</div>';
  el.innerHTML = h;

  $('enemySel').onchange = () => { S.enemy = $('enemySel').value; setHash(); renderMatchupAnalysis(); };
  if (S.enemy) renderMatchupAnalysis();
}

async function renderMatchupAnalysis() {
  const box = $('matchupResult');
  if (!S.enemy) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="empty">Analyzing…</div>';
  let enemyData = null;
  try { enemyData = await loadHero(S.enemy); } catch {}
  const map = { [S.slug]: S.hero, [S.enemy]: enemyData };
  const r = MatchupEngine.counterBuildPath(S.slug, S.role, S.enemy, map);
  if (r.error) { box.innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }

  // ── Verdict first ──
  let cls = 'even', word = 'EVEN', meta = '', conf = '';
  const cd = r.counterData || {};
  let yourWR = null;
  if (cd.yourVsEnemy) { yourWR = cd.yourVsEnemy.winRate; meta = `${yourWR.toFixed(1)}% WR · ${cd.yourVsEnemy.matches} games · ${esc(S.role)}`; }
  else if (cd.enemyVsYou) { yourWR = 100 - cd.enemyVsYou.enemyWinRate; meta = `≈${yourWR.toFixed(1)}% WR (inverted) · ${cd.enemyVsYou.matches} games`; }
  else if (cd.kitForecast) { yourWR = cd.kitForecast.predictedWR; meta = `kit forecast ~${yourWR}%`; conf = ' · low confidence — no observed games'; }
  if (yourWR !== null) { cls = yourWR >= 52 ? 'win' : yourWR <= 48 ? 'lose' : 'even'; word = cls === 'win' ? 'FAVORED' : cls === 'lose' ? 'UPHILL' : 'EVEN'; }
  const plan = r.phaseComparison?.gameplan?.[0] || '';
  let h = `<div class="verdict ${cls}"><div class="verdict-word">${word}</div>${plan ? `<div class="verdict-line">${esc(plan)}</div>` : ''}<div class="verdict-meta">${meta}${conf}${r.roleInfo?.isRoleMismatch ? ` · showing ${esc(r.roleInfo.fallbackRole)} data` : ''}</div></div>`;

  // ── Power curve ──
  if (r.phaseComparison) {
    h += `<div class="h-section">Power Curve <span class="h-note">kit + build derived</span></div><div class="bar-grid">`;
    r.phaseComparison.phases.forEach(ph => {
      const pct = Math.round((ph.you / (ph.you + ph.enemy)) * 100);
      const cls2 = ph.verdict === 'you' ? 'wr-up' : ph.verdict === 'enemy' ? 'wr-down' : 'wr-mid';
      h += `<span class="bar-label">${esc(ph.phase)}</span>`;
      h += `<span class="split-track"><span class="split-you" style="width:${pct}%"></span><span class="split-mark"></span></span>`;
      h += `<span class="bar-val ${cls2}">${ph.you}–${ph.enemy}</span>`;
    });
    h += '</div>';
  }

  // ── Builds ──
  h += `<div class="h-section">Your Builds vs ${esc(name(S.enemy))}</div>`;
  if (r.counterBuild) {
    h += expander(
      `<span class="chip solid">Counter</span> ${itemStrip(r.counterBuild.items)}`,
      (r.counterBuild.path || []).map(x => `<div>${esc(x.item)} — ${esc(x.reasons.join(', '))}</div>`).join('') +
      (r.counterBuild.augment?.recommended ? `<div class="row-sub">augment: ${esc(r.counterBuild.augment.recommended.name)} — ${esc(r.counterBuild.augment.recommended.reason)}</div>` : ''),
      `crest: ${esc(r.counterBuild.crest)} · tap for the why`
    );
  }
  if (r.aggressiveBuild) {
    h += `<div class="row"><span class="chip">Aggro</span><span class="row-main">${itemStrip(r.aggressiveBuild.items)}</span><span class="row-end num ${wrCls(pw(r.aggressiveBuild.winRate))}">${esc(r.aggressiveBuild.winRate)} <span class="dim2 xs">${r.aggressiveBuild.matches}g</span></span></div>`;
  }
  if (r.metaDiff && !r.metaDiff.identical && r.metaDiff.swaps?.length) {
    h += r.metaDiff.swaps.map(sw => `<div class="row"><span class="row-main row-sub">swap ${itemIco(sw.removed)} → ${itemIco(sw.added)} <span class="dim">${esc(sw.reason)}</span></span></div>`).join('');
  }
  if (r.vsEnemy?.metaBuild) {
    h += `<div class="h-section">Their Likely Build</div><div class="row">${itemStrip(r.vsEnemy.metaBuild.items)}<span class="row-end num ${wrCls(pw(r.vsEnemy.metaBuild.winRate))}">${esc(r.vsEnemy.metaBuild.winRate)}</span></div>`;
  }

  // ── Evidence, collapsed ──
  const intel = [];
  (r.enemyAugmentWarnings || []).forEach(w => intel.push(`Likely augment: ${w.name} (${w.winRate})`));
  (r.enemyBuildAnalysis?.threats || []).forEach(t => intel.push(`Threat: ${t}`));
  (r.enemyBuildAnalysis?.weaknesses || []).forEach(w => intel.push(`Exploit: ${w.replace(/_/g, ' ')}`));
  const tips = (r.tips || []).concat((r.phaseComparison?.gameplan || []).slice(1));
  if (tips.length) h += expander(`Matchup tips <span class="chip">${tips.length}</span>`, tips.map(t => `<div>${esc(t)}</div>`).join(''));
  if (intel.length) h += expander(`Enemy intel <span class="chip">${intel.length}</span>`, intel.map(t => `<div>${esc(t)}</div>`).join(''));

  box.innerHTML = h;
}

// ── Learn tab ──
function renderLearnTab() {
  const el = $('tab-learn');
  const p = S.profiles[S.slug];
  const rd = roleData(S.hero, S.role);
  const kitAbilities = (typeof KitEngine !== 'undefined' && KitEngine.isReady()) ? KitEngine.getAbilities(S.slug) : null;
  let h = '';

  h += `<div class="h-section">Abilities</div>`;
  const KEY_ORDER = ['PASSIVE', 'BASIC', 'ALTERNATE', 'PRIMARY', 'SECONDARY', 'ULTIMATE'];
  const abilities = [...(p.abilities || [])].sort((a, b) => KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key));
  abilities.forEach(ab => {
    const ka = (kitAbilities || []).find(x => x.key === ab.key);
    const cd = ka?.cooldowns?.length ? `<span class="num dim xs">${ka.cooldowns[0]}–${ka.cooldowns[ka.cooldowns.length - 1]}s</span>` : '';
    const body = ka?.description ? esc(ka.description.replace(/\n+/g, ' ')) : esc(ab.summary || '');
    h += expander(
      `<span class="chip">${esc(ab.key)}</span> ${esc(ab.name)} ${cd}`,
      body,
      esc(ab.summary || '')
    );
  });

  if (rd?.skillOrder?.length) {
    h += `<div class="h-section">Skill Order <span class="h-note">${esc(S.role || '')} · from real matches</span></div>`;
    if (rd.skillPriority?.length) {
      h += `<div class="row"><span class="row-main chip-strip">${rd.skillPriority.map((s2, i) => `${i ? '<span class="item-arrow">›</span>' : ''}<span class="chip${i === 0 ? ' gold' : ''}">${esc(s2)}</span>`).join('')}</span></div>`;
    }
    rd.skillOrder.forEach(sk => {
      h += `<div class="row"><span class="row-main row-title small">${esc(sk.name)}</span><span class="row-end num dim xs">lv ${(sk.levels || []).join(' ')}</span></div>`;
    });
  }

  const st = S.patch.heroes?.[S.slug];
  if (st?.analysis) {
    h += `<div class="h-section">Patch ${esc(st.patch || S.patch.patch || '')}</div>`;
    h += `<div class="note ${st.trend === 'buff' ? 'gold' : ''}">${esc(st.analysis.summary || '')}</div>`;
    if (st.analysis.playing) h += `<div class="note">Playing: ${esc(st.analysis.playing)}</div>`;
    if (st.analysis.facing) h += `<div class="note">Facing: ${esc(st.analysis.facing)}</div>`;
  }

  el.innerHTML = h;
}

// ── Draft ──
function renderDraft() {
  const slot = (team, i) => {
    const slug = S.draft[team][i];
    return slug
      ? `<button class="dslot filled" data-team="${team}" data-i="${i}">${heroImg(slug)}<span class="nm">${esc(name(slug))}</span><span class="x">✕</span></button>`
      : `<button class="dslot" data-team="${team}" data-i="${i}"><span class="plus">+</span><span class="nm dim">pick ${i + 1}</span></button>`;
  };
  $('draftYour').innerHTML = [0, 1, 2, 3, 4].map(i => slot('your', i)).join('');
  $('draftEnemy').innerHTML = [0, 1, 2, 3, 4].map(i => slot('enemy', i)).join('');
  renderDraftAnalysis();
  renderDraftSuggestions();
}

function renderDraftAnalysis() {
  const el = $('draftAnalysis');
  const yours = S.draft.your.filter(Boolean), enemies = S.draft.enemy.filter(Boolean);
  if (yours.length < 2) { el.innerHTML = ''; return; }
  let h = '';
  // Damage split — one line
  let phys = 0, mag = 0;
  yours.forEach(s2 => { const d = S.profiles[s2]?.damageType; if (d === 'physical') phys++; else if (d === 'magical') mag++; else { phys += 0.5; mag += 0.5; } });
  h += `<div class="h-section">Team Read</div><div class="row"><span class="bar-label">dmg</span><span class="split-track"><span class="split-you" style="width:${Math.round(phys / (phys + mag || 1) * 100)}%"></span></span><span class="bar-val">${phys}phys/${mag}mag</span></div>`;
  // Power curve vs enemy
  const kitsOf = arr => arr.map(kitOf).filter(Boolean);
  const yk = kitsOf(yours), ek = kitsOf(enemies);
  if (yk.length >= 2) {
    const avg = (ks, ph) => Math.round(ks.reduce((s2, k) => s2 + k.phases[ph], 0) / ks.length);
    h += `<div class="bar-grid">`;
    const v = {};
    ['early', 'mid', 'late'].forEach(ph => {
      const you = avg(yk, ph), them = ek.length ? avg(ek, ph) : null;
      v[ph] = them === null ? 0 : you - them;
      const cls = them === null ? 'wr-mid' : v[ph] > 5 ? 'wr-up' : v[ph] < -5 ? 'wr-down' : 'wr-mid';
      h += `<span class="bar-label">${ph}</span><span class="bar-track"><span class="bar-fill" style="width:${you}%"></span></span><span class="bar-val ${cls}">${you}${them !== null ? '–' + them : ''}</span>`;
    });
    h += '</div>';
    if (ek.length >= 2) {
      if (v.early > 5 && v.late < -5) h += `<div class="note gold">⏱ Your comp peaks earlier — force objectives, don't stall.</div>`;
      else if (v.early < -5 && v.late > 5) h += `<div class="note gold">🛡 You outscale — survive early, win the 25+ min game.</div>`;
    }
  }
  el.innerHTML = h;
}

async function renderDraftSuggestions() {
  const el = $('draftSuggestions');
  const enemies = S.draft.enemy.filter(Boolean), yours = S.draft.your.filter(Boolean);
  $('sugHint').textContent = enemies.length ? '' : 'add enemy picks to get counters';
  if (!enemies.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="empty">Scoring…</div>';
  const dataMap = {};
  for (const s2 of enemies) { try { dataMap[s2] = await loadHero(s2); } catch {} }
  const picked = new Set([...enemies, ...yours]);

  const enemyKits = enemies.map(kitOf).filter(Boolean);
  const eAvg = ph => enemyKits.length ? enemyKits.reduce((a, k) => a + k.phases[ph], 0) / enemyKits.length : null;
  const teamKits = yours.map(kitOf).filter(Boolean);
  const tAvg = ph => teamKits.length ? teamKits.reduce((a, k) => a + k.phases[ph], 0) / teamKits.length : null;
  const weakest = teamKits.length >= 2 ? ['early', 'mid', 'late'].sort((a, b) => tAvg(a) - tAvg(b))[0] : null;

  const scores = [];
  for (const h of S.heroList) {
    if (picked.has(h.slug)) continue;
    let counter = 0; const reasons = [];
    for (const eSlug of enemies) {
      const ed = dataMap[eSlug];
      if (!ed) continue;
      let match = null;
      for (const rd of Object.values(ed.roles || {})) {
        const m = (rd?.counters || []).find(c => slugFromName(c.hero) === h.slug);
        if (m && (!match || (m.matches || 0) > (match.matches || 0))) match = m;
      }
      if (match) {
        const adv = 50 - adjWR(match.winRate, match.matches || 0);
        counter += adv;
        if (adv > 2) reasons.push(`${(50 + adv).toFixed(0)}% vs ${name(eSlug)} (${match.matches}g)`);
      }
    }
    let fit = 0;
    const myRoles = (S.profiles[h.slug]?.roles || []).map(r => String(r).toLowerCase());
    const takenRoles = yours.flatMap(s2 => (S.profiles[s2]?.roles || []).map(r => String(r).toLowerCase()));
    const needed = ['carry', 'support', 'midlane', 'jungle', 'offlane'].filter(r => !takenRoles.includes(r));
    const fills = myRoles.find(r => needed.includes(r));
    if (fills) { fit += 12; }
    let phase = 0;
    const ck = kitOf(h.slug);
    if (ck && enemyKits.length) {
      let d = 0; ['early', 'mid', 'late'].forEach(ph => { d += ck.phases[ph] - eAvg(ph); });
      phase += Math.max(-8, Math.min(8, d / 12));
      if (weakest && tAvg(weakest) < 50 && ck.phases[weakest] >= 60) { phase += 6; reasons.push(`patches weak ${weakest} game`); }
    }
    let trend = 0;
    const st = S.patch.heroes?.[h.slug];
    if (st?.trend === 'buff') { trend = 3; reasons.push(`▲ buffed ${S.patch.patch}`); }
    else if (st?.trend === 'nerf') trend = -3;
    const score = counter * 0.5 + fit * 0.3 + phase + trend;
    if (score > 0) scores.push({ slug: h.slug, score, reasons, fills });
  }
  scores.sort((a, b) => b.score - a.score);

  el.innerHTML = scores.slice(0, 8).map(s2 => {
    const ck = kitOf(s2.slug);
    let chips = '';
    if (ck && enemyKits.length) {
      chips = `<span class="phase-chips">${[['E', 'early'], ['M', 'mid'], ['L', 'late']].map(([l, ph]) => {
        const d = ck.phases[ph] - eAvg(ph);
        return `<span class="pchip ${d > 7 ? 'win' : d < -7 ? 'lose' : ''}">${l}</span>`;
      }).join('')}</span>`;
    }
    return `<div class="row tappable" data-pick="${esc(s2.slug)}">${heroImg(s2.slug, 'item-ico lg')}<span class="row-main"><span class="row-title">${esc(name(s2.slug))} ${chips}${s2.fills ? `<span class="chip">${esc(s2.fills)}</span>` : ''}</span><span class="row-sub">${s2.reasons.slice(0, 3).map(esc).join(' · ') || 'solid pick'}</span></span><span class="row-end num wr-up">+${s2.score.toFixed(0)}</span></div>`;
  }).join('') || '<div class="empty">No strong counters found.</div>';
}

// ── Pick modal ──
function openPicker(team, i) {
  S.draft.target = { team, i };
  $('pickTitle').textContent = team === 'your' ? `Your pick ${i + 1}` : `Enemy pick ${i + 1}`;
  $('pickSearch').value = '';
  renderPickGrid('');
  $('pickModal').classList.remove('hidden');
  $('pickSearch').focus();
}
function renderPickGrid(q) {
  const taken = new Set([...S.draft.your, ...S.draft.enemy].filter(Boolean));
  $('pickGrid').innerHTML = S.heroList
    .filter(h => !taken.has(h.slug) && (!q || h.name.toLowerCase().includes(q)))
    .map(h => `<button class="hero-tile" data-modalpick="${esc(h.slug)}">${heroImg(h.slug)}<div class="nm">${esc(h.name)}</div></button>`).join('');
}

// ── Boot ──
async function boot() {
  let manifest = { latest: null };
  try { manifest = await getJSON(`${DATA}/manifest.json?v=${DAY}`); } catch {}
  S.dataV = manifest.latest || DAY;

  const v = `?v=${S.dataV}`;
  const [profilesRaw, patchState] = await Promise.all([
    getJSON(`${DATA}/game-data/hero-profiles.json${v}`),
    getJSON(`${DATA}/game-data/hero-patch-state.json${v}`).catch(() => ({ patch: null, heroes: {} })),
  ]);
  for (const p of profilesRaw) {
    S.profiles[p.slug] = p;
    S.nameToSlug[p.name.toLowerCase()] = p.slug;
  }
  S.heroList = profilesRaw.map(p => ({ slug: p.slug, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
  S.patch = patchState;
  $('patchTag').textContent = S.patch.patch ? `patch ${S.patch.patch}` : '';

  // Engines (KitEngine first — matchup engine merges its playstyle output)
  if (typeof KitEngine !== 'undefined') await KitEngine.loadFrom(DATA).catch(() => {});
  if (typeof MatchupEngine !== 'undefined') await MatchupEngine.init(DATA).catch(() => {});
  if (typeof EternalsEngine !== 'undefined') await EternalsEngine.init(DATA).catch(() => {});
  if (typeof KitEngine !== 'undefined' && KitEngine.isReady()) {
    for (const p of Object.values(S.profiles)) {
      const k = KitEngine.getProfile(p.slug);
      if (k) p.playstyle = k.playstyle;
    }
  }

  renderMovers();
  renderGrid();
  route();
}

// ── Events (delegated) ──
document.addEventListener('click', e => {
  const heroBtn = e.target.closest('[data-hero]');
  if (heroBtn) { openHero(heroBtn.dataset.hero); return; }
  const enemyRow = e.target.closest('[data-enemy]');
  if (enemyRow) { S.enemy = enemyRow.dataset.enemy; setHash(); renderMatchupsTab(); window.scrollTo(0, 0); return; }
  const tab = e.target.closest('#heroTabs .tab');
  if (tab) { S.tab = tab.dataset.tab; setHash(); renderTab(); return; }
  const exp = e.target.closest('.exp-head');
  if (exp) { exp.parentElement.classList.toggle('open'); return; }
  const dslot = e.target.closest('.dslot');
  if (dslot) {
    const { team, i } = dslot.dataset;
    if (S.draft[team][i]) { S.draft[team][i] = null; renderDraft(); }
    else openPicker(team, +i);
    return;
  }
  const mp = e.target.closest('[data-modalpick]');
  if (mp) {
    const t = S.draft.target;
    if (t) { S.draft[t.team][t.i] = mp.dataset.modalpick; }
    $('pickModal').classList.add('hidden');
    renderDraft();
    return;
  }
  const sug = e.target.closest('[data-pick]');
  if (sug) {
    const idx = S.draft.your.indexOf(null);
    if (idx !== -1) { S.draft.your[idx] = sug.dataset.pick; renderDraft(); }
    return;
  }
});
$('brandHome').onclick = () => show('grid');
$('navDraft').onclick = () => show('draft');
$('pickClose').onclick = () => $('pickModal').classList.add('hidden');
$('pickModal').onclick = e => { if (e.target === $('pickModal')) $('pickModal').classList.add('hidden'); };
$('pickSearch').oninput = () => renderPickGrid($('pickSearch').value.toLowerCase());
$('search').oninput = () => { S.search = $('search').value; renderGrid(); };
document.querySelectorAll('#roleSeg .seg-btn').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('#roleSeg .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    S.gridRole = b.dataset.role;
    renderGrid();
  };
});
window.addEventListener('hashchange', route);

boot();
})();
