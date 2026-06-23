// CLI: print The Answer artifact for a hero. Usage:
//   npm run answer -- gideon [--level 13] [--anti-heal] [--budget 12000] [--role support]
//                            [--augment <name|id>] [--no-steer]

import { loadData, completedItems } from './data.js';
import { loadCalibration, unverifiedConstants, simulate, skillPriority, manaSustain, stagedManaAdequacy } from './sim.js';
import { generateBuilds, headlineObjective, type ObjKey } from './search.js';
import { rankAugments, rankBlessings, selectEternalLoadout } from './eternals.js';
import { heroGames, itemPlayRate } from './aggregates.js';
import { itemWinDelta } from './evidence.js';
import { matchupCheckpoints } from './matchup.js';
import { classifyAugment, fuseSteer, kitPlaystyle, laneTopAugment, playstyleObjectives, type KitPlaystyle, type LaneAugment } from './playstyle.js';
import { robustnessOf } from './robustness.js';
import { agreeWithField } from './agreement.js';
import { loadEffects } from './effects.js';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
if (!slug) {
  console.error('usage: npm run answer -- <hero-slug> [--level N] [--anti-heal] [--budget N]');
  process.exit(1);
}
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};

const data = loadData();
const cal = loadCalibration();
const kit = data.kits.get(slug);
if (!kit) {
  console.error(`No kit for "${slug}". Known slugs include: ${[...data.kits.keys()].slice(0, 8).join(', ')}…`);
  process.exit(1);
}

const level = opt('level') ?? 13;
const strOpt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const role = strOpt('role') ?? kit.roles[0] ?? 'midlane';
const unverified = unverifiedConstants(cal);
console.log(`# ${kit.name} (${kit.damageType}, ${kit.attackType}) — ${role}, level ${level}, patch ${cal.patch}`);
if (role === 'support') {
  console.log('support objectives in play: heal/shield output, survivability, poke, utility (one-beneficiary convention; passive heals not counted)');
}
console.log(`confidence: THEORY (sim-only; unverified constants in play: ${unverified.join(', ')})`);
if (kit.abilitySource === 'mixed') {
  const stale = data.staleFallbacks.filter((s) => s.slug === slug).map((s) => s.key);
  console.log(`data note: ${stale.join(', ')} use stale owned numbers (current text did not parse)`);
}
if (data.derivedProfiles.includes(slug)) {
  console.log('data note: profile derived from omeda data (no curated owned profile yet)');
}
console.log('');

const prio = skillPriority(kit);
console.log(`skill max order: ${prio.map((a) => a.name).join(' > ')} (ult at 6/11/16)`);

// ── Augment-as-playstyle steer (expose what the sim can't see) ──
// The lane's chosen augment declares a playstyle; we steer the build toward
// that objective corner — even when the augment's own mechanic is unmodeled —
// and print the provenance so the gap is exposed, not silent.
let objectiveBias: ObjKey[] | undefined;
let headlineOverride: ObjKey | undefined;
let provenance: string[] = [];
if (!flag('no-steer')) {
  const augName = strOpt('augment');
  let chosen: LaneAugment | null = null;
  if (augName) {
    // resolve an explicit augment name/id within this lane's evidence, falling
    // back to any lane the hero is recorded in
    const reg = loadEffects();
    const hit = Object.entries(reg.targets).find(([k, v]) =>
      k.startsWith(`augment:${slug}:`) && (k.endsWith(`:${augName}`) || v.name.toLowerCase().includes(augName.toLowerCase())));
    const id = (hit ? hit[0].split(':')[2] : augName) ?? augName;
    const lane = laneTopAugment(slug, role);
    chosen = lane && lane.id === id ? lane
      : { id, name: hit ? hit[1].name.split(' / ').slice(1).join(' / ') || hit[1].name : augName, lane: role, n: 0, w: 0, wr: 0, shrunkWr: 0 };
  } else {
    chosen = laneTopAugment(slug, role);
  }
  if (chosen) {
    const cls = classifyAugment(`augment:${slug}:${chosen.id}`);
    if (cls.playstyle) {
      objectiveBias = playstyleObjectives(cls.playstyle, kit);
      headlineOverride = objectiveBias[0];
      const ev = chosen.n > 0 ? ` — field ${role} ${(chosen.wr * 100).toFixed(1)}% over ${chosen.n.toLocaleString()} games` : '';
      provenance.push(`augment steer: "${chosen.name}" ⇒ ${cls.playstyle} playstyle (${cls.why})${ev}`);
      provenance.push(cls.modeled
        ? `  the sim MODELS this augment's effect — build reflects both its math and the playstyle.`
        : `  the sim CANNOT model this augment's effect — build is steered by the declared playstyle + field evidence, magnitude not simulated.`);
      provenance.push(`  steering the build toward: ${objectiveBias.join(', ')}  (use --no-steer to disable)`);
    }
  }
}
// ── Kit-derived playstyle (slice, behind --playstyle) ──
// Fuses the first-principles kit lean with the field's lane augment. Gated to the
// Gideon vertical slice so the other 51 heroes are untouched.
const PLAYSTYLE_SLICE = new Set(['gideon', 'zinx']);
let kitPs: KitPlaystyle | undefined;
if (flag('playstyle') && PLAYSTYLE_SLICE.has(slug)) {
  kitPs = kitPlaystyle(kit, role);
  const fused = fuseSteer(kitPs, laneTopAugment(slug, role), kit);
  objectiveBias = fused.bias;
  headlineOverride = fused.bias[0];
  provenance = [
    `kit playstyle: ${kitPs.primary}${kitPs.secondary ? ` / ${kitPs.secondary}` : ''} (confidence ${kitPs.confidence})`,
    ...kitPs.evidence.map((e) => `  ${e}`),
    `fused steer [${fused.agreement}]: ${fused.note}`,
    `  steering toward: ${objectiveBias.join(', ')}`,
  ];
}

