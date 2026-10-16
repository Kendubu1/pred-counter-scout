import { describe, it, expect } from 'vitest';
import { loadData } from '../src/data.js';
import { resolveItemEffects } from '../src/effects.js';
import { simulate, combatDamage, loadCalibration } from '../src/sim.js';
const data = loadData(), cal = loadCalibration();
const kit = data.kits.get('kira')!, item = data.itemsBySlug.get('solaris')!;
const effects = resolveItemEffects([item], {level: 13});
const plain = {...effects, onAbilityProcs: []};
const options = {level: 13, profile: cal.referenceProfiles.squishy};
describe('Solaris consuming attack requirement', () => {
  it('excludes the proc from spells alone and basics without casts', () => {
    const a = simulate(kit, [item], {...options, effects, burstBasics: 0}, cal);
    const b = simulate(kit, [item], {...options, effects: plain, burstBasics: 0}, cal);
    expect(a.burstCombo).toBe(b.burstCombo);
    expect(a.rotation).toEqual(b.rotation);
    expect(a.autoDps).toBe(b.autoDps);
  });
  it('caps burst procs by basics and requires learned casts', () => {
    const delta = (basics: number, ranks?: Map<string, number>) =>
      simulate(kit, [item], {...options, ranks, burstBasics: basics, effects}, cal).burstCombo -
      simulate(kit, [item], {...options, ranks, burstBasics: basics, effects: plain}, cal).burstCombo;
    expect(delta(1)).toBeGreaterThan(0);
    expect(delta(2)).toBeCloseTo(delta(1) * 2);
    expect(delta(2, new Map())).toBe(0);
  });
  it('retains mixed-combat credit but none without casts', () => {
    expect(combatDamage(kit, [item], {...options, effects}, cal, 10)).toBeGreaterThan(combatDamage(kit, [item], {...options, effects: plain}, cal, 10));
    expect(combatDamage(kit, [item], {...options, ranks: new Map(), effects}, cal, 10)).toBe(combatDamage(kit, [item], {...options, ranks: new Map(), effects: plain}, cal, 10));
  });
});
