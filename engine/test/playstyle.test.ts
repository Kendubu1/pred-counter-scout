// Kit-derived playstyle slice (Gideon). Verifies the kit-first lean, the fused
// steer, the conditional Eternal loadout, Option-A robustness, and the field
// retrodiction validator — plus that the other heroes are untouched.

import { describe, it, expect, beforeAll } from 'vitest';
import { loadData, completedItems, type LoadedData } from '../src/data.js';
import { loadCalibration, ranksAtLevel, manaSustain, stagedManaAdequacy, effectiveTotals, evaluateBuild, type Calibration } from '../src/sim.js';
import { resolveItemEffects } from '../src/effects.js';
import { generateBuilds, headlineObjective } from '../src/search.js';
import { kitPlaystyle, kitPowerType, fuseSteer, laneTopAugment } from '../src/playstyle.js';
import { selectEternalLoadout } from '../src/eternals.js';
import { robustnessOf } from '../src/robustness.js';
import { agreeWithField } from '../src/agreement.js';

let data: LoadedData;
let cal: Calibration;
beforeAll(() => { data = loadData(); cal = loadCalibration(); });

describe('kit-derived playstyle (Concept: kit -> playstyle)', () => {
  it('reads Gideon as an ability-power burst kit despite the hybrid damage tag', () => {
    const kit = data.kits.get('gideon')!;
    // Gideon is tagged hybrid (physical basic, magical abilities); the power
    // type must resolve to magical from where the ability payload lives.
    expect(kit.damageType).toBe('hybrid');
    expect(kitPowerType(kit)).toBe('magical');
    const ps = kitPlaystyle(kit, 'midlane');
    expect(ps.primary).toBe('ability-burst');
    expect(ps.secondary).toBeDefined();
    expect(ps.evidence.length).toBeGreaterThan(0);
  });

  it('fuses the kit lean with the field augment into a steer with a verdict', () => {
    const kit = data.kits.get('gideon')!;
    const ps = kitPlaystyle(kit, 'midlane');
    const fused = fuseSteer(ps, laneTopAugment('gideon', 'midlane'), kit);
    expect(fused.bias.length).toBeGreaterThan(0);
    expect(['agree', 'disagree', 'kit-only', 'field-only']).toContain(fused.agreement);
    // The burst lean must steer toward burst/rotation, not auto-DPS or survival.
    expect(fused.bias).toContain('burstVsSquishy');
    expect(fused.bias).not.toContain('autoDps10VsSquishy');
  });

  it('the steer actually moves the build (burst lean beats the unsteered front on burst)', () => {
    const kit = data.kits.get('gideon')!;
    const pool = completedItems(data);
    const ps = kitPlaystyle(kit, 'midlane');
    const fused = fuseSteer(ps, laneTopAugment('gideon', 'midlane'), kit);
    const steered = generateBuilds(kit, pool, cal, { level: 13, role: 'midlane', beamWidth: 8, objectiveBias: fused.bias, headlineOverride: fused.bias[0] });
    const plain = generateBuilds(kit, pool, cal, { level: 13, role: 'midlane', beamWidth: 8 });
    expect(steered.length).toBeGreaterThan(0);
    expect(steered[0]!.objectives.burstVsSquishy).toBeGreaterThanOrEqual(plain[0]!.objectives.burstVsSquishy);
  }, 60000);
});

describe('conditional Eternal loadout (major -> minor1, minor2)', () => {
  it('picks the ability-damage mage major and one conditioned minor per slot', () => {
    const kit = data.kits.get('gideon')!;
    const ps = kitPlaystyle(kit, 'midlane');
    const items = generateBuilds(kit, completedItems(data), cal, { level: 13, role: 'midlane', beamWidth: 8 })[0]!
      .items.map((n) => data.items.get(n)!).filter(Boolean);
    const lo = selectEternalLoadout(kit, items, 13, cal, ps, { role: 'midlane' });
    expect(lo).not.toBeNull();
    // Vesh is the Ability Damage Mage Eternal — the kit-fit major for Gideon.
    expect(lo!.major.name.toLowerCase()).toContain('vesh');
    expect(lo!.major.fitScore).toBeGreaterThan(0);
    expect(lo!.minor1.slot).toBe(1);
    expect(lo!.minor2.slot).toBe(2);
    expect(lo!.minor1.name).toBeTruthy();
    expect(lo!.minor2.name).toBeTruthy();
  }, 60000);
});

