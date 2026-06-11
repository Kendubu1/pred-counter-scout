// CLI: print The Answer artifact for a hero. Usage:
//   npm run answer -- gideon [--level 13] [--anti-heal] [--budget 12000]

import { loadData, completedItems } from './data.js';
import { loadCalibration, unverifiedConstants, simulate, skillPriority } from './sim.js';
import { generateBuilds } from './search.js';
import { rankBlessings } from './eternals.js';
import { heroGames, itemPlayRate } from './aggregates.js';
import { matchupCheckpoints } from './matchup.js';

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
const unverified = unverifiedConstants(cal);
console.log(`# ${kit.name} (${kit.damageType}, ${kit.attackType}) — level ${level}, patch ${cal.patch}`);
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

const builds = generateBuilds(kit, completedItems(data), cal, {
  level,
  scenario: { requireAntiHeal: flag('anti-heal'), goldBudget: opt('budget') },
});

console.log(`\nPareto front (${builds.length} builds):\n`);
for (const b of builds.slice(0, 6)) {
  console.log(`[${b.archetypes.join(', ') || 'balanced'}] ${b.gold}g${b.manaFeasible ? '' : '  ⚠ mana-infeasible rotation'}`);
  console.log(`  ${b.items.join(' > ')}`);
  const o = b.objectives;
  console.log(
    `  burst ${o.burstVsSquishy.toFixed(0)} | rot10 ${o.rot10VsSquishy.toFixed(0)} | rot20-vs-bruiser ${o.rot20VsBruiser.toFixed(0)}` +
    ` | autoDPS ${o.autoDps10VsSquishy.toFixed(0)} | eHP ${o.ehpPhysical.toFixed(0)}/${o.ehpMagical.toFixed(0)}\n`,
  );
}

// Play rates: the off-meta gate's "underexplored" signal (live data).
const games = heroGames(slug);
if (games >= 30 && builds[0]) {
  const rates = builds[0].items.map((n) => {
    const r = itemPlayRate(slug, data.items.get(n)?.gameId ?? null);
    return r == null ? `${n} (?)` : `${n} (${(r * 100).toFixed(0)}%${r < 0.02 ? ' UNDEREXPLORED' : ''})`;
  });
  console.log(`play rates on ${kit.name}, ${games} games this patch: ${rates.join(', ')}\n`);
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
      { kit, build: top.items.map((n) => data.items.get(n)!), role: kit.roles[0] ?? 'midlane' },
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
