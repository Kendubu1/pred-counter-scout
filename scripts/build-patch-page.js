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
const heroes = Object.entries(pred.predictions)
  .sort((a, b) => (order[a[1].magnitude] - order[b[1].magnitude]) || a[1].name.localeCompare(b[1].name));

// Digest slug -> site slug (Neon's artifact/image is "neon"). Used by the
// hero cards (out-link) and the showcase.
const SITE_SLUG = { n3on: 'neon' };
// One showcase tile: image + colored trend arrow, links to an in-page anchor.
function showcaseTile({ href, img, name, trend, title }) {
  const a = TREND[trend] || TREND.mixed;
  return `<a class="hx tr-${trend}" href="${href}" title="${esc(title)}">
            <span class="hx-imgwrap"><img loading="lazy" src="${img}" alt="" onerror="this.style.visibility='hidden'"><span class="hx-arrow">${a.icon}</span></span>
            <span class="hx-name">${esc(name)}</span>
          </a>`;
}

function heroCard([slug, p]) {
  const t = TREND[p.trend] || TREND.mixed;
  const m = MAG[p.magnitude] || MAG.minor;
  const changes = (p.changes || []).map((c) => `<li>${esc(c)}</li>`).join('');
  const simRead = p.topMetaBuild
    ? `<div class="sim-read">Sim read (pre-1.15): top field core <strong>${esc(p.topMetaBuild.title)}</strong> — ${esc((p.topMetaBuild.items || []).join(', '))}` +
      (p.topMetaBuild.shrunkWr ? ` · ${(p.topMetaBuild.shrunkWr * 100).toFixed(1)}% wr` : '') +
      (p.topMetaBuild.games ? ` · ${p.topMetaBuild.games.toLocaleString()} games` : '') + `</div>`
    : '';
  const site = SITE_SLUG[slug] || slug;
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
        <div class="pred"><span class="pred-label">Why</span>${esc(p.why)}</div>
        <div class="pred"><span class="pred-label">What it'll change</span>${esc(p.willChange)}</div>
        ${simRead}
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
      ${list.map(heroCard).join('')}`;
}).join('');

// Coach "meta read" callout for the bottom of a section (omitted if absent).
function metaRead(key) {
  const m = pred.sectionMeta && pred.sectionMeta[key];
  return m ? `\n      <div class="meta-read"><b>📈 Meta read</b>${esc(m)}</div>` : '';
}

// ── Hero showcase: clickable images with a colored trend arrow, ordered by
// magnitude then name; each jumps to that hero's card lower in this section.
const heroShowcase = `
      <div class="hx-legend"><span class="tr-buff">▲ buff</span><span class="tr-nerf">▼ nerf</span><span class="tr-mixed">◆ mixed</span><span class="hx-hint">tap a hero to jump to its changes</span></div>
      <div class="hx-grid">
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
const ADIR = {
  buff: { label: 'Buff', cls: 'trend-buff', icon: '▲' },
  nerf: { label: 'Nerf', cls: 'trend-nerf', icon: '▼' },
  mixed: { label: 'Mixed', cls: 'trend-mixed', icon: '◆' },
};
function aramHeroRow(h) {
  const d = ADIR[h.dir] || ADIR.mixed;
  return `<tr><td class="aram-h">${esc(h.name)}</td><td><span class="badge ${d.cls}">${d.icon} ${d.label}</span></td><td class="aram-c">${esc(h.change)}</td></tr>`;
}
const aramBlock = digest.aram ? `
      <h2 class="section" id="ch-aram">ARAM balance</h2>
      <p class="lead">${esc(digest.aram.summary || '')}</p>
      <h3 class="group-head">Systemic changes <span class="group-count">${(digest.aram.system || []).length}</span></h3>
      ${(digest.aram.system || []).map(aramSysCard).join('')}
      <h3 class="group-head">Per-hero ARAM tuning <span class="group-count">${(digest.aram.heroes || []).length} heroes</span></h3>
      <p class="lead" style="margin-bottom:0.6rem;">Mode-only multipliers (damage / healing / damage-received) — they do not touch the 5v5 kit numbers above.</p>
      <table class="et aram-table"><tbody>${(digest.aram.heroes || []).map(aramHeroRow).join('')}</tbody></table>${metaRead('aram')}
` : '';

const globalList = (digest.global || []).map((g) => `<li>${esc(g)}</li>`).join('');
// Eternals get the same treatment as heroes: a showcase grid of clickable
// images with a colored buff/nerf/shift arrow, then a card per Eternal.
const ETSLUG = (name) => name.toLowerCase();
const eternalShowcase = `
      <div class="hx-legend"><span class="tr-buff">▲ buff</span><span class="tr-nerf">▼ nerf</span><span class="tr-mixed">◆ mixed</span><span class="tr-rework">⟳ shift</span><span class="hx-hint">tap an Eternal to jump to its change</span></div>
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
  return `
      <div class="hero-card card" id="eternal-${ETSLUG(e.name)}" data-trend="${e.dir || 'mixed'}">
        <div class="hero-head">
          <img class="et-ic" loading="lazy" src="img/eternals/${ETSLUG(e.name)}.webp" alt="" onerror="this.style.display='none'">
          <span class="hero-name">${esc(e.name)}</span>
          <span class="badge ${t.cls}">${t.icon} ${t.label}</span>
        </div>
        <ul class="change-list"><li>${esc(e.change)}</li></ul>
        <div class="pred"><span class="pred-label">Meaning</span>${esc(e.meaning)}</div>
      </div>`;
}).join('');
const itemList = (digest.items || []).map((i) => `<li>${esc(i)}</li>`).join('');
// Items get the hero/Eternal treatment when structured itemChanges exist:
// a showcase grid of images with a colored trend arrow, then a card each.
const itemOrder = { new: 0, removed: 1, rework: 2, buff: 3, mixed: 4, nerf: 5 };
const itemChanges = (digest.itemChanges || []).slice()
  .sort((a, b) => (itemOrder[a.dir] ?? 9) - (itemOrder[b.dir] ?? 9) || a.name.localeCompare(b.name));
const itemShowcase = itemChanges.length ? `
      <div class="hx-legend"><span class="tr-new">✦ new</span><span class="tr-removed">✕ removed</span><span class="tr-rework">⟳ rework</span><span class="tr-buff">▲ buff</span><span class="tr-mixed">◆ mixed</span><span class="tr-nerf">▼ nerf</span><span class="hx-hint">tap an item to jump to its change</span></div>
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
        <div class="pred" style="margin:0">${esc(it.change)}</div>
      </div>`;
}).join('');
const sysList = (digest.systems || []).map((s) =>
  `<div class="sys"><div class="sys-name">${esc(s.name)}</div><div class="sys-sum">${esc(s.summary)}</div></div>`).join('');
const rankedBlock = digest.ranked ? `
      <h2 class="section" id="ch-ranked">Ranked</h2>
      <p class="lead">${esc(digest.ranked.summary || '')}</p>
      <ul class="items-list ranked-list">${(digest.ranked.changes || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>${metaRead('ranked')}
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
  { id: 'ch-systems', label: 'Systems & map' },
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
  <title>Predecessor Scout — Patch ${esc(version)} Overview</title>
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
    .aram-table td { padding: 0.35rem 0.6rem; }
    .aram-h { font-weight: 600; color: var(--text-0); white-space: nowrap; }
    .aram-c { color: var(--text-2); font-size: 0.78rem; }
    .items-list { list-style: none; padding: 0; }
    .items-list li { font-size: 0.82rem; color: var(--text-1); margin-bottom: 0.45rem; padding-left: 1.2rem; position: relative; }
    .items-list li::before { content: '⬡'; position: absolute; left: 0; color: var(--gold); }
    .sys { margin-bottom: 0.7rem; }
    .sys-name { font-weight: 600; font-size: 0.88rem; color: var(--text-0); }
    .sys-sum { font-size: 0.82rem; color: var(--text-1); margin-top: 0.15rem; line-height: 1.45; }
    .foot { margin-top: 2rem; font-size: 0.78rem; color: var(--text-2); border-top: 1px solid var(--border); padding-top: 1rem; }
    .foot a, .lead a { color: var(--accent); }
    html { scroll-behavior: smooth; }
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
    .ranked-list li::before { content: '🏆'; }
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
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <h1 class="logo">⚔ Predecessor Scout</h1>
      <div class="header-links">
        <a href="index.html" class="header-link">v1</a>
        <a href="v2/" class="header-link">v2</a>
        <a href="patch-notes.html" class="header-link">Tool changelog</a>
        <a href="learn-eternals.html" class="header-link">Learn Eternals</a>
      </div>
    </div>
  </header>
${subnavBar}

  <main id="app">
    <div class="patch">
      <h1 style="margin-bottom:0.25rem;">📋 Patch ${esc(version)} — Splash Damage</h1>
      <p class="lead">Released ${esc(digest.date)} · Scout overview &amp; sim-grounded predictions ·
        <a href="${esc(digest.source)}" target="_blank" rel="noopener">official notes ↗</a></p>

      <div class="banner">
        <strong>Heads up:</strong> these are <strong>predictions</strong>, not measured results. The engine's
        numeric base is still the pre-1.15 snapshot (2026-06-20), so the sim reads below are the <em>current</em>
        meta — every forecast is grounded in the patch's stated numbers. The full numeric re-sim (new hero stats,
        updated builds &amp; matchups) runs once 1.15 goes live on omeda.city.
      </div>

      <h2 class="section" id="ch-tldr">TL;DR — what actually changes how you play</h2>
      <ul class="tldr">${globalList}</ul>${metaRead('tldr')}

      <h2 class="section" id="ch-heroes">Hero changes <span style="font-size:0.7rem;color:var(--text-2);font-weight:500;">
        ${counts[0]} meta-shifting · ${counts[1]} notable · ${counts[2]} minor · bugfix-only heroes excluded</span></h2>
      ${heroShowcase}
      ${heroSections}${metaRead('heroes')}

      <h2 class="section" id="ch-eternals">Eternals (draft blessings)</h2>
      <p class="lead">${esc(digest.eternals?.summary || '')}</p>
      ${eternalShowcase}
      ${eternalCards}${metaRead('eternals')}

      <h2 class="section" id="ch-items">Items</h2>
      ${itemChanges.length ? `${itemShowcase}\n      ${itemCards}` : `<ul class="items-list">${itemList}</ul>`}${metaRead('items')}

      ${aramBlock}

      <h2 class="section" id="ch-systems">Systems &amp; map</h2>
      ${sysList}${metaRead('systems')}

      ${rankedBlock}

      <div class="foot">
        Generated from <code>data/patches/${esc(version)}.json</code> +
        <code>data/aggregates/patch-${esc(version)}-predictions.json</code> by
        <code>scripts/build-patch-page.js</code>. Predictions authored on session compute (no API) and
        grounded in the stated change numbers. Re-run after the go-live numeric refresh to replace forecasts
        with measured results.
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
  </script>
</body>
</html>
`;

const outPath = path.join(ROOT, `ui/patch-${version}.html`);
fs.writeFileSync(outPath, html);
console.log(`Wrote ${outPath} — ${heroes.length} hero predictions (${counts.join('/')} meta/notable/minor)`);
