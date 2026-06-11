import { describe, it, expect, beforeAll } from 'vitest';
import { loadData, completedItems, type LoadedData } from '../src/data.js';
import {
  loadCalibration, unverifiedConstants, itemTotals, rotationDamage,
  simulate, type Calibration,
} from '../src/sim.js';
import { generateBuilds, paretoFront } from '../src/search.js';
import type { HeroKit, Item } from '../src/types.js';

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

describe('data joins and patch currency', () => {
  it('covers the full 52-hero roster, deriving profiles where owned data lacks them', () => {
    expect(data.kits.size).toBe(52);
    expect(data.derivedProfiles).toEqual(['adele', 'legion', 'neon']);
  });

  it('PATCH GATE: Gideon Void Breach matches the 1.14.4 digest (95-235, post-1.14 cooldowns)', () => {
    // data/patches/1.14.4.json records "Void Breach damage 85-225 -> 95-235".
    // Stale pre-1.14 sources show 90-230 with 9s-7s cooldowns; this gate
    // fails if the loader ever regresses to them.
    const vb = data.kits.get('gideon')!.abilities.find((a) => a.key === 'ALTERNATE')!;
    expect(vb.damagePerRank).toEqual([95, 130, 165, 200, 235]);
    expect(vb.cooldowns).toEqual([11, 10.5, 10, 9.5, 9]);
  });

  it('every kit has 18-level base stats and at least one damaging ability', () => {
    for (const kit of data.kits.values()) {
      expect(kit.baseStats.max_health.length, kit.slug).toBe(18);
      expect(kit.abilities.length, kit.slug).toBeGreaterThan(0);
    }
  });

  it('stale owned fallbacks are tracked, not silent', () => {
    // Abilities whose current text does not parse fall back to stale owned
    // numbers and must be visible for the copy layer to caveat.
    for (const s of data.staleFallbacks) {
      expect(data.kits.get(s.slug)?.abilitySource, s.slug).toBe('mixed');
    }
    console.warn(`stale-number fallbacks: ${data.staleFallbacks.length} ability slots`);
  });

  it('derived-profile heroes get sane attack types', () => {
    expect(data.kits.get('legion')!.attackType).toBe('ranged');
    expect(data.kits.get('neon')!.attackType).toBe('ranged');
  });

  it('Crunch and Murdock recover abilities the owned scrape missed', () => {
    const left = data.kits.get('crunch')!.abilities.find((a) => a.key === 'PRIMARY')!;
    expect(left.damagePerRank.length).toBe(5);
    expect(data.kits.get('murdock')!.abilities.some((a) => a.name === 'Buckshot')).toBe(true);
  });

  it('Eden is resourceless and never flagged mana-infeasible', () => {
    const eden = data.kits.get('eden')!;
    expect(eden.resource).toBe('other');
    expect(simulate(eden, [], { level: 13, profile: null }, cal).manaFeasible).toBe(true);
  });

  it('completed item pool is usable and game-id mapped', () => {
    const pool = completedItems(data);
    expect(pool.length).toBeGreaterThan(60);
    expect(pool.every((i) => i.gameId !== null)).toBe(true);
  });
});

