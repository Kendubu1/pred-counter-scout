import { describe, it, expect, beforeAll } from 'vitest';
import { loadData, type LoadedData } from '../src/data.js';
import { loadEffects, resolveEntries, resolveItemEffects, mergeEffects } from '../src/effects.js';
import { loadCalibration, effectiveTotals, itemTotals, simulate, rotationDamage, type Calibration } from '../src/sim.js';
import { rankBlessings } from '../src/eternals.js';
import type { HeroKit, Item, ItemStats } from '../src/types.js';

let data: LoadedData;
let cal: Calibration;

beforeAll(() => {
  data = loadData();
  cal = loadCalibration();
});

const mkItem = (slug: string, stats: Partial<ItemStats>): Item => ({
  slug, name: slug, gameId: 1, totalPrice: 3000, rarity: 'EPIC', slotType: 'PASSIVE',
  stats: {
    physical_power: 0, magical_power: 0, attack_speed: 0, critical_chance: 0,
    physical_penetration: 0, magical_penetration: 0, ability_haste: 0,
    health: 0, physical_armor: 0, magical_armor: 0, max_mana: 0, lifesteal: 0, omnivamp: 0,
    heal_shield_increase: 0, gold_per_second: 0, tenacity: 0, movement_speed: 0,
    ...stats,
  },
  family: null, antiHeal: false, heroClass: null,
});

const synthKit: HeroKit = {
  slug: 'synthetic', name: 'Synthetic', attackType: 'melee', damageType: 'magical',
  roles: ['midlane'], resource: 'mana', basicScalingPct: 50,
  baseStats: {
    max_health: Array(18).fill(1000), physical_armor: Array(18).fill(50),
    magical_armor: Array(18).fill(50), max_mana: Array(18).fill(500),
    attack_speed: Array(18).fill(1), physical_power: Array(18).fill(60),
    attack_range: [300], basic_attack_time: [1],
  },
  abilities: [
    {
      key: 'PRIMARY', name: 'Bolt', damagePerRank: [100, 150, 200, 250, 300],
      scalingPct: 50, damageType: 'magical', cooldowns: [9, 9, 9, 9, 9], costs: [50, 50, 50, 50, 50], maxRank: 5,
    },
    {
      key: 'ULTIMATE', name: 'Nuke', damagePerRank: [400, 600, 800],
      scalingPct: 100, damageType: 'magical', cooldowns: [120, 100, 80], costs: [100, 100, 100], maxRank: 3,
    },
  ],
  abilitySource: 'omeda',
};

describe('effect registry hygiene', () => {
  it('parses, and every entry carries sourceText and source', () => {
    const reg = loadEffects();
    const entries = Object.entries(reg.targets);
    expect(entries.length).toBeGreaterThan(25);
    for (const [key, e] of entries) {
      expect(e.sourceText.length, key).toBeGreaterThan(10);
      expect(e.source.length, key).toBeGreaterThan(5);
    }
  });

  it('reports modeled vs unmodeled coverage', () => {
    const reg = loadEffects();
    let modeled = 0, unmodeledOnly = 0;
    for (const e of Object.values(reg.targets)) {
      if (e.effects.every((fx) => fx.kind === 'unmodeled')) unmodeledOnly++;
      else modeled++;
    }
    console.warn(`effects coverage: ${modeled} modeled targets, ${unmodeledOnly} encoded-but-unmodeled`);
    expect(modeled).toBeGreaterThan(15);
  });
});

