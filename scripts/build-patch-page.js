#!/usr/bin/env node
// Build the published patch-overview page (static HTML) from the committed
// digest + coach predictions. Zero-API, regenerable.
//
//   node scripts/build-patch-page.js [version]
//
// Reads data/patches/<version>.json and
// data/aggregates/patch-<version>-predictions.json, writes
// ui/patch-<version>.html. Content is BAKED in (no fetch) so the page serves
// statically anywhere, matching ui/patch-notes.html.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const version = process.argv[2] || '1.15';

const digest = JSON.parse(fs.readFileSync(path.join(ROOT, `data/patches/${version}.json`), 'utf8'));
const pred = JSON.parse(fs.readFileSync(path.join(ROOT, `data/aggregates/patch-${version}-predictions.json`), 'utf8'));

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const MAG = {
  'meta-shifting': { label: 'Meta-shifting', cls: 'mag-meta' },
  'notable': { label: 'Notable', cls: 'mag-notable' },
  'minor': { label: 'Minor', cls: 'mag-minor' },
};
const TREND = {
  buff: { label: 'Buff', cls: 'trend-buff', icon: '▲' },
  nerf: { label: 'Nerf', cls: 'trend-nerf', icon: '▼' },
  mixed: { label: 'Mixed', cls: 'trend-mixed', icon: '◆' },
  rework: { label: 'Shift', cls: 'trend-rework', icon: '⟳' },
  new: { label: 'New', cls: 'trend-new', icon: '✦' },
  removed: { label: 'Removed', cls: 'trend-removed', icon: '✕' },
};

const order = { 'meta-shifting': 0, 'notable': 1, 'minor': 2 };
// Default trend order inside a magnitude group: reworks first, then buffs,
// nerfs, mixed. The trend chips above the hero grid re-sort (never filter)
// client-side; this server-side order is what no-JS readers get too.
const TREND_PRI = { rework: 0, buff: 1, nerf: 2, mixed: 3 };
const heroes = Object.entries(pred.predictions)
  .sort((a, b) => (order[a[1].magnitude] - order[b[1].magnitude])
    || ((TREND_PRI[a[1].trend] ?? 9) - (TREND_PRI[b[1].trend] ?? 9))
    || a[1].name.localeCompare(b[1].name));

// Digest slug -> site slug (Neon's artifact/image is "neon"). Used by the
// hero cards (out-link) and the showcase.
const SITE_SLUG = { n3on: 'neon' };
// One showcase tile: image + colored trend arrow, links to an in-page anchor.
function showcaseTile({ href, img, name, trend, title }) {
  const a = TREND[trend] || TREND.mixed;
  return `<a class="hx tr-${trend}" data-trend="${trend}" href="${href}" title="${esc(title)}">
            <span class="hx-imgwrap"><img loading="lazy" src="${img}" alt="" onerror="this.style.visibility='hidden'"><span class="hx-arrow">${a.icon}</span></span>
            <span class="hx-name">${esc(name)}</span>
          </a>`;
}

// Artifact item ids arrive as CamelCase machine tokens ("RaimentOfRenewal");
// space them out and lowercase connective words for display.
const humanizeItem = (s) => s
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/ (Of|The|And|In) /g, (m) => m.toLowerCase());

// ── Glossary tooltips: game jargon gets a dotted underline with a plain-
// language tooltip (hover on desktop, tap on mobile via tabindex focus).
// makeGloss() returns a per-block glosser that only marks each term's FIRST
// occurrence within that block, so cards don't fill with underlines. Applied
// to ALREADY-ESCAPED plain text only — the single-pass replace never rescans
// the tooltip markup it inserts, so tips may mention other glossed terms.
const TERMS = [
  ['tenacity', 'Tenacity shortens how long crowd control (stuns, roots, slows) lasts on a hero. More tenacity = less time locked down.'],
  ['sustain', 'Sustain is everything that refills health through a lane or a fight: regen, potions, lifesteal, omnivamp, healing abilities.'],
  ['cleave', 'Cleave makes basic attacks also hit enemies near the target for a portion of the damage.'],
  ['omnivamp', 'Omnivamp heals for a percentage of ALL damage dealt — abilities included.'],
  ['lifesteal', 'Lifesteal heals for a percentage of basic-attack damage dealt.'],
  ['ability haste', 'Ability haste shortens cooldowns — more haste means abilities come back faster.'],
];
const TERM_RE = new RegExp('\\b(' + TERMS.map(([t]) => t.replace(/ /g, '\\s+')).join('|') + ')\\b', 'gi');
function makeGloss() {
  const done = new Set();
  return (escaped) => escaped.replace(TERM_RE, (m) => {
    const key = m.toLowerCase().replace(/\s+/g, ' ');
    const hit = TERMS.find(([t]) => t === key);
    if (!hit || done.has(key)) return m;
    done.add(key);
    return `<span class="term" tabindex="0" data-tip="${esc(hit[1])}">${m}</span>`;
  });
}

