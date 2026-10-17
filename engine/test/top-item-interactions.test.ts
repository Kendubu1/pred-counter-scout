import { describe, it, expect } from 'vitest';
import { loadData } from '../src/data.js';
import { emptyEffects, resolveItemEffects, mergeEffects } from '../src/effects.js';
import { basicDamageWithShred, effectiveTotals, simulate, loadCalibration } from '../src/sim.js';
const data = loadData(), cal = loadCalibration();
const kit = data.kits.get('kira')!, death = data.itemsBySlug.get('deathstalker')!;
const profile = {...cal.referenceProfiles.squishy!, physicalArmor: 100};
const t = effectiveTotals([], emptyEffects());
describe('reviewed top-item interactions', () => {
 it('does not grant Carnage to Belica against a full-health target', () => {
   const belica = data.kits.get('lt-belica')!;
   const leggings = data.itemsBySlug.get('wraith-leggings')!;
   const actual = simulate(belica, [leggings], {level:13, profile, effects:resolveItemEffects([leggings], {level:13})}, cal);
   const statsOnly = simulate(belica, [leggings], {level:13, profile, effects:emptyEffects()}, cal);
   expect(actual.burstCombo).toBe(statsOnly.burstCombo);
   expect(actual.rotation).toEqual(statsOnly.rotation);
   // No replacement low-health uptime estimate may leak into sustained basics.
   expect(actual.autoDps).toBe(statsOnly.autoDps);
 });
 it('builds Deathstalker after hits and respects expiry between sparse hits', () => {
   const eff = resolveItemEffects([death], {level: 13});
   expect(eff.flatPen.physical).toBe(0);
   expect(basicDamageWithShred(100, 1, 1, profile, t, eff, 1)).toBe(50);
   expect(basicDamageWithShred(100, 2, 1, profile, t, eff, 2)).toBeCloseTo(50 + 10000 / 197);
   expect(basicDamageWithShred(100, 6, 1, profile, t, eff, 6)).toBeCloseTo([200,197,194,191,188,188].reduce((n,x)=>n+10000/x,0));
   expect(basicDamageWithShred(100, 2, 0.25, profile, t, eff, 8)).toBe(100);
   expect(mergeEffects(emptyEffects(),eff).onHitArmorShred).toEqual(eff.onHitArmorShred);
 });
 it('applies flat armor reduction before percent penetration', () => {
   const eff = resolveItemEffects([death], {level: 13});eff.pctPen.physical=50;
   expect(basicDamageWithShred(100, 2, 1, profile, t, eff, 2)).toBeCloseTo(10000/150+10000/148.5);
 });
 it('never grants Deathstalker stacks to a spell-only rotation', () => {
   const eff=resolveItemEffects([death],{level:13}), none={...eff,onHitArmorShred:[]};
   expect(simulate(kit,[death],{level:13,effects:eff,profile},cal).rotation).toEqual(simulate(kit,[death],{level:13,effects:none,profile},cal).rotation);
 });
 it.each(['oathkeeper','augmentation'])('%s requires a consuming attack', slug => {
   const item=data.itemsBySlug.get(slug)!,eff=resolveItemEffects([item],{level:13});
   const a=simulate(kit,[item],{level:13,effects:eff,profile,burstBasics:0},cal);
   const b=simulate(kit,[item],{level:13,effects:{...eff,onAbilityProcs:[]},profile,burstBasics:0},cal);
   expect(a.burstCombo).toBe(b.burstCombo);expect(a.rotation).toEqual(b.rotation);
 });
 it('Augmentation uses hero base physical power instead of item power', () => {
   const item=data.itemsBySlug.get('augmentation')!,eff=resolveItemEffects([item],{level:13});
   const delta=(bonus:number)=>{
     const e={...eff,statFlat:{...eff.statFlat,physical_power:bonus}};
     return simulate(kit,[item],{level:13,effects:e,burstBasics:1},cal).burstCombo-simulate(kit,[item],{level:13,effects:{...e,onAbilityProcs:[]},burstBasics:1},cal).burstCombo;
   };
   expect(delta(0)).toBeCloseTo(kit.baseStats.physical_power[12]!*.9);
   expect(delta(500)).toBeCloseTo(delta(0));
 });
 it('keeps Tainted Rounds damage magical despite its physical power scaling', () => {
   expect(resolveItemEffects([data.itemsBySlug.get('tainted-rounds')!],{level:13}).onHitProcs[0]!.damageType).toBe('magical');
 });
});
