// Fork in the Road PROOF OF CONCEPT, step 2: compute forks from the local
// extract (fork-poc-pull.ts) and write data/aggregates/fork-poc.json. Zero-API.
//
//   npm run fork:poc
//
// Prints the validation block first (known-answer interactions + placebo),
// then the strongest observed forks. See docs/fork-in-the-road.md.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRows, computeForks, groupItems, interaction, learnLabels, orderForks, shuffleOppType,
  type ForkCell, type ForkMatch,
} from '../forks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROWS = path.join(ROOT, 'engine/copy-tasks/fork-poc/rows.jsonl');
const OUT = path.join(ROOT, 'data/aggregates/fork-poc.json');
// PoC floors (the design's 150/300 assume a full patch window; this is ~3 days)
const MIN_OPTION = Number(process.env.MIN_OPTION ?? 60);
const MIN_OPTION_OPP = Number(process.env.MIN_OPTION_OPP ?? 40);
const MIN_ORDER = Number(process.env.MIN_ORDER ?? 40);
const PLACEBO_RUNS = 20;
// validation pools across heroes, so it can use thinner per-cell options
const VAL_MIN = Number(process.env.VAL_MIN ?? 20);

const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`;

function main() {
  const all = readFileSync(ROWS, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as ForkMatch);
  // never pool across versions: keep the dominant one
  const byVersion = new Map<string, number>();
  for (const m of all) byVersion.set(m.version, (byVersion.get(m.version) ?? 0) + 1);
  const version = [...byVersion].sort((a, b) => b[1] - a[1])[0]![0];
  const matches = all.filter((m) => m.version === version);
  const items = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')) as { slug: string; display_name: string; rarity: string | null; slot_type: string | null; stats: Record<string, number>; effects: { menu_description?: string }[] }[];
  const epic = items.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive');
  const name = new Map(items.map((i) => [i.slug, i.display_name]));
  const mr = new Set(epic.filter((i) => i.stats.magical_armor && !i.stats.physical_armor).map((i) => i.slug));
  const pa = new Set(epic.filter((i) => i.stats.physical_armor && !i.stats.magical_armor).map((i) => i.slug));
  const antiHeal = new Set(epic.filter((i) => i.effects.some((e) => /Reduce (the|their)[^.]*Healing/i.test(e.menu_description ?? ''))).map((i) => i.slug));

  const labels = learnLabels(matches);
  const rows = buildRows(matches, labels, 3);
  const ctxOk = (c: string) => c === 'all' || c.startsWith('oppType:') || c.startsWith('opp:') || c === 'enemyHeal:high' || c === 'enemyHeal:low';
  const cells = computeForks(rows, { minOption: MIN_OPTION, minOptionOpp: MIN_OPTION_OPP, contexts: ctxOk });

  // ── validation ──
  // 1. labels mean something: do players buy more magical armor into magical lane opponents?
  // compared WITHIN each hero-role (pooling across roles mixes carry lanes, where nobody buys armor, with the rest),
  // then averaged with the smaller side's row count as weight
  const later = rows.filter((r) => r.slot >= 2);
  const byHR = new Map<string, typeof later>();
  for (const r of later) (byHR.get(`${r.hero}|${r.role}`) ?? byHR.set(`${r.hero}|${r.role}`, []).get(`${r.hero}|${r.role}`)!).push(r);
  const buyRate = (set: Set<string>, a: string, b: string) => {
    let wa = 0, wb = 0, wt = 0;
    for (const rs of byHR.values()) {
      const A = rs.filter((r) => r.ctx.includes(a)), B = rs.filter((r) => r.ctx.includes(b));
      if (A.length < 20 || B.length < 20) continue;
      const w = Math.min(A.length, B.length);
      wa += w * A.filter((r) => set.has(r.item)).length / A.length; wb += w * B.filter((r) => set.has(r.item)).length / B.length; wt += w;
    }
    return wt ? [wa / wt, wb / wt] as const : [0, 0] as const;
  };
  const [mrM, mrP] = buyRate(mr, 'oppType:magical', 'oppType:physical');
  const [paP, paM] = buyRate(pa, 'oppType:physical', 'oppType:magical');
  const [ahH, ahL] = buyRate(antiHeal, 'enemyHeal:high', 'enemyHeal:low');
  const react = {
    magicalArmorRate: { vsMagical: mrM, vsPhysical: mrP },
    physicalArmorRate: { vsMagical: paM, vsPhysical: paP },
    antiHealRate: { vsHighHeal: ahH, vsLowHeal: ahL },
  };
  // 2. known answers on outcomes: item delta in the matching context minus the opposite one
  // each item group pooled into one option per cell, so the check has power
  const valCells = (group: Set<string>, label: string, ctx: string) => computeForks(groupItems(rows, group, label), { minOption: VAL_MIN, minOptionOpp: Infinity, contexts: (c) => c.startsWith(ctx) });
  const known = {
    magicalArmorVsMagical: interaction(valCells(mr, '#mr', 'oppType:'), new Set(['#mr']), 'oppType:magical', 'oppType:physical'),
    physicalArmorVsPhysical: interaction(valCells(pa, '#pa', 'oppType:'), new Set(['#pa']), 'oppType:physical', 'oppType:magical'),
    antiHealVsHealers: interaction(valCells(antiHeal, '#ah', 'enemyHeal:'), new Set(['#ah']), 'enemyHeal:high', 'enemyHeal:low'),
  };
  // 3. placebo: shuffle the opponent type, the magical-armor interaction should vanish
  const placebo: number[] = [];
  for (let s = 1; s <= PLACEBO_RUNS; s++) {
    const shuffled = computeForks(shuffleOppType(groupItems(rows, mr, '#mr'), s), { minOption: VAL_MIN, minOptionOpp: Infinity, contexts: (c) => c.startsWith('oppType:') });
    placebo.push(interaction(shuffled, new Set(['#mr']), 'oppType:magical', 'oppType:physical').estimate);
  }
  const pMean = placebo.reduce((a, b) => a + b, 0) / placebo.length;
  const pSd = Math.sqrt(placebo.reduce((a, b) => a + (b - pMean) ** 2, 0) / placebo.length);
  const beatsPlacebo = placebo.filter((x) => x >= known.magicalArmorVsMagical.estimate).length;

  // naive vs adjusted: how much the state adjustment moves deltas, on average
  const allOpts = cells.filter((c) => c.ctx === 'all').flatMap((c) => c.options);
  const meanAbsShift = allOpts.reduce((s, o) => s + Math.abs(o.naive - o.adjusted), 0) / Math.max(1, allOpts.length);
  // does the adjustment pull defensive items up (bought from behind)? mean (adjusted - naive) on armor items
  const def = allOpts.filter((o) => mr.has(o.item) || pa.has(o.item));
  const defShift = def.reduce((s, o) => s + (o.adjusted - o.naive), 0) / Math.max(1, def.length);

  const orders = orderForks(rows, MIN_ORDER, (c) => c === 'all' || c === 'enemyHeal:high' || c.startsWith('oppType:'));

  const label = (c: ForkCell) => `${c.hero} ${c.role} slot ${c.slot} [${c.ctx}]`;
  console.log(`version ${version}: ${matches.length} ranked matches (${all.length - matches.length} other-version dropped), ${rows.length} player-slot rows, ${cells.length} fork cells`);
  const r2 = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log('\nVALIDATION');
  console.log(`  players react: magical armor bought ${r2(react.magicalArmorRate.vsMagical)} vs magical opp, ${r2(react.magicalArmorRate.vsPhysical)} vs physical; physical armor ${r2(react.physicalArmorRate.vsPhysical)} vs physical, ${r2(react.physicalArmorRate.vsMagical)} vs magical; anti-heal ${r2(react.antiHealRate.vsHighHeal)} vs high-heal teams, ${r2(react.antiHealRate.vsLowHeal)} vs low`);
  console.log('  known answers (adjusted win-% pts, matching context minus opposite; should be > 0):');
  for (const [k, v] of Object.entries(known)) console.log(`  ${k.padEnd(26)} ${pct(v.estimate)} ± ${(v.se * 100).toFixed(1)} (${v.pairs} item-cell pairs)`);
  console.log(`  placebo (shuffled opp type) ${pct(pMean)} ± ${(pSd * 100).toFixed(1)}; real beats ${PLACEBO_RUNS - beatsPlacebo}/${PLACEBO_RUNS} shuffles`);
  console.log(`  adjustment moves deltas by ${(meanAbsShift * 100).toFixed(1)} pts on average; armor items move ${pct(defShift)} (> 0 would mean armor is mostly bought from behind)`);

  const shown = cells.flatMap((c) => c.options.filter((o) => o.confidence !== 'noise').map((o) => ({ c, o })));
  console.log(`\n${shown.length} options clear "likely" or better across ${cells.length} cells. Strongest context forks:`);
  for (const { c, o } of shown.filter((x) => x.c.ctx !== 'all').sort((a, b) => Math.abs(b.o.shrunk) - Math.abs(a.o.shrunk)).slice(0, 25)) {
    console.log(`  ${label(c).padEnd(48)} ${(name.get(o.item) ?? o.item).padEnd(22)} ${pct(o.shrunk)} [${pct(o.lo)}, ${pct(o.hi)}] ${o.confidence.padEnd(6)} n=${o.n} naive ${pct(o.naive)}${o.swing != null ? ` swing ${o.swing >= 0 ? '+' : ''}${o.swing.toFixed(2)}` : ''}`);
  }
  console.log(`\nOrder forks (1st vs 2nd) that clear "likely":`);
  for (const f of orders.filter((f) => f.confidence !== 'noise').sort((a, b) => Math.abs(b.shrunk) - Math.abs(a.shrunk)).slice(0, 15)) {
    console.log(`  ${f.hero} ${f.role} [${f.ctx}] ${name.get(f.item) ?? f.item}: 1st ${pct(f.shrunk)} vs 2nd [${pct(f.lo)}, ${pct(f.hi)}] (raw ${pct(f.adjusted)}, n ${f.early.n}/${f.late.n}) ${f.confidence}`);
  }

  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: 'PROOF OF CONCEPT — short window, lowered floors; see docs/fork-in-the-road.md',
    source: `pred.gg public match stream, RANKED, game version ${version}, ${matches.length} matches`,
    method: 'slot-k item options compared at the same team x lane gold state at decision time (standardized), shrunk toward the parent context; win-% deltas as fractions; swing = (K-D) 5 min after completion minus 5 min before, vs the cell',
    floors: { minOption: MIN_OPTION, minOptionOpp: MIN_OPTION_OPP, minOrder: MIN_ORDER },
    labels: { typeCut: 'magical share of hero damage >= 0.6 magical, <= 0.4 physical', heroRoles: Object.fromEntries([...labels.type]) },
    validation: { react, known, placebo: { runs: PLACEBO_RUNS, mean: pMean, sd: pSd, realBeats: PLACEBO_RUNS - beatsPlacebo }, meanAbsShift, armorShift: defShift },
    cells: cells.map((c) => ({ ...c, options: c.options.map((o) => ({ ...o, name: name.get(o.item) ?? o.item })) })),
    orderForks: orders.map((f) => ({ ...f, name: name.get(f.item) ?? f.item })),
  }));
  console.log(`\n-> ${path.relative(ROOT, OUT)}`);
}

main();
