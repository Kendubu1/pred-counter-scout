// Controlled production-simulator snapshots, not timed Knell or winning-build validation.
import {readFileSync, writeFileSync} from 'node:fs';
import {loadData} from '../data.js';
import {loadCalibration, combatDamage} from '../sim.js';
import {resolveEntries, resolveItemEffects, mergeEffects} from '../effects.js';
import {KIRA_REPLAY_ITEMS} from '../kira-replay.js';
const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8'));
const data = loadData(), cal = loadCalibration(), kit = data.kits.get('kira')!;
const artifact = read('data/artifacts/kira.json');
const carry = artifact.roles?.find((r: any) => r.role === 'carry' && r.build) ?? artifact;
const evidence = read('data/aggregates/predgg-builds.json');
const cores = [{name: 'Optimizer opening', slugs: carry.build.items.slice(0, 3).map((i: any) => i.slug)},
  ...evidence.heroes.kira.map((r: any) => ({name: r.core.join(' / '), slugs: r.coreSlugs}))];
const rows: unknown[] = [], skipped: unknown[] = [];
for (const core of cores) {
  const unsupported = core.slugs.filter((s: string) => !(KIRA_REPLAY_ITEMS as readonly string[]).includes(s));
  if (unsupported.length) {skipped.push({core, unsupported}); continue;}
  const items = core.slugs.map((s: string) => data.itemsBySlug.get(s)!);
  if (items.length !== 3 || items.some((i: unknown) => !i)) throw new Error('Invalid three-item core');
  const itemFx = resolveItemEffects(items, {level: 13});
  for (const [target, profile] of Object.entries(cal.referenceProfiles)) {
    if (target.startsWith('_')) continue;
    let baseline = 0;
    for (const stacks of [0, 1, 4]) {
      const knell = resolveEntries(['eternal:knell:major'], {level: 13, effectStacks: {'eternal:knell:major': stacks}});
      const damage = combatDamage(kit, items, {level: 13, profile, effects: mergeEffects(itemFx, knell)}, cal, 10);
      if (stacks === 0) baseline = damage;
      rows.push({core: core.name, items: core.slugs, target, stacks, fixedStateDamage10s: damage,
        changeFromZeroStacksPct: baseline ? 100 * (damage / baseline - 1) : 0, limitations: itemFx.unmodeled});
    }
  }
}
const report = {scope: 'Level-13 Kira, equal item-count cores, fixed active Knell stack snapshots in production combatDamage',
  limits: ['Stacks are held fixed throughout each snapshot; these are not stack acquisition/expiry simulations.',
    'Stolen defenses, Peal and source interactions are omitted. Existing item, hit-order and current-health approximations remain.',
    'Cores can have different costs. Selection and historical win evidence do not validate build superiority.',
    'Unsupported reviewed replay items are skipped. Supported cores still retain their recorded modeling omissions.'], rows, skipped};
writeFileSync(new URL('../../../data/aggregates/knell-state-comparison.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`${rows.length} controlled snapshots; ${skipped.length} cores skipped.`);
