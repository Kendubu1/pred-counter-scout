// Counterfactual diagnosis: same kit, item stats and target; only trigger changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadData } from '../data.js';
import { resolveItemEffects } from '../effects.js';
import { loadCalibration, simulate } from '../sim.js';

const data = loadData(), cal = loadCalibration();
const item = data.itemsBySlug.get('spectral-schematics')!;
const rows = [...data.kits.values()].map(kit => {
  const effects = resolveItemEffects([item], { level: 13 });
  const unrestricted = structuredClone(effects);
  for (const proc of unrestricted.onAbilityProcs) delete proc.trigger;
  const statsOnly = { ...effects, onAbilityProcs: [] };
  const run = (fx: typeof effects) => simulate(kit, [item], { level: 13, effects: fx, profile: cal.referenceProfiles.squishy }, cal);
  const old = run(unrestricted), current = run(effects), stats = run(statsOnly);
  const artifact = JSON.parse(readFileSync(new URL(`../../../data/artifacts/${kit.slug}.json`, import.meta.url), 'utf8'));
  const views = new Map([[artifact.role, artifact], ...artifact.roles.filter((v: any) => v.build).map((v: any) => [v.role, v])]);
  return {
    hero: kit.slug,
    reviewedAbilities: kit.abilities.filter(a => a.immobilizes).map(a => a.key),
    recommendedRoles: [...views].filter(([, v]: any) => v.build.items.some((i: any) => i.slug === item.slug)).map(([role]) => role),
    roleCount: views.size,
    burst: { unrestricted: old.burstCombo, reviewedTriggers: current.burstCombo, statsOnly: stats.burstCombo },
    rotation10: { unrestricted: old.rotation[10], reviewedTriggers: current.rotation[10], statsOnly: stats.rotation[10] },
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  method: 'Level 13, Spectral Schematics alone, same target and stats. Unrestricted reproduces the former bug; reviewedTriggers is partial root/stun coverage, not measured game damage.',
  limitations: 'One successful reviewed CC application per cast. Other CC, charges, delays, immunity and event-by-event current health are unmodeled. Do not interpret reduced selection as demonstrated meta accuracy.',
  profile: cal.referenceProfiles.squishy,
  recommendedRoleCount: rows.reduce((n, r) => n + r.recommendedRoles.length, 0),
  totalRoleCount: rows.reduce((n, r) => n + r.roleCount, 0),
  rows,
};
writeFileSync(new URL('../../../data/aggregates/spectral-audit.json', import.meta.url), JSON.stringify(report, null, 1) + '\n');
console.log(`Spectral Schematics: ${report.recommendedRoleCount}/${report.totalRoleCount} recommended hero-role builds; ${rows.length} controlled comparisons`);
