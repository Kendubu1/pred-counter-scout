import { describe, expect, it } from 'vitest';
import { loadData } from '../src/data.js';
import { emptyEffects, type ProcSpec } from '../src/effects.js';
import { effectiveTotals, rotationDamage, type DeliveredAbilityHit } from '../src/sim.js';

const original = loadData().kits.get('lt-belica')!;
const ab = original.abilities.find(a => a.damagePerRank.length)!;
const kit = {...original, abilities:[{...ab, cooldowns:[10]}]};
const totals = effectiveTotals([], emptyEffects());
const opts = {level:13, profile:null, ranks:new Map([[ab.key,1]])};
const proc: ProcSpec = {flat:10, scalingPct:0, scaleStat:null, pctTargetHealth:0, pctTargetHealthRanged:0, healthBasis:'max', minDamage:0, fromItem:true, everyN:1, icdSeconds:15, damageType:'magical', rampSeconds:0};
const event = (time:number, activationId='stored'):DeliveredAbilityHit => ({time, activationId, abilityKey:ab.key, abilityProcEligible:true, markedProcEligible:true, immobilizeProcEligible:false});
const run = (hits:DeliveredAbilityHit[], p?:ProcSpec, window=20) => rotationDamage(kit, {...opts, effects:{...emptyEffects(), onAbilityProcs:p?[p]:[]}}, totals, window, hits);

describe('explicit delivered ability scenarios', () => {
  it('replaces automatic delivery completely, including empty schedules and delayed hits', () => {
    expect(run([])).toBe(0);
    const single = run([event(0)]);
    expect(single).toBeGreaterThan(0);
    expect(run([event(2),event(21)])).toBe(single);
    expect(run([event(2)],undefined,1)).toBe(0);
    expect(rotationDamage(kit, opts, totals,20)).toBeCloseTo(single*3);
  });
  it('uses the same delivered packets for damage and cooldown proc timing', () => {
    const hits=[event(0),event(14),event(20)];
    expect(run(hits,proc)-run(hits)).toBeCloseTo(20);
    expect(run(hits.slice(0,2),proc)-run(hits.slice(0,2))).toBeCloseTo(10);
  });
  it('retains damage when item-trigger eligibility is excluded', () => {
    const hits=[{...event(0),abilityProcEligible:false}];
    expect(run(hits,proc)).toBe(run(hits));
    expect(run(hits)).toBeGreaterThan(0);
  });
  it('retains stored identities across repeated packets instead of inventing activations', () => {
    const mark={...proc,trigger:'marked_target' as const,markDurationSeconds:4};
    const repeated=[event(0),event(1)];
    expect(run(repeated,mark)-run(repeated)).toBe(0);
    const fresh=[event(0),event(1,'new')];
    expect(run(fresh,mark)-run(fresh)).toBeCloseTo(10);
    const excluded=[event(0),{...event(1,'new'),markedProcEligible:false}];
    expect(run(excluded,mark)-run(excluded)).toBe(0);
  });
  it('requires explicit immobilization eligibility, independently of damage triggers', () => {
    const control={...proc,trigger:'immobilize' as const};
    expect(run([event(0)],control)-run([event(0)])).toBe(0);
    const hit={...event(0),immobilizeProcEligible:true,abilityProcEligible:false};
    expect(run([hit],control)-run([hit])).toBeCloseTo(10);
  });
  it('rejects malformed or unranked scenario packets', () => {
    for (const hit of [{...event(0),time:NaN},{...event(0),time:-1},{...event(0),activationId:''},{...event(0),abilityKey:'unknown'}]) {
      expect(()=>run([hit])).toThrow('Invalid delivered ability schedule');
    }
    expect(()=>rotationDamage(kit,{...opts,ranks:new Map()},totals,20,[event(0)])).toThrow();
  });
});
