import { describe, it, expect } from 'vitest';
import { loadData } from '../src/data.js';
import { resolveEntries, mergeEffects, emptyEffects } from '../src/effects.js';
import { combatDamage, loadCalibration, rotationDamage, effectiveTotals } from '../src/sim.js';
import { readFileSync } from 'node:fs';

const key = 'eternal:knell:major';
const state = (stacks: number, level = 13) => resolveEntries([key], {level, effectStacks: {[key]: stacks}});

describe('Knell explicit active-stack snapshots', () => {
  it('publishes finite comparisons only for actual targets and reviewed three-item cores', () => {
    const report = JSON.parse(readFileSync(new URL('../../data/aggregates/knell-state-comparison.json', import.meta.url), 'utf8'));
    expect(report.rows.length).toBeGreaterThan(0);
    for (const row of report.rows) {
      expect(['squishy', 'bruiser', 'tank']).toContain(row.target);
      expect(row.items).toHaveLength(3);
      expect(Number.isFinite(row.fixedStateDamage10s)).toBe(true);
      expect(row.fixedStateDamage10s).toBeGreaterThan(0);
      expect(row.changeFromZeroStacksPct).toBeGreaterThanOrEqual(0);
      if (row.stacks === 0) expect(row.changeFromZeroStacksPct).toBe(0);
    }
    expect(report.skipped.some((r: any) => r.unsupported.includes('scattershot'))).toBe(true);
  });
  it('does not invent stack uptime when state is omitted', () => {
    const result = resolveEntries([key], {level: 13});
    expect(result.targetArmorMultiplier).toEqual({physical: 1, magical: 1});
    expect(result.unmodeled.some(x => x.includes('explicitly supplied'))).toBe(true);
  });
  it('uses actor-level arithmetic rather than interpolating the shred curve at actor level', () => {
    expect(state(1).targetArmorMultiplier.physical).toBeCloseTo(0.954, 8);
    expect(state(4).targetArmorMultiplier.physical).toBeCloseTo(0.816, 8);
    expect(state(4).targetArmorMultiplier.magical).toBeCloseTo(0.816, 8);
    expect(state(4, 1).targetArmorMultiplier.physical).toBeCloseTo(0.912, 8);
    expect(state(4, 18).targetArmorMultiplier.physical).toBeCloseTo(0.776, 8);
  });
  it('rejects impossible or fractional states rather than silently capping them', () => {
    for (const stacks of [-1, 1.5, 5, NaN, Infinity]) expect(() => state(stacks)).toThrow();
    for (const level of [0, 19, 1.5, NaN]) expect(() => state(1, level)).toThrow();
  });
  it('survives effect merging and affects physical mitigation in the production combat path', () => {
    const data = loadData(), cal = loadCalibration(), kit = data.kits.get('kira')!;
    const ranks = new Map(kit.abilities.map(a => [a.key, 0]));
    const profile = {health: 2000, physicalArmor: 100, magicalArmor: 100};
    const run = (stacks: number) => combatDamage(kit, [], {level: 13, ranks, profile,
      effects: mergeEffects(emptyEffects(), state(stacks))}, cal, 1);
    expect(run(4) / run(0)).toBeCloseTo(200 / 181.6, 8);
    expect(run(1)).toBeGreaterThan(run(0));
    expect(state(4).provisional).toBe(true);
    const combined = state(4); combined.shredPct.physical = 20;
    const mixed = combatDamage(kit, [], {level: 13, ranks, profile, effects: combined}, cal, 1);
    expect(mixed / run(0)).toBeCloseTo(200 / (100 + 100 * 0.816 * 0.8), 8);
    const mage = data.kits.get('gideon')!;
    const mageRanks = new Map(mage.abilities.map(a => [a.key, a.key === 'PRIMARY' ? 1 : 0]));
    const magical = (stacks: number) => rotationDamage(mage, {level: 13, ranks: mageRanks, profile,
      effects: state(stacks)}, effectiveTotals([], emptyEffects()), 2);
    expect(magical(4) / magical(0)).toBeCloseTo(200 / 181.6, 8);
  });
});