describe('effect math (synthetic, exact)', () => {
  it('Eradicate: +25% magical power applies to item-granted MP', () => {
    const fx = resolveEntries(['item:oblivion-crown'], { level: 13 });
    const t = effectiveTotals([mkItem('x', { magical_power: 200 })], fx);
    expect(t.magical_power).toBe(250);
  });

  it('Chime: cooldown rate 0.125 turns a 9s cooldown into 8s effective', () => {
    const fx = resolveEntries(['item:timewarp'], { level: 13 });
    const t = itemTotals([]);
    const ranks = new Map([['PRIMARY', 5]]);
    // 16s window: plain 9s cd -> 2 casts; 8s effective -> 3 casts.
    const plain = rotationDamage(synthKit, { level: 13, ranks, profile: null }, t, 16);
    const chimed = rotationDamage(synthKit, { level: 13, ranks, profile: null, effects: fx }, t, 16);
    expect(plain).toBe(600);   // 300 * 2
    expect(chimed).toBe(900);  // 300 * 3
  });

  it('Necrosis: ultimate-only amp and haste touch only the ultimate', () => {
    const fx = resolveEntries(['item:necrosis'], { level: 13 });
    const t = itemTotals([]);
    const ranks = new Map([['PRIMARY', 5], ['ULTIMATE', 3]]);
    const r = simulate(synthKit, [], { level: 13, ranks, profile: null, effects: fx, burstBasics: 0 }, cal);
    // burst = Bolt 300 + Nuke 800 * 1.15 = 1220
    expect(r.burstCombo).toBeCloseTo(1220, 5);
  });

  it('Vesh major: 6% +0.5%/min ability amp, minute-scaled', () => {
    const at0 = resolveEntries(['eternal:vesh:major'], { level: 13, minute: 0 });
    const at10 = resolveEntries(['eternal:vesh:major'], { level: 13, minute: 10 });
    expect(at0.ampAbilitiesPct).toBe(6);
    expect(at10.ampAbilitiesPct).toBe(11);
  });

  it('Demiurge: item stats x1.12, Cursed Corrupted converts and consumes crit', () => {
    const fx = resolveEntries(['eternal:demiurge:major', 'eternal:demiurge:cursed-corrupted'], { level: 13 });
    const t = effectiveTotals([mkItem('x', { magical_power: 100, critical_chance: 20 })], fx);
    expect(t.magical_power).toBeCloseTo(112, 5);
    expect(t.critical_chance).toBe(0);
    expect(t.ability_haste).toBeCloseTo(22.4, 5); // 20 crit * 1.12 -> 22.4 AH
  });

  it('percent pen stacks multiplicatively (1.14 rule)', () => {
    const fx = mergeEffects(
      resolveEntries(['item:caustica'], { level: 13 }),
      resolveEntries(['eternal:idrisil:diamond-tip'], { level: 13, itemCount: 6 }),
    );
    // 35% then 24% (4% x 6 items): 1 - 0.65*0.76 = 50.6%
    expect(fx.pctPen.magical).toBeCloseTo(50.6, 1);
  });

  it('Sky Splitter encodes the ranged discount', () => {
    const fx = resolveEntries(['item:sky-splitter'], { level: 13 });
    const p = fx.onHitProcs[0]!;
    expect(p.pctTargetHealth).toBe(5.5);
    expect(p.pctTargetHealthRanged).toBe(3.5);
    expect(p.healthBasis).toBe('current');
  });
});

