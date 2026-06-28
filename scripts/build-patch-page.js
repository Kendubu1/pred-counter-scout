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
};

const order = { 'meta-shifting': 0, 'notable': 1, 'minor': 2 };
const heroes = Object.entries(pred.predictions)
  .sort((a, b) => (order[a[1].magnitude] - order[b[1].magnitude]) || a[1].name.localeCompare(b[1].name));

function heroCard([slug, p]) {
  const t = TREND[p.trend] || TREND.mixed;
  const m = MAG[p.magnitude] || MAG.minor;
  const changes = (p.changes || []).map((c) => `<li>${esc(c)}</li>`).join('');
  const simRead = p.topMetaBuild
    ? `<div class="sim-read">Sim read (pre-1.15): top field core <strong>${esc(p.topMetaBuild.title)}</strong> — ${esc((p.topMetaBuild.items || []).join(', '))}` +
      (p.topMetaBuild.shrunkWr ? ` · ${(p.topMetaBuild.shrunkWr * 100).toFixed(1)}% wr` : '') +
      (p.topMetaBuild.games ? ` · ${p.topMetaBuild.games.toLocaleString()} games` : '') + `</div>`
    : '';
  return `
      <div class="hero-card card" data-mag="${p.magnitude}" data-trend="${p.trend}">
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
      <h2 class="section">ARAM balance</h2>
      <p class="lead">${esc(digest.aram.summary || '')}</p>
      <h3 class="group-head">Systemic changes <span class="group-count">${(digest.aram.system || []).length}</span></h3>
      ${(digest.aram.system || []).map(aramSysCard).join('')}
      <h3 class="group-head">Per-hero ARAM tuning <span class="group-count">${(digest.aram.heroes || []).length} heroes</span></h3>
      <p class="lead" style="margin-bottom:0.6rem;">Mode-only multipliers (damage / healing / damage-received) — they do not touch the 5v5 kit numbers above.</p>
      <table class="et aram-table"><tbody>${(digest.aram.heroes || []).map(aramHeroRow).join('')}</tbody></table>
` : '';

const globalList = (digest.global || []).map((g) => `<li>${esc(g)}</li>`).join('');
const eternalRows = (digest.eternals?.changes || []).map((e) =>
  `<tr><td class=" et-name">${esc(e.name)}</td><td>${esc(e.change)}</td><td class=" et-mean">${esc(e.meaning)}</td></tr>`).join('');
const itemList = (digest.items || []).map((i) => `<li>${esc(i)}</li>`).join('');
const sysList = (digest.systems || []).map((s) =>
  `<div class="sys"><div class="sys-name">${esc(s.name)}</div><div class="sys-sum">${esc(s.summary)}</div></div>`).join('');

const counts = groups.map(([k]) => heroes.filter(([, p]) => p.magnitude === k).length);

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

      <h2 class="section">TL;DR — what actually changes how you play</h2>
      <ul class="tldr">${globalList}</ul>

      <h2 class="section">Hero predictions <span style="font-size:0.7rem;color:var(--text-2);font-weight:500;">
        ${counts[0]} meta-shifting · ${counts[1]} notable · ${counts[2]} minor · bugfix-only heroes excluded</span></h2>
      ${heroSections}

      <h2 class="section">Eternals (draft blessings)</h2>
      <p class="lead">${esc(digest.eternals?.summary || '')}</p>
      <table class="et"><tbody>${eternalRows}</tbody></table>

      <h2 class="section">Items</h2>
      <ul class="items-list">${itemList}</ul>

      ${aramBlock}

      <h2 class="section">Systems &amp; map</h2>
      ${sysList}

      <div class="foot">
        Generated from <code>data/patches/${esc(version)}.json</code> +
        <code>data/aggregates/patch-${esc(version)}-predictions.json</code> by
        <code>scripts/build-patch-page.js</code>. Predictions authored on session compute (no API) and
        grounded in the stated change numbers. Re-run after the go-live numeric refresh to replace forecasts
        with measured results.
      </div>
    </div>
  </main>
</body>
</html>
`;

const outPath = path.join(ROOT, `ui/patch-${version}.html`);
fs.writeFileSync(outPath, html);
console.log(`Wrote ${outPath} — ${heroes.length} hero predictions (${counts.join('/')} meta/notable/minor)`);