describe('Option-A robustness to unverified constants', () => {
  it('the kit-steered recommendation is robust; the sweep is well-formed', () => {
    const kit = data.kits.get('gideon')!;
    const ps = kitPlaystyle(kit, 'midlane');
    const fused = fuseSteer(ps, laneTopAugment('gideon', 'midlane'), kit);
    const rep = robustnessOf(kit, completedItems(data), cal, { level: 13, role: 'midlane', beamWidth: 8, objectiveBias: fused.bias, headlineOverride: fused.bias[0] });
    expect(rep.baselineTop.length).toBeGreaterThan(0);
    expect(rep.grid.length).toBe(4);           // crit{lo,hi} x K{lo,hi}
    expect(rep.swept.map((s) => s.name).sort()).toEqual(['critMultiplier', 'mitigation']);
    expect(rep.stable).toBe(true);
    expect(rep.flipConstant).toBeUndefined();
  }, 60000);

  it('the sweep is not trivially stable: it flags the unsteered pick as fragile to mitigation K', () => {
    // Without the burst steer, Gideon\'s #1 build changes between K=100 and K=150,
    // so the sweep must attribute the flip to the (unverified) mitigation constant.
    const kit = data.kits.get('gideon')!;
    const rep = robustnessOf(kit, completedItems(data), cal, { level: 13, role: 'midlane', beamWidth: 8 });
    expect(rep.stable).toBe(false);
    expect(rep.flipConstant).toContain('mitigation');
  }, 60000);
});

describe('field retrodiction validator', () => {
  it('identifies the field top core and computes a coverage score', () => {
    const kit = data.kits.get('gideon')!;
    const front = generateBuilds(kit, completedItems(data), cal, { level: 13, role: 'midlane', beamWidth: 8 });
    const headline = headlineObjective(kit, 'midlane');
    const score = agreeWithField(front, 'gideon', data.itemsBySlug, headline);
    expect(score).not.toBeNull();
    // The validator must surface the highest-n field core (n=390) and a numeric
    // coverage in [0,1]; whether the sim AGREES is a finding, not a contract.
    expect(score!.topCore?.n).toBe(390);
    expect(score!.coverage).toBeGreaterThanOrEqual(0);
    expect(score!.coverage).toBeLessThanOrEqual(1);
    expect(typeof score!.hitAtK).toBe('boolean');
  }, 60000);
});

describe('lane-conditioned playstyle (same kit, different lane)', () => {
  it('Zinx is an ally-heal enchanter in support but a poke damage hero in a damage lane', () => {
    const kit = data.kits.get('zinx')!;
    expect(kitPowerType(kit)).toBe('magical');   // hybrid tag, magical abilities

    const supp = kitPlaystyle(kit, 'support');
    expect(supp.primary).toBe('sustain');         // ally heals are the win condition here

    const mid = kitPlaystyle(kit, 'midlane');
    expect(mid.primary).not.toBe('sustain');      // heals demoted; a damage identity leads
    const midSteer = fuseSteer(mid, laneTopAugment('zinx', 'midlane'), kit);
    // The damage-lane steer must be a COMBAT objective (so generateBuilds keeps it),
    // not heal/shield output (which a combat objective set drops).
    expect(midSteer.bias).not.toContain('healShield10s');
    expect(midSteer.bias.some((k) => ['rot10VsSquishy', 'rot20VsBruiser', 'burstVsSquishy', 'autoDps10VsSquishy'].includes(k))).toBe(true);
  });

  it('the Eternal follows the lane: enchanter major in support, damage major in carry', () => {
    const kit = data.kits.get('zinx')!;
    const pool = completedItems(data);
    const build = (role: string, ps: ReturnType<typeof kitPlaystyle>) => {
      const fused = fuseSteer(ps, laneTopAugment('zinx', role), kit);
      const front = generateBuilds(kit, pool, cal, { level: 13, role, beamWidth: 8, objectiveBias: fused.bias, headlineOverride: fused.bias[0] });
      return front[0]!.items.map((n) => data.items.get(n)!).filter(Boolean);
    };
    const suppPs = kitPlaystyle(kit, 'support');
    const carryPs = kitPlaystyle(kit, 'carry');
    const suppLo = selectEternalLoadout(kit, build('support', suppPs), 13, cal, suppPs, { role: 'support' });
    const carryLo = selectEternalLoadout(kit, build('carry', carryPs), 13, cal, carryPs, { role: 'carry' });
    // Support -> Exarch (Empowerment Support); carry -> a non-support damage major.
    expect(suppLo!.major.name.toLowerCase()).toContain('exarch');
    expect(carryLo!.major.name.toLowerCase()).not.toContain('exarch');
  }, 60000);
});