function heroCard([slug, p]) {
  const g = makeGloss();
  const t = TREND[p.trend] || TREND.mixed;
  const m = MAG[p.magnitude] || MAG.minor;
  const changes = (p.changes || []).map((c) => `<li>${g(esc(c))}</li>`).join('');
  const simRead = p.topMetaBuild
    ? `<div class="sim-read">Sim read (pre-${esc(version)}): top field core <strong>${esc(p.topMetaBuild.title)}</strong> — ${esc((p.topMetaBuild.items || []).map(humanizeItem).join(', '))}` +
      (p.topMetaBuild.shrunkWr ? ` · ${(p.topMetaBuild.shrunkWr * 100).toFixed(1)}% wr` : '') +
      (p.topMetaBuild.games ? ` · ${p.topMetaBuild.games.toLocaleString()} games` : '') + `</div>`
    : '';
  const site = SITE_SLUG[slug] || slug;
  const mm = (pred.measured && pred.measured.perHero && pred.measured.perHero[slug]) || null;
  const mHit = mm && mm.delta != null && (p.trend === 'buff' || p.trend === 'nerf')
    ? ((p.trend === 'buff' && mm.delta > 0) || (p.trend === 'nerf' && mm.delta < 0)) : null;
  const measuredLine = mm
    ? `<div class="pred measured"><span class="pred-label">Measured (patch to date)</span>${
        mm.delta != null
          ? `${mm.old}% → <strong>${mm.now}%</strong> win rate (${mm.delta > 0 ? '+' : ''}${mm.delta} pts over ${mm.n.toLocaleString()} ranked games)${mHit === true ? ' <span class="m-hit">✓ called it</span>' : mHit === false ? ' <span class="m-miss">✗ moved the other way</span>' : ''}`
          : `<strong>${mm.now}%</strong> win rate over ${mm.n.toLocaleString()} ranked games${mm.isNew ? ' (new hero — no baseline)' : ' (thin pre-patch sample)'}`
      }</div>`
    : '';
  return `
      <div class="hero-card card" id="hero-${slug}" data-mag="${p.magnitude}" data-trend="${p.trend}">
        <a class="card-out" href="v6/?hero=${site}" title="Open ${esc(p.name)}'s full build &amp; matchups">full page ↗</a>
        <div class="hero-head">
          <span class="hero-name">${esc(p.name)}</span>
          <span class="hero-role">${esc(p.role || '')}</span>
          <span class="badge ${t.cls}">${t.icon} ${t.label}</span>
          <span class="badge ${m.cls}">${m.label}</span>
        </div>
        <ul class="change-list">${changes}</ul>
        <div class="pred"><span class="pred-label">Why</span>${g(esc(p.why))}</div>
        <div class="pred"><span class="pred-label">What it'll change</span>${g(esc(p.willChange))}</div>
        ${simRead}
        ${measuredLine}
      </div>`;
}

const groups = [
  ['meta-shifting', 'Meta-shifting'],
  ['notable', 'Notable'],
  ['minor', 'Minor'],
];
const heroSections = groups.map(([key, title]) => {
  const list = heroes.filter(([, p]) => p.magnitude === key);
  if (!list.length) return '';
  return `
      <h3 class="group-head"><span class="badge ${MAG[key].cls}">${MAG[key].label}</span> <span class="group-count">${list.length} ${list.length === 1 ? 'hero' : 'heroes'}</span></h3>
      <div class="group-cards">${list.map(heroCard).join('')}</div>`;
}).join('');

// Coach "meta read" callout for the bottom of a section (omitted if absent).
function metaRead(key) {
  const m = pred.sectionMeta && pred.sectionMeta[key];
  return m ? `\n      <div class="meta-read"><b><span class="mr-ic" data-bic="scout" data-bic-size="13"></span>Meta read</b>${makeGloss()(esc(m))}</div>` : '';
}

