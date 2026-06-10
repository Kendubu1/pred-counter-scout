#!/usr/bin/env node
// Validates the KitEngine power model against observed win rates.
//
// The kit model predicts hero strength from ability data alone (no win
// rates). This script checks how well that prediction lines up with
// reality: each hero's matches-weighted win rate pooled from scraped
// head-to-head counter data. Run after every patch/data refresh:
//
//   node scripts/validate-kit-model.js [data-dir]   (default: newest data/<date>/)
//
// Reports Pearson/Spearman correlation and the biggest deviations —
// "kit says strong, WR says weak" (sleepers / hard-to-pilot) and the
// reverse (overperformers / stat-check heroes).

const fs = require('fs');
const path = require('path');
const KitEngine = require('../ui/kit-engine.js');

const ROOT = path.join(__dirname, '..');

function newestDataDir() {
  const dirs = fs.readdirSync(path.join(ROOT, 'data'))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return path.join(ROOT, 'data', dirs[dirs.length - 1]);
}

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function observedWinRates(dataDir) {
  const out = {};
  for (const f of fs.readdirSync(dataDir)) {
    if (!f.endsWith('.json')) continue;
    const hero = loadJSON(path.join(dataDir, f));
    let wrSum = 0, n = 0;
    for (const rd of Object.values(hero.roles || {})) {
      for (const c of (rd.counters || [])) {
        const m = c.matches || 0;
        if (m < 5) continue;
        wrSum += c.winRate * m;
        n += m;
      }
    }
    if (n >= 100) out[hero.slug] = { wr: wrSum / n, samples: n };
  }
  return out;
}

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}

function ranks(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  idx.forEach(([_, i], rank) => { r[i] = rank; });
  return r;
}

function main() {
  const dataDir = process.argv[2] ? path.resolve(process.argv[2]) : newestDataDir();
  const profiles = loadJSON(path.join(ROOT, 'data/game-data/hero-profiles.json'));
  const abilities = loadJSON(path.join(ROOT, 'data/game-data/hero-abilities.json'));
  KitEngine.init(profiles, abilities);

  const observed = observedWinRates(dataDir);
  const rows = [];
  for (const [slug, obs] of Object.entries(observed)) {
    const kit = KitEngine.getProfile(slug);
    if (!kit) continue;
    rows.push({ slug, name: kit.name, kitPower: kit.kitPower, wr: obs.wr, samples: obs.samples });
  }
  if (rows.length < 10) { console.error('Not enough heroes with observed WR data in', dataDir); process.exit(1); }

  const xs = rows.map(r => r.kitPower), ys = rows.map(r => r.wr);
  const p = pearson(xs, ys);
  const s = pearson(ranks(xs), ranks(ys));

  console.log(`Data: ${dataDir}  (${rows.length} heroes, 100+ matchup games each)`);
  console.log(`Pearson r = ${p.toFixed(3)}   Spearman ρ = ${s.toFixed(3)}\n`);

  // Deviation = z(kitPower) - z(wr)
  const z = v => { const m = v.reduce((a, b) => a + b, 0) / v.length; const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); return x => (x - m) / sd; };
  const zk = z(xs), zw = z(ys);
  rows.forEach(r => { r.dev = zk(r.kitPower) - zw(r.wr); });

  rows.sort((a, b) => b.kitPower - a.kitPower);
  console.log('hero                 kitPower   obsWR    games   dev');
  for (const r of rows) {
    console.log(`${r.name.padEnd(20)} ${String(r.kitPower).padStart(8)} ${r.wr.toFixed(1).padStart(7)}% ${String(r.samples).padStart(7)}  ${r.dev >= 0 ? '+' : ''}${r.dev.toFixed(2)}`);
  }

  const over = [...rows].sort((a, b) => a.dev - b.dev).slice(0, 5);
  const under = [...rows].sort((a, b) => b.dev - a.dev).slice(0, 5);
  console.log('\nOverperformers (WR above what the kit predicts — stat-checkers / easy to pilot):');
  over.forEach(r => console.log(`  ${r.name}: kit ${r.kitPower}, WR ${r.wr.toFixed(1)}%`));
  console.log('\nUnderperformers (kit predicts more than WR shows — sleepers / hard to pilot):');
  under.forEach(r => console.log(`  ${r.name}: kit ${r.kitPower}, WR ${r.wr.toFixed(1)}%`));

  // ── Matchup forecast model (KitEngine.predictMatchup) vs observed pairs ──
  const nameToSlug = {};
  profiles.forEach(p => { nameToSlug[p.name.toLowerCase()] = p.slug; });
  const pairs = [];
  for (const f of fs.readdirSync(dataDir)) {
    if (!f.endsWith('.json')) continue;
    const hero = loadJSON(path.join(dataDir, f));
    for (const rd of Object.values(hero.roles || {})) {
      for (const c of (rd.counters || [])) {
        if ((c.matches || 0) < 20) continue;
        const enemy = nameToSlug[c.hero.toLowerCase()];
        if (!enemy || !KitEngine.getProfile(enemy) || !KitEngine.getProfile(hero.slug)) continue;
        pairs.push({ a: hero.slug, b: enemy, wr: c.winRate });
      }
    }
  }
  const preds = [], actuals = [];
  let correct = 0, decided = 0;
  for (const p of pairs) {
    const f = KitEngine.predictMatchup(p.a, p.b);
    if (!f) continue;
    preds.push(f.predictedWR); actuals.push(p.wr);
    if (Math.abs(p.wr - 50) >= 2) {
      decided++;
      if (Math.sign(f.predictedWR - 50) === Math.sign(p.wr - 50)) correct++;
    }
  }
  console.log(`\nMatchup forecast model vs ${preds.length} observed head-to-head pairs (20+ games):`);
  console.log(`  r = ${pearson(preds, actuals).toFixed(3)}   direction accuracy (decided matchups): ${(100 * correct / decided).toFixed(1)}%`);
  console.log(`  baked-in validation: holdout r = ${KitEngine.MATCHUP_MODEL.validation.holdoutR}, calibrated on ${KitEngine.MATCHUP_MODEL.validation.data}`);
  console.log('  If r drops well below the baked-in number after a data refresh, recalibrate MATCHUP_MODEL coefficients.');
}

main();