describe('staged ability acquisition (the V2 skill chart drives ranks)', () => {
  it('the sim levels abilities by the recommended per-level path, ult only from its level', () => {
    const kit = data.kits.get('zinx')!;
    expect(kit.recommendedSequence?.length).toBe(18);   // the full per-level chart
    // Early game she does NOT have her ultimate yet (taken at level 6).
    expect(ranksAtLevel(kit, 5).get('ULTIMATE')).toBe(0);
    expect(ranksAtLevel(kit, 6).get('ULTIMATE')).toBe(1);
    expect(ranksAtLevel(kit, 11).get('ULTIMATE')).toBe(2);
    // Ranks follow the path, not a uniform heuristic: at level 5 one basic is
    // already ahead (Zinx maxes Bad Medicine/Ricochet early).
    const r5 = ranksAtLevel(kit, 5);
    const basics = ['PRIMARY', 'SECONDARY', 'ALTERNATE'].map((k) => r5.get(k) ?? 0);
    expect(Math.max(...basics)).toBeGreaterThan(Math.min(...basics));
    expect(basics.reduce((a, b) => a + b, 0)).toBe(5);   // 5 points spent by level 5, none on ult
  });

  it('skill order maps to the right ability slot (RMB = the Alternate ability)', () => {
    // Guards against the two omeda->kit key maps drifting apart: pred.gg maxes
    // Gideon's RMB (Void Breach) first, so it must out-rank Cosmic Rift early.
    const g = data.kits.get('gideon')!;
    const r = ranksAtLevel(g, 9);
    const rankOf = (name: string) => { const ab = g.abilities.find((a) => a.name.includes(name)); return ab ? (r.get(ab.key) ?? 0) : -1; };
    expect(rankOf('Void Breach')).toBeGreaterThan(rankOf('Cosmic Rift'));
    // Void Breach is the RMB ability, which the kit keys as ALTERNATE.
    expect(g.abilities.find((a) => a.name.includes('Void Breach'))?.key).toBe('ALTERNATE');
  });
});

describe('mana-aware objective (level + item timing)', () => {
  it('measures burst mana cadence and a mana item relieves a starved kit', () => {
    const zinx = data.kits.get('zinx')!;
    const bare = manaSustain(zinx, [], 9);
    expect(bare.combosBeforeDry).toBeLessThan(3);        // starved at L9 with no items
    const combustion = data.itemsBySlug.get('combustion'); // carries +mana
    if (combustion) {
      const withMana = manaSustain(zinx, [combustion], 9);
      expect(withMana.adequacy).toBeGreaterThan(bare.adequacy);
    }
  });

  it('the search brings mana online for a starved hero but leaves a mana-rich one alone', () => {
    const pool = completedItems(data);
    const zinx = data.kits.get('zinx')!;
    const zFront = generateBuilds(zinx, pool, cal, { level: 13, role: 'support', beamWidth: 10 });
    expect(stagedManaAdequacy(zinx, zFront[0]!.items.map((n) => data.items.get(n)!))).toBeGreaterThanOrEqual(0.9);

    // A resourceless kit can never be mana-starved, so the penalty must be inert.
    const resourceless = [...data.kits.values()].find((k) => k.resource !== 'mana');
    if (resourceless) {
      const rFront = generateBuilds(resourceless, pool, cal, { level: 13, beamWidth: 8 });
      expect(stagedManaAdequacy(resourceless, rFront[0]!.items.map((n) => data.items.get(n)!))).toBe(1);
    }
  }, 60000);
});

