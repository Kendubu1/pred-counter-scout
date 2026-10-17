import { describe, expect, it } from 'vitest';
import { fixedCooldownProcCount } from '../src/proc-timeline.js';
import { loadData } from '../src/data.js';
import { emptyEffects, resolveItemEffects, type ProcSpec } from '../src/effects.js';
import { effectiveTotals, loadCalibration, rotationDamage, simulate } from '../src/sim.js';

const data = loadData(), cal = loadCalibration();
const belica = data.kits.get('lt-belica')!;
const abilities = belica.abilities.filter(a => a.damagePerRank.length).slice(0, 2);
const proc: ProcSpec = {flat:10, scalingPct:0, scaleStat:null, pctTargetHealth:0, pctTargetHealthRanged:0, healthBasis:'max', minDamage:0, fromItem:true, everyN:1, icdSeconds:15, damageType:'magical', rampSeconds:0};

describe('fixed-cooldown delivered-event timeline', () => {
  it('does not invent hits when the cooldown becomes ready', () => {
    expect(fixedCooldownProcCount([0, 0], 15)).toBe(1);
    expect(fixedCooldownProcCount([0, 10, 20], 15)).toBe(2);
    expect(fixedCooldownProcCount([], 15)).toBe(0);
  });
  it('shares cooldown between simultaneous hits and accepts the readiness boundary', () => {
    expect(fixedCooldownProcCount([15, 0, 0, 14, 15], 15)).toBe(2);
    expect(fixedCooldownProcCount([0, 0, 0], 0)).toBe(3);
    expect(() => fixedCooldownProcCount([NaN], 15)).toThrow();
    expect(() => fixedCooldownProcCount([0], -1)).toThrow();
  });
  it('production Combustion grants only one Pyro for two opening hits with no recast', () => {
    const item = data.itemsBySlug.get('combustion')!;
    const effects = resolveItemEffects([item], {level:13});
    const none = {...effects, onAbilityProcs:[]};
    const kit = {...belica, abilities:abilities.map(a => ({...a, cooldowns:[100]}))};
    const totals = effectiveTotals([item], effects);
    const opts = {level:13, profile:null, ranks:new Map(kit.abilities.map(a => [a.key, 1]))};
    const delta = rotationDamage(kit, {...opts, effects}, totals, 20)
      - rotationDamage(kit, {...opts, effects:none}, totals, 20);
    expect(delta).toBeCloseTo(50 + .18 * totals.magical_power);
  });
  it('production waits for the next actual ability hit after readiness', () => {
    const kit = {...belica, abilities:[{...abilities[0]!, cooldowns:[10]}]};
    const effects = {...emptyEffects(), onAbilityProcs:[proc]};
    const totals = effectiveTotals([], effects);
    const opts = {level:13, profile:null, ranks:new Map([[kit.abilities[0]!.key, 1]])};
    const delta = (window:number) => rotationDamage(kit, {...opts, effects}, totals, window)
      - rotationDamage(kit, opts, totals, window);
    expect(delta(19)).toBeCloseTo(10);
    expect(delta(20)).toBeCloseTo(20);
  });
  it('non-damaging control supplies timed immobilizations but no ability-hit procs', () => {
    const control = {...abilities[0]!, damagePerRank:[], immobilizes:true, cooldowns:[10]};
    const kit = {...belica, abilities:[control]};
    const effects = {...emptyEffects(), onAbilityProcs:[{...proc, trigger:'immobilize' as const}]};
    const totals = effectiveTotals([], effects);
    const opts = {level:13, profile:null, ranks:new Map([[control.key, 1]])};
    expect(rotationDamage(kit, {...opts, effects}, totals, 19)).toBeCloseTo(10);
    expect(rotationDamage(kit, {...opts, effects}, totals, 20)).toBeCloseTo(20);
    expect(rotationDamage(kit, {...opts, effects:{...effects, onAbilityProcs:[proc]}}, totals, 20)).toBe(0);
  });
  it('burst simultaneous hits cannot consume a second fixed-cooldown proc', () => {
    const kit = {...belica, abilities};
    const effects = {...emptyEffects(), onAbilityProcs:[{...proc, icdSeconds:1}]};
    const opts = {level:13, profile:null, burstBasics:0, ranks:new Map(abilities.map(a => [a.key, 1]))};
    const bare = simulate(kit, [], opts, cal), withProc = simulate(kit, [], {...opts, effects}, cal);
    expect(withProc.burstCombo - bare.burstCombo).toBeCloseTo(10);
    expect(withProc.teamfightBurst - bare.teamfightBurst).toBeCloseTo(10);
  });
});
