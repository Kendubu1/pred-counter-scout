// Kit-derived playstyle slice (Gideon). Verifies the kit-first lean, the fused
// steer, the conditional Eternal loadout, Option-A robustness, and the field
// retrodiction validator — plus that the other heroes are untouched.

import { describe, it, expect, beforeAll } from 'vitest';
import { loadData, completedItems, type LoadedData } from '../src/data.js';
import { loadCalibration, type Calibration } from '../src/sim.js';
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
