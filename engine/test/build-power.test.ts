import { describe, it, expect } from 'vitest';
import { powerProfile, powerLesson } from '../src/build-power.js';

const items = new Map<string, any>([
  ['caustica', { slug: 'caustica', display_name: 'Caustica', stats: { magical_power: 75 }, effects: [{ name: 'Magus', condition: null, menu_description: '• Ignore <AbilityPowerText>35%</AbilityPowerText> of <AbilityPowerText>Magical Armor</AbilityPowerText>.' }] }],
  ['wraith-leggings', { slug: 'wraith-leggings', display_name: 'Wraith Leggings', stats: { magical_power: 100, magical_penetration: 11 }, effects: [{ name: 'Carnage', condition: '<Condition>Against Heroes below</Condition> <HealthText>40% Health</HealthText><Condition>:</Condition>', menu_description: '• Abilities deal 12% bonus Magical Damage.' }, { name: '', condition: null, menu_description: 'Damage Dealt: <EffectText>{DamageDealt}</EffectText>' }] }],
  ['guard', { slug: 'guard', display_name: 'Guard', stats: { magical_armor: 30 } }],
]);
const ctx = (targets: any[]) => ({
  items, teamDamage: 100000, durationMin: 30, level: 17, powerType: 'magical' as const,
  heroStats: new Map([['belica', { magical_armor: Array(18).fill(47) }]]),
  targets,
  eternals: [{ name: 'Vesh', major: 'Ability damage dealt to Enemy Heroes deals 7% (+0.4% per minute) of that damage as a DoT over 3s.', minorSlot1: [], minorSlot2: [] }],
  augments: {},
});
const fey = { heroName: 'The Fey', damageToHeroes: 36188, deaths: 2, items: [{ slug: 'caustica' }, { slug: 'wraith-leggings' }], loadout: { eternal: 'Vesh' } };

describe('build power', () => {
  it('applies percent then flat penetration to each target\'s armor (K=100)', () => {
    const pp = powerProfile(fey, ctx([{ name: 'Willy', heroSlug: 'belica', heroName: 'Lt. Belica', items: [], diedTo: 4 }]));
    expect(pp.power).toBe(175);
    expect(pp.pen).toMatchObject({ flat: 11, pct: 35 });
    // 47 * 0.65 - 11 = 19.55; (100 + 47) / (100 + 19.55) = 1.23
    expect(pp.vs[0]).toMatchObject({ armor: 47, after: 20, more: 23, diedTo: 4 });
    expect(pp.dealt).toEqual({ damage: 36188, share: 36 });
  });
  it('lists damage boosts in plain words, skips placeholders, grows per-minute effects', () => {
    const pp = powerProfile(fey, ctx([]));
    expect(pp.amps.map((a) => a.name)).toEqual(['Wraith Leggings', 'Vesh']);
    expect(pp.amps[1]!.how).toMatch(/about 19% by the end/);
    expect(pp.sustain).toBeNull();
  });
  it('writes a penetration lesson only when it clearly mattered', () => {
    const big = powerProfile(fey, ctx([{ name: 'W', heroSlug: 'belica', heroName: 'Lt. Belica', items: [{ slug: 'guard' }], diedTo: 2 }]));
    expect(powerLesson(big, 'The Fey')).toMatch(/Lt\. Belica took about \d+% more magical damage/);
    const none = powerProfile({ ...fey, items: [] }, ctx([{ name: 'W', heroSlug: 'belica', heroName: 'Lt. Belica', items: [], diedTo: 1 }]));
    expect(powerLesson(none, 'The Fey')).toBeNull();
  });
});