// ── Hero showcase: clickable images with a colored trend arrow, ordered by
// magnitude then name; each jumps to that hero's card lower in this section.
const heroShowcase = `
      <div class="hx-legend hx-sortbar" role="group" aria-label="Sort heroes by change type">
        <button class="hxs tr-rework" data-sort="rework" aria-pressed="false">⟳ reworks</button>
        <button class="hxs tr-buff" data-sort="buff" aria-pressed="false">▲ buffs</button>
        <button class="hxs tr-nerf" data-sort="nerf" aria-pressed="false">▼ nerfs</button>
        <button class="hxs tr-mixed" data-sort="mixed" aria-pressed="false">◆ mixed</button>
        <span class="hx-hint">tap a change type to bring those heroes to the top — nothing is hidden. tap a hero to jump to its changes</span>
      </div>
      <div class="hx-grid" id="heroShowcaseGrid">
        ${heroes.map(([slug, p]) => showcaseTile({
          href: `#hero-${slug}`,
          img: `img/heroes/${SITE_SLUG[slug] || slug}.webp`,
          name: p.name,
          trend: p.trend,
          title: `${p.name} — ${p.magnitude} ${(TREND[p.trend] || TREND.mixed).label.toLowerCase()}; jump to its changes`,
        })).join('')}
      </div>`;

// ── ARAM section ──
const aramKeys = ['gold-drip', 'minion-magical-armor', 'stack-interval'];
const aramSys = pred.aramSystem || {};
function aramSysCard(s, i) {
  const p = aramSys[aramKeys[i]] || {};
  const m = MAG[p.magnitude] || null;
  return `
      <div class="hero-card card" data-mag="${p.magnitude || ''}">
        <div class="hero-head">
          <span class="hero-name">${esc(s.name)}</span>
          ${m ? `<span class="badge ${m.cls}">${m.label}</span>` : ''}
        </div>
        <ul class="change-list"><li>${esc(s.change)}</li></ul>
        ${p.why ? `<div class="pred"><span class="pred-label">Why</span>${esc(p.why)}</div>` : `<div class="pred">${esc(s.meaning)}</div>`}
        ${p.willChange ? `<div class="pred"><span class="pred-label">What it'll change</span>${esc(p.willChange)}</div>` : ''}
      </div>`;
}
// Per-hero ARAM tuning, grouped by the SHARED change so common buffs cluster
// (e.g. the heroes who all got the same +3% damage), instead of a flat table.
const ARAM_SLUG_OVER = { Grim: 'grim-exe' };
const aramSlug = (n) => ARAM_SLUG_OVER[n] || n.toLowerCase().replace(/ & /g, '-').replace(/\./g, '').replace(/'/g, '').replace(/\s+/g, '-');
const aramImg = (h) => `<img loading="lazy" src="img/heroes/${aramSlug(h.name)}.webp" alt="" onerror="this.style.visibility='hidden'">`;
// Compact chip (face + name) — used in a cluster where the change is the header.
function aramFace(h) {
  return `<div class="aram-chip" data-dir="${h.dir}">${aramImg(h)}<span class="ac-body"><span class="ac-name">${esc(h.name)}</span></span></div>`;
}
// Full chip (face + name + its own change) — used for bespoke adjustments.
function aramChip(h) {
  return `<div class="aram-chip" data-dir="${h.dir}">${aramImg(h)}<span class="ac-body"><span class="ac-name">${esc(h.name)}</span><span class="ac-change">${esc(h.change)}</span></span></div>`;
}
const aramByChange = new Map();
(digest.aram?.heroes || []).forEach((h) => {
  if (!aramByChange.has(h.change)) aramByChange.set(h.change, []);
  aramByChange.get(h.change).push(h);
});
const aramClusters = [...aramByChange.entries()].filter(([, hs]) => hs.length >= 2)
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
const aramSingles = [...aramByChange.entries()].filter(([, hs]) => hs.length < 2)
  .flatMap(([, hs]) => hs).sort((a, b) => a.name.localeCompare(b.name));
const aramHeroGroups = [
  ...aramClusters.map(([change, hs]) => {
    const t = TREND[hs[0].dir] || TREND.mixed;
    return `
      <h4 class="aram-grp-head"><span class="badge ${t.cls}">${t.icon} ${esc(change.replace(/\s*->\s*/g, ' → '))}</span> <span class="group-count">${hs.length} heroes</span></h4>
      <div class="aram-chips compact">${hs.map(aramFace).join('')}</div>`;
  }),
  aramSingles.length ? `
      <h4 class="aram-grp-head"><span class="badge trend-mixed">◆ Other adjustments</span> <span class="group-count">${aramSingles.length}</span></h4>
      <div class="aram-chips">${aramSingles.map(aramChip).join('')}</div>` : '',
].join('');
const aramBlock = digest.aram ? `
      <h2 class="section" id="ch-aram"><span class="sec-ic" data-bic="team-comp"></span>ARAM balance</h2>
      <p class="lead">${esc(digest.aram.summary || '')}</p>
      <h3 class="group-head">Systemic changes <span class="group-count">${(digest.aram.system || []).length}</span></h3>
      ${(digest.aram.system || []).map(aramSysCard).join('')}
      <h3 class="group-head">Per-hero ARAM tuning <span class="group-count">${(digest.aram.heroes || []).length} heroes</span></h3>
      <p class="lead" style="margin-bottom:0.6rem;">Mode-only multipliers (damage / healing / damage-received) — they do not touch the 5v5 kit numbers above.</p>
      ${aramHeroGroups}${metaRead('aram')}