if (provenance.length) console.log('\n' + provenance.join('\n'));

const builds = generateBuilds(kit, completedItems(data), cal, {
  level,
  role,
  scenario: { requireAntiHeal: flag('anti-heal'), goldBudget: opt('budget') },
  objectiveBias,
  headlineOverride,
});

console.log(`\nPareto front (${builds.length} builds):\n`);
for (const b of builds.slice(0, 6)) {
  console.log(`[${b.archetypes.join(', ') || 'balanced'}] ${b.gold}g${b.manaFeasible ? '' : '  ⚠ mana-infeasible rotation'}`);
  console.log(`  ${b.items.join(' > ')}`);
  const o = b.objectives;
  const supportCols = role === 'support'
    ? ` | heal+shield10s ${o.healShield10s.toFixed(0)} | utility ${o.utility.toFixed(0)}`
    : '';
  console.log(
    `  burst ${o.burstVsSquishy.toFixed(0)} | rot10 ${o.rot10VsSquishy.toFixed(0)} | rot20-vs-bruiser ${o.rot20VsBruiser.toFixed(0)}` +
    ` | autoDPS ${o.autoDps10VsSquishy.toFixed(0)} | eHP ${o.ehpPhysical.toFixed(0)}/${o.ehpMagical.toFixed(0)}${supportCols}\n`,
  );
}

// Play rates + shrunk evidence: the off-meta gate's signals (live data).
const games = heroGames(slug);
if (games >= 30 && builds[0]) {
  const rates = builds[0].items.map((n) => {
    const gameId = data.items.get(n)?.gameId ?? null;
    const r = itemPlayRate(slug, gameId);
    const ev = itemWinDelta(slug, gameId);
    const evTxt = ev ? ` ${ev.delta >= 0 ? '+' : ''}${(ev.delta * 100).toFixed(1)}wr n=${ev.n}` : '';
    return r == null ? `${n} (?)` : `${n} (${(r * 100).toFixed(0)}%${evTxt}${r < 0.02 ? ' UNDEREXPLORED' : ''})`;
  });
  console.log(`play rates + shrunk WR delta on ${kit.name}, ${games} games this patch (evidence only; finished-inventory bias skews deltas positive):\n  ${rates.join(', ')}\n`);
}

// Eternals: marginal math on top of the headline build.
const top = builds[0];
if (top) {
  const topItems = top.items.map((n) => data.items.get(n)!).filter(Boolean);
  const ranked = rankBlessings(kit, topItems, level, cal, { minute: opt('minute') });
  console.log('Eternal majors, math-ranked on the headline build' + (opt('minute') == null ? ' (minute 0; pass --minute for time scaling)' : '') + ':');
  for (const r of ranked.filter((r) => r.modeled).slice(0, 3)) {
    const d = r.deltas!;
    console.log(`  ${r.name}: headline ${d.rot10Pct >= d.autoDpsPct ? `rot10 +${d.rot10Pct.toFixed(1)}%` : `autoDPS +${d.autoDpsPct.toFixed(1)}%`} | burst +${d.burstPct.toFixed(1)}% | rot20 +${d.rot20Pct.toFixed(1)}% | eHP +${d.ehpPct.toFixed(1)}%`);
  }
  const unmodeled = ranked.filter((r) => !r.modeled);
  if (unmodeled.length) console.log(`  no math yet (honest list): ${unmodeled.map((r) => r.name.replace(' (Major)', '')).join(', ')}`);

  // Hero augments: same marginal math over the curated catalog encodings.
  const augs = rankAugments(kit, topItems, level, cal, { minute: opt('minute') });
  if (augs.length) {
    console.log('\nHero augments, math-ranked on the headline build:');
    for (const a of augs.filter((x) => x.modeled)) {
      const d = a.deltas!;
      const best = ([[d.rot10Pct, 'rot10'], [d.rot20Pct, 'rot20'], [d.burstPct, 'burst'], [d.autoDpsPct, 'autoDPS'], [d.ehpPct, 'eHP'], [d.healShieldPct, 'heal/shield']] as [number, string][])
        .sort((x, y) => y[0] - x[0])[0]!;
      const shieldAbs = d.healShieldPct === 0 && d.healShieldAbs > 0 ? ` | adds ~${Math.round(d.healShieldAbs)} HP of heal/shield per 10s` : '';
      console.log(`  ${a.name}: ${best[1]} ${best[0] >= 0 ? '+' : ''}${best[0].toFixed(1)}%${shieldAbs}${a.provisional ? ' (provisional)' : ''}`);
    }
    const noMath = augs.filter((x) => !x.modeled);
    if (noMath.length) console.log(`  not in the sim (honest list): ${noMath.map((x) => x.name.split(' / ').pop()).join(', ')}`);
  }
}

