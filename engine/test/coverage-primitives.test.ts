import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadData } from '../src/data.js';
import { EffectRegistrySchema, resolveEntries } from '../src/effects.js';
import { itemTotals, loadCalibration, ranksAtLevel, simulate, rotationDamage } from '../src/sim.js';
import type { HeroKit, Item } from '../src/types.js';
const data = loadData(), cal = loadCalibration();
const kit: HeroKit = {...data.kits.get('murdock')!, abilities: [{
  key: 'PRIMARY', name: 'Test', damagePerRank: [100], scalingPct: 0,
  damageType: 'physical', cooldowns: [10], costs: [0], maxRank: 1,
}]};
const items: Item[] = [{...data.items.values().next().value!, slug: 'test', name: 'test',
  stats: {...itemTotals([]), physical_power: 100, magical_power: 200}}];
const opts = {level: 1, profile: {health: 1000, physicalArmor: 0, magicalArmor: 100},
  ranks: new Map([['PRIMARY', 1]]), burstBasics: 1};
const effect = (kind: string, extra = {}) => resolveEntries(['item:test'], {level: 1}, EffectRegistrySchema.parse({targets: {
  'item:test': {name: 'Test', source: 'synthetic test only', sourceText: 'Test', effects: [{
    kind, abilityKey: 'PRIMARY', flat: 10, damageType: 'magical',
    powerScaling: {physical: 25, magical: 20},
    // Explicit dual ratios must replace, not add to, this legacy representation.
    scalingPct: 999, scaleStat: 'physical_power', ...extra,
  }]},
}}));
describe('coverage primitives', () => {
  it.each(['on_hit', 'on_ability_hit', 'ability_bonus_damage'])('%s retains both powers through schema, resolution and mitigation', kind => {
    const baseline = simulate(kit, items, opts, cal);
    const actual = simulate(kit, items, {...opts, effects: effect(kind)}, cal);
    // One proc: (10 + 25% * 100 + 20% * 200) / 2 magical mitigation.
    expect(actual.burstCombo - baseline.burstCombo).toBeCloseTo(37.5, 8);
    if (kind !== 'on_hit') {
      const t = itemTotals(items);
      expect(rotationDamage(kit, {...opts, effects: effect(kind)}, t, 1) - rotationDamage(kit, opts, t, 1)).toBeCloseTo(37.5, 8);
    }
  });
  it('preserves legacy scaling when dual ratios are absent and honors explicit zero ratios', () => {
    const base = simulate(kit, items, opts, cal).burstCombo;
    const legacy = effect('on_hit', {powerScaling: undefined, scalingPct: 25});
    expect(simulate(kit, items, {...opts, effects: legacy}, cal).burstCombo - base).toBeCloseTo(17.5, 8);
    const zero = effect('on_hit', {powerScaling: {physical: 0, magical: 0}});
    expect(simulate(kit, items, {...opts, effects: zero}, cal).burstCombo - base).toBeCloseTo(5, 8);
  });
  it('retains all current catalog passives without making them castable or consuming skill points', () => {
    const heroes = JSON.parse(readFileSync(new URL('../../data/catalog/heroes.json', import.meta.url), 'utf8'));
    let count = 0;
    for (const hero of heroes) {
      const source = hero.abilities.find((a: any) => a.key === 'Passive');
      const loaded = data.kits.get(hero.slug)!;
      if (!source) continue;
      count++;
      expect(loaded.passive).toMatchObject({key: 'PASSIVE', name: source.display_name, sourceText: source.menu_description, modelStatus: 'source-only'});
      expect(ranksAtLevel(loaded, 18).has('PASSIVE')).toBe(false);
      expect(loaded.abilities.some(a => String(a.key) === 'PASSIVE')).toBe(false);
    }
    expect(count).toBe(data.kits.size);
  });
});
