import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadData, parseDamage } from '../src/data.js';
import { abilityHit, itemTotals, loadCalibration, rotationDamage } from '../src/sim.js';

const data = loadData();
const murdock = data.kits.get('murdock')!;
const stats = { ...itemTotals([]), physical_power: 100, magical_power: 200 };

describe('catalog damage channels and ranks', () => {
  it('does not resurrect old damage on Muriel\'s current shield-only E', () => {
    const shield = data.kits.get('muriel')!.abilities.find(a => a.key === 'SECONDARY')!;
    expect(shield.damagePerRank).toEqual([]);
    expect(shield.healing?.[0]?.valuesPerRank).toEqual([80, 120, 160, 200, 240]);
    expect(data.staleFallbacks).toEqual([]);
  });
  it('uses both powers for magical traps, independent of damage type', () => {
    const trap = murdock.abilities.find(a => a.key === 'PRIMARY')!;
    expect(trap.damageType).toBe('magical');
    expect(abilityHit(trap, 1, stats)).toBe(380); // 40 + 100 AD + 240 AP
    expect(abilityHit(trap, 5, stats)).toBe(540);
    expect(abilityHit(trap, 0, stats)).toBe(0);
  });
  it('uses the selected Buckshot rank, not the mean ratio', () => {
    const shot = murdock.abilities.find(a => a.key === 'ALTERNATE')!;
    expect(abilityHit(shot, 1, stats)).toBe(160);
    expect(abilityHit(shot, 5, stats)).toBe(360);
  });
  it('retains physical type and both power channels on the armor-bypassing ultimate', () => {
    const ult = murdock.abilities.find(a => a.key === 'ULTIMATE')!;
    expect(ult.damageType).toBe('physical');
    expect(ult.ignoresArmor).toBe(true);
    expect(abilityHit(ult, 3, stats)).toBe(900);
    const solo = { ...murdock, abilities: [ult] };
    const opts = { level: 18, ranks: new Map([['ULTIMATE', 3]]) };
    expect(rotationDamage(solo, { ...opts, profile: loadCalibration().referenceProfiles.tank }, stats, 1))
      .toBe(rotationDamage(solo, { ...opts, profile: null }, stats, 1));
  });
  it('keeps true damage separate from its physical-power scaling', () => {
    const ab = data.kits.get('adele')!.abilities.find(a => a.key === 'ALTERNATE')!;
    expect(ab.damageType).toBe('true');
    expect(abilityHit(ab, 1, stats)).toBe(120);
  });
  it('does not absorb power ratios from a following heal', () => {
    const parsed = parseDamage('deals 40 <AttackDamageText>(+100%)</> magical damage. Heals 50 <AbilityPowerText>(+200%)</> Health.');
    expect(parsed?.powerScaling).toEqual({ physical: [100] });
  });
});

describe('augment catalog alignment', () => {
  const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
  const catalog = read('../../data/aggregates/predgg-augments.json').catalog;
  const fixtures = read('../fixtures/augments.json').targets;
  it('covers every hero augment with the current source description', () => {
    for (const [id, entry] of Object.entries(catalog) as [string, any][]) {
      if (!entry.hero) continue;
      const key = `augment:${entry.hero}:${id}`;
      expect(fixtures[key], key).toBeDefined();
      expect(fixtures[key].sourceText, key).toBe(entry.description);
    }
  });
  it('pins changed damage, cooldown, and healing effects', () => {
    expect(fixtures['augment:murdock:85'].effects[0].pct).toBe(15);
    expect(fixtures['augment:drongo:30'].effects.slice(0, 2).map((x: any) => x.pct)).toEqual([80, -50]);
    expect(fixtures['augment:eden:152'].effects[1]).toEqual({kind: 'ability_cooldown', abilityKey: 'PRIMARY', pct: 10});
    expect(fixtures['augment:maco:157'].effects[0].valuesPerRank).toEqual([400, 600, 800]);
  });
});

describe('item source coverage and corrected effects', () => {
  const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
  const items = read('../../data/catalog/items.json');
  const targets = read('../fixtures/effects.json').targets;
  it('lists every item effect, including explicitly unmodeled entries', () => {
    for (const item of items) {
      if (!item.effects.length) continue;
      const entry = targets[`item:${item.slug}`];
      expect(entry, item.slug).toBeDefined();
      for (const effect of item.effects) {
        expect(entry.sourceText, item.slug).toContain(effect.menu_description.trim());
      }
    }
  });
  it('pins corrected item magnitudes and distinguishes cooldown from duration', () => {
    const fx = (slug: string) => targets[`item:${slug}`].effects;
    expect(fx('oathkeeper')[0]).toMatchObject({flat: 65, icdSeconds: 1.5});
    expect(fx('cursed-scroll')[0]).toMatchObject({flat: 20, scalingPct: 3.5});
    expect(fx('resolution')[0].scalingPct).toBe(2.5);
    expect(fx('tyranny')[0].amount).toBe(20);
    expect(fx('orb-of-growth')[1].perLevel).toBe(12);
    expect(fx('vainglory').every((e: any) => e.kind === 'unmodeled')).toBe(true);
    expect(fx('viper').some((e: any) => e.kind === 'damage_amp' && e.scope === 'all')).toBe(false);
  });
});
