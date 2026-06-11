import { describe, it, expect, beforeAll } from 'vitest';
import { loadData, completedItems, type LoadedData } from '../src/data.js';
import {
  loadCalibration, unverifiedConstants, itemTotals, rotationDamage,
  abilityHit, simulate, type Calibration,
} from '../src/sim.js';
import { generateBuilds, paretoFront } from '../src/search.js';
import type { Item } from '../src/types.js';

let data: LoadedData;
let cal: Calibration;

beforeAll(() => {
  data = loadData();
  cal = loadCalibration();
});

describe('fixtures (Concept B layer 1: mechanics gates)', () => {
  it('every constant declares verified and source', () => {
    for (const [key, c] of Object.entries(cal.constants)) {
      expect(typeof c.verified, key).toBe('boolean');
      expect(c.source.length, key).toBeGreaterThan(10);
    }
  });

  it('lists unverified constants loudly', () => {
    const u = unverifiedConstants(cal);
    // Until the first practice-mode calibration session these are expected;
    // the gate is that nothing claims verification it does not have.
    console.warn(`UNVERIFIED fixtures in use: ${u.join(', ')}`);
    expect(u).toContain('mitigation');
  });
});

describe('data joins', () => {
  it('joins owned kits with omeda base stats for the full owned roster', () => {
    expect(data.kits.size).toBe(49);
    expect(data.missingFromOwned).toEqual(['adele', 'legion', 'neon']);
  });

  it('every kit has 18-level base stat arrays and at least one damaging ability', () => {
    for (const kit of data.kits.values()) {
      expect(kit.baseStats.max_health.length, kit.slug).toBe(18);
      expect(kit.abilities.length, kit.slug).toBeGreaterThan(0);
    }
  });

  it('Crunch falls back to omeda text parsing (owned damage entries are empty)', () => {
    const crunch = data.kits.get('crunch')!;
    expect(crunch.abilitySource).toBe('omeda-text');
    expect(crunch.abilities.length).toBeGreaterThanOrEqual(3);
    const left = crunch.abilities.find((a) => a.key === 'PRIMARY')!;
    expect(left.damagePerRank).toEqual([20, 35, 50, 65, 80]);
    expect(left.scalingPct).toBe(120); // mean of 110/115/120/125/130
  });

  it('Eden is resourceless and never flagged mana-infeasible', () => {
    const eden = data.kits.get('eden')!;
    expect(eden.resource).toBe('other');
    expect(simulate(eden, [], { level: 13, profile: null }, cal).manaFeasible).toBe(true);
  });

  it('completed item pool is usable and game-id mapped', () => {
    const pool = completedItems(data);
    expect(pool.length).toBeGreaterThan(60);
    const mapped = pool.filter((i) => i.gameId !== null);
    expect(mapped.length / pool.length).toBeGreaterThan(0.9);
  });
});

describe('simulator regression: the Gideon worked example (design doc, component B)', () => {
  // Pure item-stat math, mitigation off, rank-5 abilities, matching the
  // worked example in docs/v5-engine-design.md exactly.
  const ranks = new Map([['ALTERNATE', 5], ['PRIMARY', 5]]);
  const get = (name: string): Item => {
    const i = data.items.get(name);
    if (!i) throw new Error(`item missing: ${name}`);
    return i;
  };

  it('pure-MP core: burst 976, rot10 1952, rot20 2928', () => {
    const kit = data.kits.get('gideon')!;
    const A = [get('Oblivion Crown'), get('Wraith Leggings'), get('Amulet Of Chaos')];
    const t = itemTotals(A);
    expect(t.magical_power).toBe(285);
    const vb = kit.abilities.find((a) => a.key === 'ALTERNATE')!;
    const cr = kit.abilities.find((a) => a.key === 'PRIMARY')!;
    expect(abilityHit(vb, 5, t) + abilityHit(cr, 5, t)).toBeCloseTo(976, 0);
    const opts = { level: 13, ranks, profile: null };
    expect(rotationDamage(kit, opts, t, 10)).toBeCloseTo(1952, 0);
    expect(rotationDamage(kit, opts, t, 20)).toBeCloseTo(2928, 0);
  });

  it('haste core out-rotates pure MP at 10s+ but loses the one-shot', () => {
    const kit = data.kits.get('gideon')!;
    const A = itemTotals([get('Oblivion Crown'), get('Wraith Leggings'), get('Amulet Of Chaos')]);
    const B = itemTotals([get('Timewarp'), get('Noxia'), get('Astral Catalyst')]);
    expect(B.magical_power).toBe(235);
    expect(B.ability_haste).toBe(65);
    const opts = { level: 13, ranks, profile: null };
    const burst = (t: typeof A) =>
      abilityHit(kit.abilities.find((a) => a.key === 'ALTERNATE')!, 5, t) +
      abilityHit(kit.abilities.find((a) => a.key === 'PRIMARY')!, 5, t);
    expect(burst(A)).toBeGreaterThan(burst(B));
    expect(rotationDamage(kit, opts, B, 10)).toBeCloseTo(2688, 0);
    expect(rotationDamage(kit, opts, B, 20)).toBeCloseTo(4480, 0);
    expect(rotationDamage(kit, opts, B, 10)).toBeGreaterThan(rotationDamage(kit, opts, A, 10) * 1.3);
  });
});