describe('power-type-aware pool (on-hit means magical on-hit for a mage)', () => {
  it('an on-hit steer on Zinx builds magical on-hit, never physical crit', () => {
    const kit = data.kits.get('zinx')!;
    const front = generateBuilds(kit, completedItems(data), cal, {
      level: 13, role: 'midlane', beamWidth: 10,
      objectiveBias: ['autoDps10VsSquishy', 'rot10VsSquishy'], headlineOverride: 'autoDps10VsSquishy',
    });
    const items = front[0]!.items.map((n) => data.items.get(n)!).filter(Boolean);
    // No physical power / crit / lethality leaks into a magical kit's build.
    expect(items.every((i) => i.stats.physical_power === 0 && i.stats.critical_chance === 0 && i.stats.physical_penetration === 0)).toBe(true);
    // Attack speed is kept because it powers magical on-hit (Spectra/Orion).
    expect(items.some((i) => i.stats.attack_speed > 0)).toBe(true);
  }, 60000);

  it('a physical carry still gets physical items', () => {
    const carry = [...data.kits.values()].find((k) => k.roles.includes('carry') && k.damageType !== 'magical' && k.basicScalingPct >= 90);
    if (!carry) return;
    const front = generateBuilds(carry, completedItems(data), cal, { level: 13, role: 'carry', beamWidth: 8 });
    const items = front[0]!.items.map((n) => data.items.get(n)!).filter(Boolean);
    expect(items.some((i) => i.stats.physical_power > 0 || i.stats.attack_speed > 0 || i.stats.critical_chance > 0)).toBe(true);
  }, 60000);
});

describe('attack-speed steroid abilities feed auto DPS', () => {
  it('Sparrow/Murdock keep their no-damage AS ability and it raises auto DPS', () => {
    for (const slug of ['sparrow', 'murdock']) {
      const kit = data.kits.get(slug)!;
      const asAb = kit.abilities.find((a) => a.selfAttackSpeedPctPerRank?.length);
      expect(asAb, `${slug} should retain its AS-buff ability`).toBeDefined();
      expect(asAb!.damagePerRank.length).toBe(0);   // retained despite no damage line
      // Crediting the buff raises auto DPS vs the same kit with it stripped.
      const stripped = { ...kit, abilities: kit.abilities.map((a) => ({ ...a, selfAttackSpeedPctPerRank: undefined })) };
      const items = ['deathstalker', 'viper', 'plasma-blade'].map((s) => data.itemsBySlug.get(s)!).filter(Boolean);
      const withBuff = evaluateBuild(kit, items, 13, cal).objectives.autoDps10VsSquishy;
      const without = evaluateBuild(stripped, items, 13, cal).objectives.autoDps10VsSquishy;
      expect(withBuff).toBeGreaterThan(without);
    }
  });
});

describe('evolving items (buy the source, credit the evolved value)', () => {
  it('evolved forms are not buildable; the purchasable source is', () => {
    const pool = completedItems(data).map((i) => i.slug);
    for (const target of ['orb-of-enlightenment', 'alternata', 'cybernetic-drive']) expect(pool).not.toContain(target);
    for (const source of ['orb-of-growth', 'alternator', 'catalytic-drive']) expect(pool).toContain(source);
  });

  it('Orb of Growth is credited at its evolved per-level growth', () => {
    const orb = [data.itemsBySlug.get('orb-of-growth')!];
    const early = effectiveTotals(orb, resolveItemEffects(orb, { level: 3 })).magical_power;
    const late = effectiveTotals(orb, resolveItemEffects(orb, { level: 18 })).magical_power;
    expect(late).toBeGreaterThan(early);   // grows with level (evolution payoff)
  });

  it('Catalytic Drive carries its evolved armor multiplier', () => {
    const eff = resolveItemEffects([data.itemsBySlug.get('catalytic-drive')!], { level: 13 });
    expect(eff.armorMultiplier).toBeGreaterThan(1);
  });
});

describe('slice isolation (the other 51 heroes are untouched)', () => {
  it('non-target heroes still produce non-empty, deterministic fronts', () => {
    for (const slug of ['greystone', 'murdock', 'muriel']) {
      const kit = data.kits.get(slug);
      if (!kit) continue;
      const a = generateBuilds(kit, completedItems(data), cal, { level: 13, beamWidth: 8 });
      const b = generateBuilds(kit, completedItems(data), cal, { level: 13, beamWidth: 8 });
      expect(a.length).toBeGreaterThan(0);
      expect(a[0]!.items).toEqual(b[0]!.items);   // deterministic, no playstyle leakage
    }
  }, 60000);
});