` : '';

const globalList = (digest.global || []).map((x) => `<li>${makeGloss()(esc(x))}</li>`).join('');
// TL;DR as scannable bold-lead cards (same shape as Systems entries), with a
// fallback to the long global strings if no structured tldr is present.
const tldrBlock = (digest.tldr && digest.tldr.length)
  ? `<div class="tldr-grid">${digest.tldr.map((t) => {
      const g = makeGloss();
      return `<div class="tldr-item"><div class="tldr-lead">${g(esc(t.lead))}</div><div class="tldr-text">${g(esc(t.text))}</div></div>`;
    }).join('')}</div>`
  : `<ul class="tldr">${globalList}</ul>`;
// Eternals get the same treatment as heroes: a showcase grid of clickable
// images with a colored buff/nerf/shift arrow, then a card per Eternal.
const ETSLUG = (name) => name.toLowerCase();
const eternalShowcase = `
      <div class="hx-legend"><span class="hx-hint">tap an Eternal to jump to its change</span></div>
      <div class="hx-grid">
        ${(digest.eternals?.changes || []).map((e) => showcaseTile({
          href: `#eternal-${ETSLUG(e.name)}`,
          img: `img/eternals/${ETSLUG(e.name)}.webp`,
          name: e.name,
          trend: e.dir || 'mixed',
          title: `${e.name} — ${(TREND[e.dir] || TREND.mixed).label}; jump to its change`,
        })).join('')}
      </div>`;
const eternalCards = (digest.eternals?.changes || []).map((e) => {
  const t = TREND[e.dir] || TREND.mixed;
  const g = makeGloss();
  return `
      <div class="hero-card card" id="eternal-${ETSLUG(e.name)}" data-trend="${e.dir || 'mixed'}">
        <div class="hero-head">
          <img class="et-ic" loading="lazy" src="img/eternals/${ETSLUG(e.name)}.webp" alt="" onerror="this.style.display='none'">
          <span class="hero-name">${esc(e.name)}</span>
          <span class="badge ${t.cls}">${t.icon} ${t.label}</span>
        </div>
        <ul class="change-list"><li>${g(esc(e.change))}</li></ul>
        ${e.meaning ? `<div class="pred"><span class="pred-label">Meaning</span>${g(esc(e.meaning))}</div>` : ''}
      </div>`;
}).join('');
const itemList = (digest.items || []).map((i) => `<li>${esc(i)}</li>`).join('');
// Items get the hero/Eternal treatment when structured itemChanges exist:
// a showcase grid of images with a colored trend arrow, then a card each.
const itemOrder = { new: 0, removed: 1, rework: 2, buff: 3, mixed: 4, nerf: 5 };
const itemChanges = (digest.itemChanges || []).slice()
  .sort((a, b) => (itemOrder[a.dir] ?? 9) - (itemOrder[b.dir] ?? 9) || a.name.localeCompare(b.name));
const itemShowcase = itemChanges.length ? `
      <div class="hx-legend"><span class="tr-new">✦ new</span><span class="tr-removed">✕ removed</span><span class="hx-hint">tap an item to jump to its change</span></div>
      <div class="hx-grid">
        ${itemChanges.map((it) => showcaseTile({
          href: `#item-${it.slug}`,
          img: `img/items/${it.slug}.webp`,
          name: it.name,
          trend: it.dir,
          title: `${it.name} — ${(TREND[it.dir] || TREND.mixed).label}; jump to its change`,
        })).join('')}
      </div>` : '';
const itemCards = itemChanges.map((it) => {
  const t = TREND[it.dir] || TREND.mixed;
  return `
      <div class="hero-card card item-card" id="item-${it.slug}" data-trend="${it.dir}">
        <div class="hero-head">
          <img class="et-ic" loading="lazy" src="img/items/${it.slug}.webp" alt="" onerror="this.style.display='none'">
          <span class="hero-name">${esc(it.name)}</span>
          <span class="badge ${t.cls}">${t.icon} ${t.label}</span>
        </div>
        <div class="pred" style="margin:0">${makeGloss()(esc(it.change))}</div>
      </div>`;
}).join('');
const sysList = (digest.systems || []).map((s) =>
  `<div class="sys"><div class="sys-name">${esc(s.name)}</div><div class="sys-sum">${esc(s.summary)}</div></div>`).join('');
const rankedBlock = digest.ranked ? `
      <h2 class="section" id="ch-ranked"><span class="sec-ic" data-bic="power-spike"></span>Ranked</h2>
      <p class="lead">${makeGloss()(esc(digest.ranked.summary || ''))}</p>
      <ul class="items-list ranked-list">${(digest.ranked.changes || []).map((c) => `<li>${makeGloss()(esc(c))}</li>`).join('')}</ul>${metaRead('ranked')}
