import { beforeAll, describe, expect, it } from 'vitest';
import { loadData, type LoadedData } from '../src/data.js';
import { resolveItemEffects } from '../src/effects.js';
import { loadCalibration, simulate } from '../src/sim.js';
import { reviewedImmobilization } from '../src/immobilization.js';

let data: LoadedData;
const cal = loadCalibration();
beforeAll(() => { data = loadData(); });

function contribution(slug: string, abilityKeys?: string[], rank = 1) {
  const item = data.itemsBySlug.get('spectral-schematics')!;
  const kit = structuredClone(data.kits.get(slug)!);
  if (abilityKeys) kit.abilities = kit.abilities.filter(a => abilityKeys.includes(a.key));
  const ranks = new Map(kit.abilities.map(a => [a.key, rank]));
  const effects = resolveItemEffects([item], { level: 13 });
  const opts = { level: 13, ranks, burstBasics: 0, profile: cal.referenceProfiles.squishy };
  const full = simulate(kit, [item], { ...opts, effects }, cal);
  const stats = simulate(kit, [item], { ...opts, effects: { ...effects, onAbilityProcs: [] } }, cal);
  return { burst: full.burstCombo - stats.burstCombo, rotation: full.rotation[10]! - stats.rotation[10]! };
}

describe('Spectral Schematics trigger', () => {
  it('does not award damage to spells without reviewed immobilization', () => {
    for (const slug of ['morigesh', 'shinbi', 'wraith']) {
      expect(contribution(slug)).toEqual({ burst: 0, rotation: 0 });
    }
  });
  it('counts Murdock trap once, not every damaging cast', () => {
    const hp = cal.referenceProfiles.squishy!.health;
    const expected = (40 + hp * 0.05) * 100 / (100 + cal.referenceProfiles.squishy!.magicalArmor);
    expect(contribution('murdock').burst).toBeCloseTo(expected);
    expect(contribution('murdock', ['PRIMARY']).burst).toBeCloseTo(expected);
    expect(contribution('murdock', ['ULTIMATE']).burst).toBe(0);
  });
  it('uses the eligible ability cooldown and excludes unlearned CC', () => {
    const kit = data.kits.get('murdock')!;
    const trap = kit.abilities.find(a => a.key === 'PRIMARY')!;
    const item = data.itemsBySlug.get('spectral-schematics')!;
    const cd = trap.cooldowns[0]! / (1 + item.stats.ability_haste / 100);
    const target = cal.referenceProfiles.squishy!;
    const perProc = (40 + 0.05 * target.health * 0.8) * 100 / (100 + target.magicalArmor);
    expect(contribution('murdock').rotation).toBeCloseTo(perProc * (1 + Math.floor(10 / cd)));
    expect(contribution('murdock', ['PRIMARY'], 0)).toEqual({ burst: 0, rotation: 0 });
  });
  it('credits a non-damaging stun and does not count six damage hits as six stuns', () => {
    expect(data.kits.get('grux')!.abilities.find(a => a.key === 'ULTIMATE')!.damagePerRank).toEqual([]);
    const grux = contribution('grux', ['ULTIMATE']);
    expect(grux.burst).toBeGreaterThan(0);
    expect(grux.rotation).toBeGreaterThan(0);
    expect(contribution('khaimera', ['ULTIMATE']).burst).toBeCloseTo(grux.burst);
  });
  it('does not assume empowered, charged, stack or stance conditions', () => {
    for (const [hero, key] of [['crunch', 'SECONDARY'], ['muriel', 'ALTERNATE'], ['phase', 'SECONDARY'], ['wukong', 'SECONDARY']]) {
      expect(contribution(hero!, [key!]).burst).toBe(0);
    }
  });
  it('requires review when a credited ability description changes', () => {
    expect(() => reviewedImmobilization('murdock', 'Q', 'changed source')).toThrow('source changed');
    expect(reviewedImmobilization('phase', 'RMB', 'Pull your ally')).toBe(false);
  });
});