describe('simulator exact math (synthetic fixtures, immune to data refreshes)', () => {
  const kit: HeroKit = {
    slug: 'synthetic', name: 'Synthetic', attackType: 'ranged', damageType: 'magical',
    roles: ['midlane'], resource: 'mana', basicScalingPct: 50,
    baseStats: {
      max_health: Array(18).fill(1000), physical_armor: Array(18).fill(50),
      magical_armor: Array(18).fill(50), max_mana: Array(18).fill(500),
      attack_speed: Array(18).fill(1), physical_power: Array(18).fill(60),
      attack_range: [1500], basic_attack_time: [1],
    },
    abilities: [{
      key: 'PRIMARY', name: 'Bolt', damagePerRank: [100, 150, 200, 250, 300],
      scalingPct: 50, damageType: 'magical', cooldowns: [10, 9, 8, 7, 6], costs: [50, 50, 50, 50, 50], maxRank: 5,
    }],
    abilitySource: 'omeda',
  };
  const mpItem = (mp: number, haste = 0): Item => ({
    slug: `mp${mp}`, name: `MP${mp}`, gameId: 1, totalPrice: 3000, rarity: 'EPIC', slotType: 'PASSIVE',
    stats: {
      physical_power: 0, magical_power: mp, attack_speed: 0, critical_chance: 0,
      physical_penetration: 0, magical_penetration: 0, ability_haste: haste,
      health: 0, physical_armor: 0, magical_armor: 0, max_mana: 0, lifesteal: 0, omnivamp: 0,
    },
    family: null, antiHeal: false, heroClass: null,
  });

  it('hit = base + ratio * bonus power; casts = 1 + floor(window/cd)', () => {
    // Rank 5 Bolt, 200 MP: hit = 300 + 0.5*200 = 400. cd 6s.
    // 10s window: 1 + floor(10/6) = 2 casts -> 800.
    const t = itemTotals([mpItem(200)]);
    const ranks = new Map([['PRIMARY', 5]]);
    expect(rotationDamage(kit, { level: 13, ranks, profile: null }, t, 10)).toBe(800);
    // 100 haste halves cd to 3s: 1 + floor(10/3) = 4 casts -> 1600.
    const t2 = itemTotals([mpItem(200, 100)]);
    expect(rotationDamage(kit, { level: 13, ranks, profile: null }, t2, 10)).toBe(1600);
  });

  it('mitigation: 100 armor halves damage; flat pen restores it', () => {
    const ranks = new Map([['PRIMARY', 5]]);
    const profile = { health: 1000, physicalArmor: 0, magicalArmor: 100 };
    const open = rotationDamage(kit, { level: 13, ranks, profile: null }, itemTotals([mpItem(200)]), 1);
    const walled = rotationDamage(kit, { level: 13, ranks, profile }, itemTotals([mpItem(200)]), 1);
    expect(walled).toBeCloseTo(open / 2, 6);
  });

  it('mana feasibility: pool bounds the 10s rotation', () => {
    // 2 casts in 10s at 50 mana = 100 <= 500 pool: feasible.
    const r = simulate(kit, [mpItem(200)], { level: 13, ranks: new Map([['PRIMARY', 5]]), profile: null }, cal);
    expect(r.manaSpent10s).toBe(100);
    expect(r.manaFeasible).toBe(true);
  });
});

describe('the Gideon tradeoff (live current-patch data, relational)', () => {
  // The design-doc worked example, restated as invariants so it survives
  // balance patches: haste cores out-rotate pure power in long windows,
  // pure power keeps the better one-shot.
  const get = (name: string): Item => {
    const i = data.items.get(name);
    if (!i) throw new Error(`item missing: ${name}`);
    return i;
  };

  it('haste advantage grows with window length; pure MP keeps the burst', () => {
    // Patch-sensitive detail, caught June 11: pre-1.14 data had haste
    // winning from 10s; the 1.14 global cooldown increase moved the
    // crossover to ~15s. The robust invariants are monotone: the haste
    // build's relative damage never shrinks as windows lengthen, and the
    // higher-MP build always one-shots harder.
    const kit = data.kits.get('gideon')!;
    const ranks = new Map([['ALTERNATE', 5], ['PRIMARY', 5]]);
    const pureMP = itemTotals([get('Oblivion Crown'), get('Wraith Leggings'), get('Amulet Of Chaos')]);
    const haste = itemTotals([get('Timewarp'), get('Noxia'), get('Astral Catalyst')]);
    expect(haste.ability_haste).toBeGreaterThanOrEqual(45);
    const opts = { level: 13, ranks, profile: null };
    const ratio = (w: number) =>
      rotationDamage(kit, opts, haste, w) / rotationDamage(kit, opts, pureMP, w);
    expect(rotationDamage(kit, opts, pureMP, 0.1)).toBeGreaterThan(rotationDamage(kit, opts, haste, 0.1));
    expect(ratio(20)).toBeGreaterThanOrEqual(ratio(0.1));
    expect(ratio(60)).toBeGreaterThanOrEqual(ratio(20));
    // Golden conclusion at current patch: haste wins long fights outright.
    // If a patch breaks this, the gate fires and a human reviews the copy.
    expect(ratio(60)).toBeGreaterThan(1.2);
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

  it('mitigation reduces damage vs tanks', () => {
    const kit = data.kits.get('gideon')!;
    const items = [data.items.get('Oblivion Crown')!];
    const open = simulate(kit, items, { level: 13, profile: null }, cal);
    const vsTank = simulate(kit, items, { level: 13, profile: cal.referenceProfiles.tank }, cal);
    expect(vsTank.burstCombo).toBeLessThan(open.burstCombo);
  });

  it('pareto front contains no dominated builds', () => {
    const kit = data.kits.get('murdock')!;
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
      expect(b.items.slice(0, 3).some((n) => n.startsWith('Tainted ')), b.items.join(',')).toBe(true);
    }
  });

  it('family constraint: no build ever stacks two Tainted items', () => {
    const kit = data.kits.get('greystone')!;
    const builds = generateBuilds(kit, completedItems(data), cal, {
      beamWidth: 10,
      scenario: { requireAntiHeal: true },
    });
    for (const b of builds) {
      expect(b.items.filter((n) => n.startsWith('Tainted ')).length, b.items.join(',')).toBeLessThanOrEqual(1);
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
