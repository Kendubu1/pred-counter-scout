import { expect, it } from 'vitest';
import { loadData } from '../src/data.js';
import { combatDamage, itemTotals, loadCalibration, simulate } from '../src/sim.js';
import type { AbilityDef, HeroKit, Item } from '../src/types.js';
const data = loadData(), cal = loadCalibration();
const buff = (duration: number, cd: number, key: AbilityDef['key'] = 'PRIMARY'): AbilityDef => ({
  key, name: 'Synthetic', damageType: 'physical', damagePerRank: [], scalingPct: 0,
  cooldowns: [cd], costs: [0], maxRank: 1, selfAttackSpeedPctPerRank: [100], buffDurationSec: duration,
});
const kit = (abilities: AbilityDef[], base = 1): HeroKit => ({...data.kits.get('murdock')!,
  slug: 'synthetic-window', abilities, baseStats: {...data.kits.get('murdock')!.baseStats,
    attack_speed: Array(18).fill(base), basic_attack_time: [1], physical_power: Array(18).fill(100)},
});
const opts = {level: 1, profile: null, ranks: new Map([['PRIMARY', 1], ['SECONDARY', 1]])};
const hits = (hero: HeroKit, seconds: number, items: Item[] = []) => combatDamage(hero, items, opts, cal, seconds) / 100;
it('clips the initial buff and recasts to the actual fight, including exact boundaries', () => {
  const hero = kit([buff(2, 4)]);
  expect(hits(hero, 2)).toBeCloseTo(4);
  expect(hits(hero, 4)).toBeCloseTo(6); // cast at t=4 grants no time before t=4
  expect(hits(hero, 5)).toBeCloseTo(8);
  expect(hits(hero, 10)).toBeCloseTo(16); // active 0..2, 4..6, 8..10
});
it('has no artificial damage drop immediately after the old three-second cutoff', () => {
  const hero = kit([buff(6, 20)]);
  expect(hits(hero, 3)).toBeCloseTo(6);
  expect(hits(hero, 3.001)).toBeCloseTo(6.002);
  expect(simulate(hero, [], opts, cal).autoDps).toBeCloseTo(160);
});
it('caps active and inactive intervals separately', () => {
  const hero = kit([buff(2, 20)], 2.5);
  // 2 seconds at the cap (3), 8 seconds at 2.5, not cap(mean AS).
  expect(hits(hero, 10)).toBeCloseTo(26);
  expect(simulate(hero, [], opts, cal).autoDps).toBeCloseTo(260);
});
it('combines overlapping buffs without double-counting self refreshes', () => {
  const overlap = kit([buff(2, 20), buff(4, 20, 'SECONDARY')]);
  expect(hits(overlap, 8)).toBeCloseTo(14); // 2*3 + 2*2 + 4*1
  expect(hits(kit([buff(6, 4)]), 10)).toBeCloseTo(20);
});
it('uses effective cooldowns with haste and gives zero extra credit to a zero-length fight', () => {
  const haste: Item = {...data.items.values().next().value!, slug: 'test-haste', name: 'Test haste',
    stats: {...itemTotals([]), ability_haste: 100}};
  expect(hits(kit([buff(2, 4)]), 10, [haste])).toBeCloseTo(20);
  expect(hits(kit([buff(2, 4)]), 0)).toBe(0);
});