` : '';

const counts = groups.map(([k]) => heroes.filter(([, p]) => p.magnitude === k).length);

// Chapter menu — a sticky section jumper (mirrors the v6 pages' subnav), since
// the page has many chapters. Pills are real anchor links (work without JS);
// a small scrollspy highlights the section you're in.
const SECTIONS = [
  { id: 'ch-tldr', label: 'TL;DR' },
  { id: 'ch-heroes', label: 'Hero changes' },
  { id: 'ch-eternals', label: 'Eternals' },
  { id: 'ch-items', label: 'Items' },
  ...(digest.aram ? [{ id: 'ch-aram', label: 'ARAM' }] : []),
  ...((digest.systems || []).length ? [{ id: 'ch-systems', label: 'Systems & map' }] : []),
  ...(digest.ranked ? [{ id: 'ch-ranked', label: 'Ranked' }] : []),
];
const subnavBar = `
  <nav class="patch-subnav" aria-label="Chapters">
    <div class="psn-inner">
      <span class="psn-label">Jump to</span>
      ${SECTIONS.map((s) => `<a class="psn-pill" href="#${s.id}" data-t="${s.id}">${esc(s.label)}</a>`).join('')}
    </div>
  </nav>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Patch ${esc(version)} review — Pred Scout</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <style>
    .patch { max-width: 880px; margin: 0 auto; }
    .lead { color: var(--text-2); font-size: 0.9rem; margin-bottom: 1rem; }
    .banner { background: var(--accent-dim); border: 1px solid var(--accent); border-radius: var(--radius);
      padding: 0.75rem 1rem; font-size: 0.82rem; color: var(--text-1); margin-bottom: 1.5rem; }
    .banner strong { color: var(--text-0); }
    h2.section { font-size: 1.05rem; margin: 2rem 0 0.75rem; color: var(--text-0);
      border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; }
    .tldr { list-style: none; padding: 0; }
    .tldr li { font-size: 0.88rem; color: var(--text-1); margin-bottom: 0.5rem; padding-left: 1.2rem; position: relative; }
    .tldr li::before { content: '◦'; position: absolute; left: 0; color: var(--accent); font-weight: 700; }
    .tldr-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 0.7rem 1.4rem; }
    .tldr-item { border-left: 2px solid var(--border); padding-left: 0.75rem; }
    .tldr-lead { font-weight: 700; font-size: 0.9rem; color: var(--text-0); margin-bottom: 0.15rem; }
    .tldr-text { font-size: 0.84rem; color: var(--text-1); line-height: 1.5; }
    .group-head { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;
      margin: 1.5rem 0 0.6rem; display: flex; align-items: center; gap: 0.5rem; }
    .group-count { color: var(--text-2); font-weight: 500; }
    .hero-card { margin-bottom: 0.85rem; padding: 0.9rem 1rem; }
    .hero-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.55rem; }
    .hero-name { font-weight: 700; font-size: 1rem; color: var(--text-0); }
    .hero-role { font-size: 0.72rem; color: var(--text-2); text-transform: capitalize;
      border: 1px solid var(--border); border-radius: 5px; padding: 0.05rem 0.4rem; }
    .badge { font-size: 0.68rem; font-weight: 600; border-radius: 5px; padding: 0.1rem 0.45rem; }
    .trend-buff { background: var(--green-dim); color: var(--green); }
    .trend-nerf { background: var(--red-dim); color: var(--red); }
    .trend-mixed { background: #f0b42925; color: var(--gold); }
    .mag-meta { background: var(--accent); color: #fff; }
    .mag-notable { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); }
    .mag-minor { background: var(--bg-3); color: var(--text-2); }
    .change-list { list-style: none; padding: 0; margin: 0 0 0.6rem; }
    .change-list li { font-size: 0.8rem; color: var(--text-2); margin-bottom: 0.2rem; padding-left: 0.9rem; position: relative; }
    .change-list li::before { content: '–'; position: absolute; left: 0; }
    .pred { font-size: 0.86rem; color: var(--text-1); margin-bottom: 0.4rem; line-height: 1.45; }
    .pred-label { display: inline-block; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em;
      font-weight: 700; color: var(--accent); margin-right: 0.45rem; vertical-align: 1px; }
    .sim-read { font-size: 0.74rem; color: var(--text-2); margin-top: 0.35rem;
      border-top: 1px dashed var(--border); padding-top: 0.4rem; }
    table.et { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    table.et td { border-bottom: 1px solid var(--border); padding: 0.5rem 0.6rem; vertical-align: top; color: var(--text-1); }
    .et-name { font-weight: 700; color: var(--text-0); white-space: nowrap; }
    .et-mean { color: var(--text-2); }
    .aram-grp-head { display: flex; align-items: center; gap: 0.5rem; margin: 1rem 0 0.5rem; }
    .aram-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(178px, 1fr)); gap: 0.45rem; }
    .aram-chips.compact { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); }
    .aram-chip { display: flex; align-items: center; gap: 0.55rem; padding: 0.4rem 0.55rem; border-radius: 10px;
      background: var(--bg-1); border: 1px solid var(--border); border-left: 3px solid var(--border); min-width: 0; }
    .aram-chip[data-dir="buff"] { border-left-color: var(--green); }
    .aram-chip[data-dir="nerf"] { border-left-color: var(--red); }
    .aram-chip[data-dir="mixed"] { border-left-color: var(--gold); }
    .aram-chip img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: var(--bg-3); flex-shrink: 0; }
    .aram-chip .ac-body { display: flex; flex-direction: column; min-width: 0; }
    .ac-name { font-weight: 700; font-size: 0.82rem; color: var(--text-0); }
    .ac-change { font-size: 0.71rem; color: var(--text-2); line-height: 1.3; }
    .items-list { list-style: none; padding: 0; }
    .items-list li { font-size: 0.82rem; color: var(--text-1); margin-bottom: 0.45rem; padding-left: 1.2rem; position: relative; }
    .items-list li::before { content: '⬡'; position: absolute; left: 0; color: var(--gold); }
    .sys { margin-bottom: 0.7rem; }
    .sys-name { font-weight: 600; font-size: 0.88rem; color: var(--text-0); }
    .sys-sum { font-size: 0.82rem; color: var(--text-1); margin-top: 0.15rem; line-height: 1.45; }
    .foot { margin-top: 2rem; font-size: 0.78rem; color: var(--text-2); border-top: 1px solid var(--border); padding-top: 1rem; }
    .foot a, .lead a { color: var(--accent); }
    html { scroll-behavior: smooth; }
    a.logo { text-decoration: none; }
    .hx-legend { display: flex; flex-wrap: wrap; gap: 0.9rem; align-items: center; font-size: 0.72rem;
      font-weight: 700; margin: 0.2rem 0 0.7rem; }
    .hx-legend .hx-hint { color: var(--text-2); font-weight: 500; }
    .hx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 0.5rem;
      margin-bottom: 1.1rem; }
    .hx { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; text-decoration: none;
      color: var(--text-1); padding: 0.5rem 0.3rem; border-radius: 12px; border: 1px solid var(--border);
      background: var(--bg-1); transition: border-color 0.15s, background 0.15s, transform 0.1s; }
    .hx:hover { background: var(--bg-2); transform: translateY(-2px); }
    .hx.tr-buff:hover { border-color: var(--green); }
    .hx.tr-nerf:hover { border-color: var(--red); }
    .hx.tr-mixed:hover { border-color: var(--gold); }
    .hx-imgwrap { position: relative; width: 52px; height: 52px; }
    .hx-imgwrap img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover;
      background: var(--bg-3); }
    .hx-arrow { position: absolute; right: -3px; bottom: -3px; width: 19px; height: 19px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; font-size: 0.66rem; font-weight: 800;
      background: var(--bg-0); border: 1.5px solid var(--bg-0); }
    .hx.tr-buff .hx-arrow { color: var(--green); }
    .hx.tr-nerf .hx-arrow { color: var(--red); }
    .hx.tr-mixed .hx-arrow { color: var(--gold); }
    .hx-name { font-size: 0.72rem; font-weight: 600; color: var(--text-1); text-align: center; line-height: 1.1; }
    .tr-buff { color: var(--green); } .tr-nerf { color: var(--red); } .tr-mixed { color: var(--gold); }
    .tr-rework { color: var(--accent); }
    .hx.tr-rework:hover { border-color: var(--accent); }
    .hx.tr-rework .hx-arrow { color: var(--accent); }
    .trend-rework { background: var(--accent-dim); color: var(--accent); }
    .tr-new { color: var(--green); } .tr-removed { color: var(--text-2); }
    .hx.tr-new:hover { border-color: var(--green); }
    .hx.tr-removed:hover { border-color: var(--border); }
    .hx.tr-new .hx-arrow { color: var(--green); }
    .hx.tr-removed .hx-arrow { color: var(--text-2); }
    .trend-new { background: var(--green-dim, rgba(0,196,140,0.16)); color: var(--green); }
    .trend-removed { background: var(--bg-3); color: var(--text-2); }
    .item-card .hero-name { font-size: 0.95rem; }
    .hero-card { position: relative; scroll-margin-top: 116px; }
    .card-out { position: absolute; top: 0.7rem; right: 0.8rem; font-size: 0.68rem; font-weight: 700;
      color: var(--text-2); text-decoration: none; border: 1px solid var(--border); border-radius: 99px;
      padding: 0.12rem 0.5rem; }
    .card-out:hover { color: var(--accent); border-color: var(--accent); }
    .card-out + .hero-head { padding-right: 4.2rem; }
    .et-ic { width: 26px; height: 26px; border-radius: 6px; object-fit: contain; background: var(--bg-3);
      flex-shrink: 0; }
    .meta-read { margin: 1.1rem 0 0.3rem; background: var(--accent-dim); border-left: 3px solid var(--accent);
      border-radius: 8px; padding: 0.7rem 0.9rem; font-size: 0.85rem; color: var(--text-1); line-height: 1.5; }
    .meta-read b { display: block; color: var(--accent); text-transform: uppercase; font-size: 0.64rem;
      letter-spacing: 0.06em; margin-bottom: 0.25rem; }
    .ranked-list li::before { content: '⬡'; }
    h2.section .sec-ic { display: inline-flex; width: 1.1em; height: 1.1em; margin-right: 0.45rem; vertical-align: -0.16em; color: var(--text-0); }
    h2.section .sec-ic .bic { width: 100%; height: 100%; }
    .meta-read .mr-ic { display: inline-flex; width: 0.95em; height: 0.95em; margin-right: 0.3rem; vertical-align: -0.12em; }
    .meta-read .mr-ic .bic { width: 100%; height: 100%; color: var(--accent); }
    .patch-subnav { position: sticky; top: 56px; z-index: 90; background: var(--bg-1);
      border-bottom: 1px solid var(--border); backdrop-filter: blur(12px); }
    .psn-inner { max-width: 880px; margin: 0 auto; display: flex; align-items: center; gap: 0.35rem;
      padding: 0.5rem 1rem; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    .psn-inner::-webkit-scrollbar { display: none; }
    .psn-label { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-2);
      font-weight: 700; margin-right: 0.2rem; flex-shrink: 0; }
    .psn-pill { flex-shrink: 0; font-size: 0.78rem; color: var(--text-1); text-decoration: none;
      padding: 0.3rem 0.7rem; border-radius: 99px; border: 1px solid var(--border); white-space: nowrap;
      transition: color 0.15s, border-color 0.15s, background 0.15s; }
    .psn-pill:hover { color: var(--text-0); border-color: var(--accent); }
    .psn-pill.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    h2.section { scroll-margin-top: 112px; }
    @media (max-width: 560px) { .psn-label { display: none; } }
    /* Trend sort chips: re-order the hero cards + showcase, never filter. */
    .hxs { font: inherit; font-size: 0.72rem; font-weight: 600; cursor: pointer;
      background: transparent; border: 1px solid var(--line); border-radius: 999px;
      padding: 0.22rem 0.6rem; line-height: 1; }
    .hxs:hover { border-color: var(--accent); }
    .hxs.active { border-color: var(--accent); background: var(--bg-2);
      box-shadow: 0 0 0 1px var(--accent) inset; }
    /* Glossary terms: dotted underline, tooltip on hover (desktop) or tap/
       focus (mobile — the spans are tabbable). Tooltip is clamped to the
       viewport by a --tt-shift set from JS on open. */
    .term { text-decoration: underline dotted; text-decoration-color: var(--accent); text-decoration-thickness: 1px;
      text-underline-offset: 3px; cursor: help; position: relative; outline: none; }
    .term:focus-visible { border-radius: 3px; box-shadow: 0 0 0 2px var(--accent); }
    .term::after { content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 7px);
      transform: translateX(calc(-50% + var(--tt-shift, 0px))); width: max-content;
      max-width: min(270px, calc(100vw - 2rem)); white-space: normal; display: none;
      background: var(--bg-2); color: var(--text-1); border: 1px solid var(--line); border-radius: 8px;
      padding: 0.5rem 0.7rem; font-size: 0.74rem; line-height: 1.5; font-weight: 500; text-align: left;
      z-index: 40; box-shadow: 0 6px 18px rgba(0,0,0,0.35); pointer-events: none; }
    .term:hover::after, .term:focus::after { display: block; }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition: none !important; animation: none !important; }
      .hx:hover { transform: none; }
    }
  .measured .m-hit{color:var(--green,#4caf50);font-weight:700;} .measured .m-miss{color:var(--gold,#e0a93e);font-weight:700;}
  .measured-banner{border-color:var(--green,#4caf50);}
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <a class="logo" href="v6/" style="display:inline-flex;align-items:center;gap:0.45rem"><img src="img/brand/logo.svg" alt="" width="26" height="26"> Pred Scout</a>
      <div class="header-links">
        <a href="v6/" class="header-link">Pick &amp; Build</a>
        <a href="v6/squad.html" class="header-link">Pre-Game</a>
        <a href="v6/coach.html" class="header-link">Coach</a>
      </div>
    </div>
  </header>
${subnavBar}

  <main id="app">
    <div class="patch">
      <h1 style="margin-bottom:0.25rem;">Patch ${esc(version)}${digest.name ? ` — ${esc(digest.name)}` : ''}</h1>
      <p class="lead">Released ${esc(digest.date)} · Scout overview &amp; sim-grounded predictions ·
        <a href="${esc(digest.source)}" target="_blank" rel="noopener">official notes ↗</a></p>

      ${pred.measured ? `<div class="banner measured-banner">
        <strong>Now with measured results.</strong> The ${esc(version)} numeric refresh has landed: every hero card below
        carries its <strong>measured patch-to-date ranked win rate</strong> (pre-patch baseline vs the patch-to-date ranked window)
        next to the original prediction. Scorecard: the coach called
        <strong>${pred.measured.scorecard.directionallyRight} of ${pred.measured.scorecard.predicted}</strong>
        predicted movers directionally right. Biggest measured movers:
        ${pred.measured.risers.slice(0, 3).map((r) => `${r.slug} +${r.delta}`).join(', ')} ·
        ${pred.measured.fallers.slice(0, 3).map((r) => `${r.slug} ${r.delta}`).join(', ')}.
        ${pred.measured.newHeroes.length ? `New hero ${pred.measured.newHeroes.map((h) => `<strong>${h.slug}</strong> lands at ${h.now}% over ${h.n.toLocaleString()} games`).join('; ')}.` : ''}
      </div>` : `<div class="banner">
        <strong>Heads up:</strong> these are <strong>predictions</strong>, not measured results. The engine's
        numeric base is still the pre-${esc(version)} data, so the sim reads below are the <em>current</em>
        meta — every forecast is grounded in the patch's stated numbers. Measured win rates replace the
        forecasts once enough post-patch ranked games land in the feed.
      </div>`}

      <h2 class="section" id="ch-tldr"><span class="sec-ic" data-bic="scout"></span>TL;DR — what actually changes how the game plays</h2>
      ${tldrBlock}${metaRead('tldr')}

      <h2 class="section" id="ch-heroes"><span class="sec-ic" data-bic="counter-pick"></span>Hero changes <span style="font-size:0.7rem;color:var(--text-2);font-weight:500;">
        ${counts[0]} meta-shifting · ${counts[1]} notable · ${counts[2]} minor · bugfix-only heroes excluded</span></h2>
      ${heroShowcase}
      ${heroSections}${metaRead('heroes')}

      <h2 class="section" id="ch-eternals"><span class="sec-ic" data-bic="eternal-augment"></span>Eternals (draft blessings)</h2>
      <p class="lead">${makeGloss()(esc(digest.eternals?.summary || ''))}</p>
      ${eternalShowcase}
      ${eternalCards}${metaRead('eternals')}

      <h2 class="section" id="ch-items"><span class="sec-ic" data-bic="build"></span>Items</h2>
      ${itemChanges.length ? `${itemShowcase}\n      ${itemCards}` : `<ul class="items-list">${itemList}</ul>`}${metaRead('items')}

      ${aramBlock}

      ${(digest.systems || []).length ? `<h2 class="section" id="ch-systems"><span class="sec-ic" data-bic="meta-guide"></span>Systems &amp; map</h2>
      ${sysList}${metaRead('systems')}` : ''}

      ${rankedBlock}

      <div class="foot">
        Generated from <code>data/patches/${esc(version)}.json</code> +
        <code>data/aggregates/patch-${esc(version)}-predictions.json</code> by
        <code>scripts/build-patch-page.js</code>. Predictions authored on session compute (no API) and
        grounded in the stated change numbers. Measured results (when shown) come from the ranked
        match feed: pre-patch baseline vs the patch-to-date window (dates in the predictions file's measured.source).
      </div>
    </div>
  </main>
  <script>
  (function () {
    var pills = [].slice.call(document.querySelectorAll('.psn-pill'));
    var byId = {}; pills.forEach(function (p) { byId[p.dataset.t] = p; });
    var secs = pills.map(function (p) { return document.getElementById(p.dataset.t); }).filter(Boolean);
    if (!('IntersectionObserver' in window) || !secs.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        pills.forEach(function (p) { p.classList.toggle('active', p.dataset.t === e.target.id); });
        var p = byId[e.target.id];
        if (p) { p.parentNode.scrollTo({ left: p.offsetLeft - p.parentNode.clientWidth / 2 + p.offsetWidth / 2, behavior: 'smooth' }); }
      });
    }, { rootMargin: '-20% 0px -75% 0px' });
    secs.forEach(function (s) { io.observe(s); });
  })();
  // Trend sort chips: clicking a chip lifts that change type to the top of the
  // showcase grid and every magnitude group — a SORT, never a filter. Clicking
  // the active chip again restores the default order (reworks, buffs, nerfs,
  // mixed — the order the page ships in, stamped here as data-oi).
  (function () {
    var btns = [].slice.call(document.querySelectorAll('.hxs'));
    if (!btns.length) return;
    var pools = [].slice.call(document.querySelectorAll('#heroShowcaseGrid, .group-cards'));
    pools.forEach(function (pool) {
      [].slice.call(pool.children).forEach(function (el, i) { el.dataset.oi = i; });
    });
    function apply(sel) {
      pools.forEach(function (pool) {
        [].slice.call(pool.children)
          .sort(function (a, b) {
            var ra = sel && a.dataset.trend === sel ? 0 : 1;
            var rb = sel && b.dataset.trend === sel ? 0 : 1;
            return ra - rb || (+a.dataset.oi - +b.dataset.oi);
          })
          .forEach(function (el) { pool.appendChild(el); });
      });
      btns.forEach(function (b) {
        var on = b.dataset.sort === sel;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    var current = null;
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        current = current === b.dataset.sort ? null : b.dataset.sort;
        apply(current);
      });
    });
  })();
  // Glossary tooltips: clamp each tooltip inside the viewport when it opens
  // (the CSS centers it on the term; --tt-shift nudges it off an edge).
  (function () {
    [].slice.call(document.querySelectorAll('.term')).forEach(function (t) {
      function place() {
        var r = t.getBoundingClientRect();
        var w = Math.min(270, window.innerWidth - 32);
        var cx = r.left + r.width / 2, half = w / 2, shift = 0;
        if (cx - half < 12) shift = 12 - (cx - half);
        else if (cx + half > window.innerWidth - 12) shift = (window.innerWidth - 12) - (cx + half);
        t.style.setProperty('--tt-shift', shift + 'px');
      }
      t.addEventListener('mouseenter', place);
      t.addEventListener('focus', place);
    });
  })();
  </script>
  <script defer src="v6/icons.js"></script>
</body>
</html>
`;

const outPath = path.join(ROOT, `ui/patch-${version}.html`);
fs.writeFileSync(outPath, html);
console.log(`Wrote ${outPath} — ${heroes.length} hero predictions (${counts.join('/')} meta/notable/minor)`);
