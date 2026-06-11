// CLI: print The Answer artifact for a hero. Usage:
//   npm run answer -- gideon [--level 13] [--anti-heal] [--budget 12000]

import { loadData, completedItems } from './data.js';
import { loadCalibration, unverifiedConstants, simulate, skillPriority } from './sim.js';
import { generateBuilds } from './search.js';

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
  console.error(`No kit for "${slug}". Missing from owned data: ${data.missingFromOwned.join(', ')}`);
  process.exit(1);
}

const level = opt('level') ?? 13;
const unverified = unverifiedConstants(cal);
console.log(`# ${kit.name} (${kit.damageType}, ${kit.attackType}) — level ${level}, patch ${cal.patch}`);
console.log(`confidence: THEORY (sim-only; unverified constants in play: ${unverified.join(', ')})\n`);

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

const noItems = simulate(kit, [], { level, profile: cal.referenceProfiles.squishy }, cal);
console.log(`baseline (no items): burst ${noItems.burstCombo.toFixed(0)}, mana pool ${noItems.manaPool.toFixed(0)}`);