// ── Playstyle slice extras: conditional Eternal loadout, robustness, agreement ──
if (kitPs && top) {
  const topItems = top.items.map((n) => data.items.get(n)!).filter(Boolean);

  const loadout = selectEternalLoadout(kit, topItems, level, cal, kitPs, { minute: opt('minute'), role });
  if (loadout) {
    console.log('\nEternal loadout (kit-fit major → conditional minors):');
    console.log(`  major:  ${loadout.major.name}  (${loadout.note})${loadout.major.modeled ? '' : ' — major mechanic unmodeled'}`);
    console.log(`  slot 1: ${loadout.minor1.name}  — ${loadout.minor1.note}`);
    console.log(`  slot 2: ${loadout.minor2.name}  — ${loadout.minor2.note}`);
  }

  if (kit.resource === 'mana') {
    const bare = manaSustain(kit, [], 9).combosBeforeDry;
    const withItems = manaSustain(kit, topItems.slice(0, 2), 12).combosBeforeDry;
    console.log(`\nmana (burst cadence): ${bare.toFixed(1)} combos before dry at L9 bare → ${withItems.toFixed(1)} with the first 2 items @L12 | build mana-adequacy ${stagedManaAdequacy(kit, topItems).toFixed(2)} (1.0 = sustains ~3 combos)`);
  }

  const rob = robustnessOf(kit, completedItems(data), cal, { level, role, objectiveBias, headlineOverride, beamWidth: 16 });
  console.log(`\nrobustness (Option A): ${rob.stable ? 'STABLE' : 'FRAGILE'} — ${rob.note}`);

  const headlineKey = headlineOverride ?? headlineObjective(kit, role);
  const agree = agreeWithField(builds, slug, data.itemsBySlug, headlineKey);
  if (agree) {
    const rc = Number.isNaN(agree.rankCorr) ? 'n/a' : agree.rankCorr.toFixed(2);
    console.log(`agreement vs field: hit@6 ${agree.hitAtK ? 'YES' : 'no'} | coverage ${(agree.coverage * 100).toFixed(0)}% | rankCorr ${rc}`);
    console.log(`  ${agree.note}`);
  }
}

// Matchup checkpoints: --vs <enemy-slug>
const vsSlug = (() => {
  const i = args.indexOf('--vs');
  return i >= 0 ? args[i + 1] : undefined;
})();
if (vsSlug && top) {
  const enemy = data.kits.get(vsSlug);
  if (!enemy) {
    console.error(`\nUnknown enemy slug "${vsSlug}"`);
  } else {
    const enemyBuilds = generateBuilds(enemy, completedItems(data), cal, { level, beamWidth: 8 });
    const enemyTop = enemyBuilds[0]!;
    const report = matchupCheckpoints(
      { kit, build: top.items.map((n) => data.items.get(n)!), role },
      { kit: enemy, build: enemyTop.items.map((n) => data.items.get(n)!), role: enemy.roles[0] ?? 'midlane' },
      cal,
    );
    console.log(`\n## vs ${enemy.name} (their sim build: ${enemyTop.items.join(', ')})`);
    console.log('your spikes:', report.spikes.you.map((s) => `${s.item}@${s.minute ?? '30+'}m`).join('  '));
    console.log('their spikes:', report.spikes.enemy.map((s) => `${s.item}@${s.minute ?? '30+'}m`).join('  '));
    for (const c of report.checkpoints) {
      const chip = c.verdict === 'you' ? 'YOU  ' : c.verdict === 'enemy' ? 'THEM ' : 'even ';
      console.log(`  min ${String(c.minute).padStart(2)} [${chip}] you ${c.you.items.length} items/${c.you.hp}hp vs ${c.enemy.items.length} items/${c.enemy.hp}hp — ${c.driver}`);
    }
    console.log(`gameplan: ${report.gameplan}`);
    console.log(`flags: ${report.flags.join(' | ')}`);
  }
}

const noItems = simulate(kit, [], { level, profile: cal.referenceProfiles.squishy }, cal);
console.log(`\nbaseline (no items): burst ${noItems.burstCombo.toFixed(0)}, mana pool ${noItems.manaPool.toFixed(0)}`);
