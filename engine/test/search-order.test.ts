import { describe, expect, it } from 'vitest';
import { loadData } from '../src/data.js';
import { orderBuild } from '../src/matchup.js';
import { generateBuilds } from '../src/search.js';
import { itemTotals, loadCalibration, stagedManaAdequacy } from '../src/sim.js';
import type { HeroKit, Item } from '../src/types.js';

const data = loadData(), cal = loadCalibration();
const source = data.kits.get('gideon')!;
const kit: HeroKit = {
  ...source, resource: 'mana', damageType: 'magical', roles: ['midlane'],
  baseStats: { ...source.baseStats, max_mana: Array(18).fill(100) },
  abilities: source.abilities.map(a => ({ ...a, costs: a.costs.map(() => 100) })),
};
const makeItem = (slug: string, stats: Partial<Item['stats']>, antiHeal = false): Item => ({
  ...data.items.values().next().value!, slug, name: slug, totalPrice: 100,
  family: null, antiHeal, stats: { ...itemTotals([]), ...stats },
});
const damage = makeItem('test-damage', { magical_power: 1000 });
const mana = makeItem('test-mana', { max_mana: 2000 });
const defense = makeItem('test-defense', { health: 500 });
const permutations = <T>(xs: T[]): T[][] => xs.length === 0 ? [[]]
  : xs.flatMap((x, i) => permutations(xs.filter((_, j) => j !== i)).map(rest => [x, ...rest]));
const adequacy = (names: string[], pool: Item[]) => stagedManaAdequacy(kit, names.map(n => pool.find(i => i.name === n)!));

describe('purchase order survives item-set deduplication', () => {
  it('retains the better early-mana path even when the damage-first state expands first', () => {
    for (const pool of [[damage, mana], [mana, damage]]) {
      const result = generateBuilds(kit, pool, cal, { buildSize: 2, beamWidth: 10 });
      expect(result).toHaveLength(1);
      expect(result[0]!.items).toEqual([mana.name, damage.name]);
      expect(adequacy(result[0]!.items, pool)).toBe(1);
      expect(stagedManaAdequacy(kit, [damage, mana])).toBeLessThan(1);
    }
  });
  it('matches exhaustive prefix scoring on a small pool, independent of candidate order', () => {
    const pool = [damage, mana, defense];
    const best = Math.max(...permutations(pool).map(order => stagedManaAdequacy(kit, order)));
    for (const candidates of permutations(pool)) {
      const result = generateBuilds(kit, candidates, cal, { buildSize: 3, beamWidth: 20 });
      expect(result).toHaveLength(1);
      expect(adequacy(result[0]!.items, pool)).toBe(best);
    }
  });
  it('keeps anti-heal feasible by slot three while retaining early mana', () => {
    const anti = makeItem('test-anti', { magical_power: 1 }, true);
    const pool = [damage, defense, mana, anti];
    const result = generateBuilds(kit, pool, cal, { buildSize: 4, beamWidth: 30, scenario: { requireAntiHeal: true } });
    expect(result.length).toBeGreaterThan(0);
    for (const build of result) {
      expect(build.items.slice(0, 3)).toContain(anti.name);
      expect(adequacy(build.items, pool)).toBe(1);
    }
  });
});


describe('displayed purchase order preserves search mana adequacy', () => {
  it('cannot move the mana source behind the damage item', () => {
    const result = orderBuild(kit, [mana, damage, defense], 13, cal);
    expect(result.ordered[0]).toBe(mana);
    expect(stagedManaAdequacy(kit, result.ordered)).toBe(1);
    expect(result.cumulativeGold).toEqual([100, 200, 300]);
  });
  it('never lowers input adequacy across every small-pool permutation', () => {
    for (const input of permutations([damage, mana, defense])) {
      const result = orderBuild(kit, input, 13, cal);
      expect(stagedManaAdequacy(kit, result.ordered)).toBeGreaterThanOrEqual(stagedManaAdequacy(kit, input));
      expect(result.ordered.map(i => i.slug).sort()).toEqual(input.map(i => i.slug).sort());
    }
  });
  it('keeps combat-per-gold ordering for resourceless kits and handles empty builds', () => {
    const freeKit: HeroKit = { ...kit, resource: 'other' };
    expect(orderBuild(freeKit, [mana, damage], 13, cal).ordered).toEqual([damage, mana]);
    expect(orderBuild(kit, [], 13, cal)).toEqual({ ordered: [], cumulativeGold: [] });
  });
});