describe('effects on live data', () => {
  it('Tainted Scepter: anti-heal 45 and Malice raises long-window rotation', () => {
    const kit = data.kits.get('gideon')!;
    const scepter = data.itemsBySlug.get('tainted-scepter')!;
    const fx = resolveItemEffects([scepter], { level: 13 });
    expect(fx.antiHealPct).toBe(45);
    const t = itemTotals([scepter]);
    const ranks = new Map([['ALTERNATE', 5], ['PRIMARY', 5]]);
    const plain = rotationDamage(kit, { level: 13, ranks, profile: null }, t, 20);
    const withFx = rotationDamage(kit, { level: 13, ranks, profile: null, effects: fx }, t, 20);
    expect(withFx).toBeGreaterThan(plain);
  });

  it('rankBlessings: modeled Eternals carry numbers, unmodeled are listed honestly', () => {
    const kit = data.kits.get('gideon')!;
    const items = ['Tainted Scepter', 'Timewarp', 'Oblivion Crown'].map((n) => data.items.get(n)!);
    const ranked = rankBlessings(kit, items, 13, cal, { minute: 10 });
    const vesh = ranked.find((r) => r.id.startsWith('vesh'))!;
    expect(vesh.modeled).toBe(true);
    expect(vesh.deltas!.rot10Pct).toBeGreaterThan(5); // 11% amp at minute 10, abilities dominate Gideon
    // Lotus joined the modeled set 2026-06-12 (EV per-minute encoding).
    const lotus = ranked.find((r) => r.id.startsWith('lotus'))!;
    expect(lotus.modeled).toBe(true);
    expect(lotus.deltas!.rot10Pct).toBeGreaterThan(0);
    const marrow = ranked.find((r) => r.id.startsWith('marrow'))!;
    expect(marrow.modeled).toBe(false);
    expect(marrow.unmodeledNotes.length).toBeGreaterThan(0);
    // every modeled entry outranks every unmodeled entry in the sort
    const firstUnmodeled = ranked.findIndex((r) => !r.modeled);
    expect(ranked.slice(0, firstUnmodeled).every((r) => r.modeled)).toBe(true);
  });

  it('Lotus major: expected-value per-minute encoding (takedown procs excluded)', () => {
    // One proc per 2 min, uniform over +1.5% dmg / +4 AH / +0.75% MS / +1.5% maxHP.
    const fx = resolveEntries(['eternal:lotus:major'], { level: 13, minute: 20 });
    expect(fx.ampAllPct).toBeCloseTo(3.75, 6);            // 0.1875%/min * 20
    expect(fx.statFlat.ability_haste).toBeCloseTo(10, 6); // 0.5/min * 20
    expect(fx.statFlat.movement_speed).toBeCloseTo(1.875, 6);
    expect(fx.healthMultiplier).toBeCloseTo(1.0375, 6);
    expect(fx.unmodeled.join(' ')).toMatch(/takedown/i);  // the floor caveat rides along
    // minute 0 (pre-game math): no procs yet, nothing credited
    const t0 = resolveEntries(['eternal:lotus:major'], { level: 13, minute: 0 });
    expect(t0.ampAllPct).toBe(0);
  });

  it('provisional sources propagate (Kallari ability-crit bakes the unverified crit multiplier)', () => {
    const fx = resolveEntries(['augment:kallari:65'], { level: 13 });
    expect(fx.provisional).toBe(true);
    expect(fx.ampAbilitiesFromCrit).toEqual({ minPct: 0, maxPct: 40 });
  });

  it('ability-scoped amp touches only the targeted ability', () => {
    const reg = {
      targets: {
        'augment:x:1': {
          name: 'X / Amp', sourceText: 'Bolt deals 50% more damage.', source: 'synthetic', provisional: false,
          effects: [{ kind: 'ability_damage_amp' as const, abilityKey: 'PRIMARY' as const, pct: 50 }],
        },
      },
    };
    const fx = resolveEntries(['augment:x:1'], { level: 13 }, reg);
    const t = itemTotals([]);
    const ranks = new Map([['PRIMARY', 5], ['ULTIMATE', 3]]);
    // 0.1s window = single cast each: PRIMARY 300 * 1.5 + ULT 800 untouched.
    expect(rotationDamage(synthKit, { level: 18, ranks, profile: null, effects: fx }, t, 0.1))
      .toBeCloseTo(300 * 1.5 + 800, 6);
  });

  it('ability cooldown mods change cast counts', () => {
    const reg = {
      targets: {
        'augment:x:2': {
          name: 'X / CD', sourceText: 'Bolt cooldown reduced by 4s.', source: 'synthetic', provisional: false,
          effects: [{ kind: 'ability_cooldown' as const, abilityKey: 'PRIMARY' as const, flatSeconds: 4 }],
        },
      },
    };
    const fx = resolveEntries(['augment:x:2'], { level: 13 }, reg);
    const t = itemTotals([]);
    const ranks = new Map([['PRIMARY', 5]]);
    // cd 9 -> 5: 1+floor(10/5) = 3 casts of 300 = 900 (vs 2 casts = 600).
    expect(rotationDamage(synthKit, { level: 18, ranks, profile: null, effects: fx }, t, 10)).toBe(900);
  });

  it('ability_heal and shield_on_cast feed heal output and EHP', () => {
    const reg = {
      targets: {
        'augment:x:3': {
          name: 'X / Heal', sourceText: 'Bolt also shields for 100 (+50% MP); casting grants a 40 (+40% MP) shield.', source: 'synthetic', provisional: false,
          effects: [
            { kind: 'ability_heal' as const, abilityKey: 'PRIMARY' as const, healKind: 'shield' as const, flat: 100, scalingPct: 50, scaleStat: 'magical_power' as const },
            { kind: 'shield_on_cast' as const, flat: 40, scalingPct: 40, scaleStat: 'magical_power' as const },
          ],
        },
      },
    };
    const fx = resolveEntries(['augment:x:3'], { level: 13 }, reg);
    const mp = mkItem('mp', { magical_power: 200 });
    const ranks = new Map([['PRIMARY', 5]]);
    const r = simulate(synthKit, [mp], { level: 13, ranks, profile: null, effects: fx }, cal);
    // cd 9s -> 2 casts in 10s; per cast 100 + 0.5*200 = 200 -> 400 shielded.
    expect(r.healShield10s).toBeCloseTo(400, 6);
    // EHP shield: 40 + 0.4*200 = 120 on top of 1000 HP, at 50 armor.
    expect(r.ehpPhysical).toBeCloseTo((1000 + 120) * 1.5, 6);
  });

  it('effects never break monotonicity: a damage item still never lowers output', () => {
    const kit = data.kits.get('gideon')!;
    const base = ['Timewarp', 'Noxia'].map((n) => data.items.get(n)!);
    const more = [...base, data.items.get('Oblivion Crown')!];
    const opts = { level: 13, profile: cal.referenceProfiles.squishy };
    const evalWith = (items: Item[]) =>
      simulate(kit, items, { ...opts, effects: resolveItemEffects(items, { level: 13 }) }, cal);
    expect(evalWith(more).rotation[20]).toBeGreaterThanOrEqual(evalWith(base).rotation[20]!);
  });
});
