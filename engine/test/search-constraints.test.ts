import { describe, expect, it } from 'vitest';
import { loadData } from '../src/data.js';
import { generateBuilds } from '../src/search.js';
import { itemTotals, loadCalibration } from '../src/sim.js';
import type { Item } from '../src/types.js';

const data = loadData(), cal = loadCalibration(), kit = data.kits.get('murdock')!;
const item = (slug: string, price = 100, antiHeal = false, family: string | null = null): Item => ({
  ...data.items.values().next().value!, slug, name: slug, totalPrice: price,
  family, antiHeal, stats: { ...itemTotals([]), physical_power: 10 },
});
const search = (pool: Item[], buildSize: number, scenario: {goldBudget?: number; requireAntiHeal?: boolean}) =>
  generateBuilds(kit, pool, cal, {buildSize, beamWidth: 4, scenario});

describe('search constraints are requirements, not preferences', () => {
  it('zero gold cannot buy paid items; exact affordability is inclusive', () => {
    expect(search([item('paid')], 1, {goldBudget: 0})).toEqual([]);
    expect(search([item('paid')], 1, {goldBudget: 100})).toHaveLength(1);
    expect(search([item('free', 0)], 1, {goldBudget: 0})).toHaveLength(1);
  });
  it('invalid budgets fail explicitly', () => {
    for (const goldBudget of [-1, NaN, Infinity]) {
      expect(() => search([item('paid')], 1, {goldBudget})).toThrow(/budget/i);
    }
  });
  it('requires anti-heal even for one- and two-item checkpoints', () => {
    const pool = [item('damage'), item('anti', 100, true)];
    for (const size of [1, 2]) {
      const builds = search(pool, size, {requireAntiHeal: true});
      expect(builds.length).toBeGreaterThan(0);
      expect(builds.every(b => b.items.includes('anti'))).toBe(true);
    }
  });
  it('does not relax unavailable, unaffordable, or family-conflicting anti-heal', () => {
    const ordinary = [item('one'), item('two'), item('three')];
    expect(search(ordinary, 3, {requireAntiHeal: true})).toEqual([]);
    expect(search([...ordinary, item('anti', 1000, true)], 3, {requireAntiHeal: true, goldBudget: 300})).toEqual([]);
    const conflict = [item('one', 100, false, 'same'), item('two', 100, false, 'same'), item('anti', 100, true, 'same')];
    expect(search(conflict, 2, {requireAntiHeal: true})).toEqual([]);
  });
});
