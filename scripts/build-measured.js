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
const AGG = path.join(ROOT, 'data/aggregates');
const read = (f) => JSON.parse(fs.readFileSync(path.join(AGG, f), 'utf8'));
const verOf = (f) => f.replace('predgg-general-stats-', '').replace('.json', '');
const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });

// The window runs from this patch until the NEXT REVIEWED patch (a patch with
// its own digest). Unlisted hotfixes in between — 1.15.4 inside 1.15.3's era —
// belong to this patch's window; the next reviewed patch does not.
const nextReviewed = fs.readdirSync(path.join(ROOT, 'data/patches'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''))
  .filter((v) => cmp(v, version) > 0)
  .sort(cmp)[0] ?? null;

// Every version-pinned stats file, split around this patch's window.
const pinned = fs.readdirSync(AGG)
  .filter((f) => /^predgg-general-stats-[\d.]+\.json$/.test(f))
  .sort((a, b) => cmp(verOf(a), verOf(b)));
const inWindow = (f) => cmp(verOf(f), version) >= 0 && (!nextReviewed || cmp(verOf(f), nextReviewed) < 0);
const windowFiles = pinned.filter(inWindow);
const priorFiles = pinned.filter((f) => cmp(verOf(f), version) < 0);
if (!windowFiles.length) { console.error(`no pinned stats file at or after ${version} — run \`VERSIONS=<id> OUT=data/aggregates/predgg-general-stats-${version}.json npm run genstats\` first`); process.exit(1); }
const windows = windowFiles.map(read);

// Baseline: prefer explicit pre-patch pinned files (exact, no arithmetic). Fall
// back to family-minus-window when the pre-patch period was only ever captured
// inside the rolling family file (how the 1.15.3 scorecard was built).
const priors = priorFiles.map(read);
const family = priors.length ? null : read('predgg-general-stats.json');
const baselineNote = priors.length
  ? `pinned pre-patch files ${priorFiles.map(verOf).join(' + ')}`
  : 'the rolling family file minus the patch window';
console.log(`window: ${windowFiles.map(verOf).join(' + ')} | baseline: ${baselineNote}`);

const MIN_N = 200; // per side, same bar as the 1.15 scorecard

function cell(fileHeroes, slug) {
  const h = fileHeroes[slug];
  return h && h.overall ? { n: h.overall.matchesPlayed, w: h.overall.matchesWon } : { n: 0, w: 0 };
}

const perHero = {};
const allSlugs = Object.keys((family ?? windows[0]).heroes);
for (const slug of allSlugs) {
  let winN = 0, winW = 0;
  for (const w of windows) { const c = cell(w.heroes, slug); winN += c.n; winW += c.w; }
  // Baseline: sum the pre-patch pinned files directly, or subtract the window
  // out of the rolling family file when no pre-patch file was ever pinned.
  let oldN, oldW;
  if (priors.length) {
    oldN = 0; oldW = 0;
    for (const p of priors) { const c = cell(p.heroes, slug); oldN += c.n; oldW += c.w; }
  } else {
    const fam = cell(family.heroes, slug);
    oldN = fam.n - winN; oldW = fam.w - winW;
  }
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

// Refuse to publish a scorecard the data cannot support: a freshly released
// patch has far too few games for n>=MIN_N deltas, and a page that flips into
// "measured" mode on three heroes reads as fact when it is noise.
const MIN_GRADED = 8;
if (counted < MIN_GRADED && !process.env.FORCE) {
  const windowGames = Object.values(perHero).reduce((s, m) => s + m.n, 0);
  console.error(`too early: only ${counted} of ${predicted.length} directional predictions have n>=${MIN_N} on both sides (window holds ~${Math.round(windowGames / 10).toLocaleString()} ranked matches).`);
  console.error(`Re-run once the patch has more games, or set FORCE=1 to write it anyway.`);
  process.exit(2);
}

const movers = Object.entries(perHero)
  .filter(([, m]) => m.delta != null)
  .map(([slug, m]) => ({ slug, ...m }));
const risers = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 6);
const fallers = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 6);

pred.measured = {
  source: `pred.gg generalStatistic (RANKED): pre-patch baseline = ${baselineNote}; patch window = ${windows.map((w) => w.versionLabel).join(' + ')} (n>=${MIN_N} both sides for deltas). Any unlisted hotfix released inside the window is measured as part of it.`,
  patchDate: JSON.parse(fs.readFileSync(path.join(ROOT, `data/patches/${version}.json`), 'utf8')).date,
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