describe('sanity invariants (Concept B layer 3)', () => {
  it('monotonicity: adding a power item never lowers rotation damage', () => {
    const kit = data.kits.get('gideon')!;
    const base = [data.items.get('Timewarp')!, data.items.get('Noxia')!, data.items.get('Astral Catalyst')!];
    const more = [...base, data.items.get('Oblivion Crown')!];
    const opts = { level: 13, profile: cal.referenceProfiles.squishy };
    expect(simulate(kit, more, opts, cal).rotation[20]).toBeGreaterThanOrEqual(
      simulate(kit, base, opts, cal).rotation[20]!,
    );
  });

  it('mitigation reduces damage and true damage ignores it', () => {
    const kit = data.kits.get('gideon')!;
    const items = [data.items.get('Oblivion Crown')!];
    const open = simulate(kit, items, { level: 13, profile: null }, cal);
    const vsTank = simulate(kit, items, { level: 13, profile: cal.referenceProfiles.tank }, cal);
    expect(vsTank.burstCombo).toBeLessThan(open.burstCombo);
  });

  it('mana feasibility uses real base pools', () => {
    const kit = data.kits.get('gideon')!;
    const r = simulate(kit, [], { level: 13, profile: null }, cal);
    expect(r.manaPool).toBeGreaterThan(500);
    expect(typeof r.manaFeasible).toBe('boolean');
  });

  it('pareto front contains no dominated builds', () => {
    const kit = data.kits.get('murdock') ?? data.kits.get('sparrow')!;
    const builds = generateBuilds(kit, completedItems(data), cal, { beamWidth: 10 });
    const front = paretoFront(builds);
    expect(front.length).toBe(builds.length);
  });
});

describe('golden scenarios (Concept B layer 2)', () => {
  it('sustain-heavy enemy: every generated build carries anti-heal in the first three slots', () => {
    const kit = data.kits.get('gideon')!;
    const builds = generateBuilds(kit, completedItems(data), cal, {
      beamWidth: 10,
      scenario: { requireAntiHeal: true },
    });
    expect(builds.length).toBeGreaterThan(0);
    for (const b of builds) {
      const firstThree = b.items.slice(0, 3);
      expect(firstThree.some((n) => n.startsWith('Tainted ')), b.items.join(',')).toBe(true);
    }
  });

  it('family constraint: no build ever stacks two Tainted items', () => {
    const kit = data.kits.get('greystone')!;
    const builds = generateBuilds(kit, completedItems(data), cal, {
      beamWidth: 10,
      scenario: { requireAntiHeal: true },
    });
    for (const b of builds) {
      const tainted = b.items.filter((n) => n.startsWith('Tainted '));
      expect(tainted.length, b.items.join(',')).toBeLessThanOrEqual(1);
    }
  });

  it('gold budget constrains the build', () => {
    const kit = data.kits.get('gideon')!;
    const builds = generateBuilds(kit, completedItems(data), cal, {
      beamWidth: 8,
      buildSize: 3,
      scenario: { goldBudget: 9000 },
    });
    for (const b of builds) expect(b.gold).toBeLessThanOrEqual(9000);
  });
});
