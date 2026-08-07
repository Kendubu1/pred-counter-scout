#!/usr/bin/env node
// Add/refresh the `measured` block on a patch predictions file from pred.gg
// generalStatistic pulls (raw counts, so version windows add and subtract).
//
//   node scripts/build-measured.js 1.15.3
//
// Baseline (old) = family file minus the patch-window files (exact count
// arithmetic: pre-patch portion of the family). Now = the patch-window files
// summed. Zero API calls — reads only committed aggregates.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const version = process.argv[2] || '1.15.3';

const predPath = path.join(ROOT, `data/aggregates/patch-${version}-predictions.json`);
const pred = JSON.parse(fs.readFileSync(predPath, 'utf8'));
const family = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/aggregates/predgg-general-stats.json'), 'utf8'));
// Every pinned per-version file that belongs to this patch's live window.
const windowFiles = fs.readdirSync(path.join(ROOT, 'data/aggregates'))
  .filter((f) => f.startsWith('predgg-general-stats-1.15.') && f.endsWith('.json'))
  .filter((f) => {
    const v = f.replace('predgg-general-stats-', '').replace('.json', '');
    return v.localeCompare(version, undefined, { numeric: true }) >= 0;
  });
if (!windowFiles.length) { console.error('no pinned window files found'); process.exit(1); }
const windows = windowFiles.map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/aggregates', f), 'utf8')));
console.log(`window files: ${windowFiles.join(', ')} | baseline = family minus window`);

const MIN_N = 200; // per side, same bar as the 1.15 scorecard

function cell(fileHeroes, slug) {
  const h = fileHeroes[slug];
  return h && h.overall ? { n: h.overall.matchesPlayed, w: h.overall.matchesWon } : { n: 0, w: 0 };
}

const perHero = {};
const allSlugs = Object.keys(family.heroes);
for (const slug of allSlugs) {
  const fam = cell(family.heroes, slug);
  let winN = 0, winW = 0;
  for (const w of windows) { const c = cell(w.heroes, slug); winN += c.n; winW += c.w; }
  const oldN = fam.n - winN, oldW = fam.w - winW;
  const now = winN ? +(100 * winW / winN).toFixed(1) : null;
  const old = oldN ? +(100 * oldW / oldN).toFixed(1) : null;
  const enough = winN >= MIN_N && oldN >= MIN_N;
  perHero[slug] = {
    old: enough ? old : old, now, n: winN,
    delta: enough && old != null && now != null ? +(now - old).toFixed(1) : null,
  };
}

const predicted = Object.entries(pred.predictions).filter(([, p]) => p.trend === 'buff' || p.trend === 'nerf');
let right = 0, counted = 0;
for (const [slug, p] of predicted) {
  const m = perHero[slug];
  if (!m || m.delta == null) continue;
  counted++;
  if ((p.trend === 'buff' && m.delta > 0) || (p.trend === 'nerf' && m.delta < 0)) right++;
}

const movers = Object.entries(perHero)
  .filter(([, m]) => m.delta != null)
  .map(([slug, m]) => ({ slug, ...m }));
const risers = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 6);
const fallers = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 6);

pred.measured = {
  source: `pred.gg generalStatistic (RANKED): pre-patch baseline = 1.15 family minus the ${version}+ window; patch window = ${windows.map((w) => w.versionLabel).join(' + ')} (n>=${MIN_N} both sides for deltas). The 1.15.4 balance hotfix sits inside the window (no official notes published for it).`,
  patchDate: '2026-07-21',
  scorecard: { predicted: counted, directionallyRight: right },
  risers, fallers,
  newHeroes: [],
  perHero,
};
fs.writeFileSync(predPath, JSON.stringify(pred, null, 1) + '\n');
console.log(`scorecard: ${right}/${counted} directionally right`);
console.log('risers:', risers.map((r) => `${r.slug} +${r.delta}`).join(', '));
console.log('fallers:', fallers.map((r) => `${r.slug} ${r.delta}`).join(', '));
console.log(`wrote measured block -> ${path.relative(ROOT, predPath)}`);
