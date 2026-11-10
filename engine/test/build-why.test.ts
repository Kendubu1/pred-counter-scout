import { describe, it, expect } from 'vitest';
import { buildWhy } from '../src/build-why.js';

const items = new Map<string, any>([
  ['combustion', { slug: 'combustion', display_name: 'Combustion', stats: {}, effects: [{ name: 'Pyro', condition: '<Condition>On dealing Ability Damage:</Condition>', menu_description: '• Deal 50 Damage to the Target and nearby Enemies.' }] }],
  ['megacosm', { slug: 'megacosm', display_name: 'Megacosm', stats: { max_health: 250 }, effects: [{ name: 'Disintegrate', condition: '<Condition> On dealing Ability Damage:</Condition>', menu_description: "• Deal 2.5% of Target's Max Health as Damage over 3s." }] }],
  ['guard', { slug: 'guard', display_name: 'Guard', stats: { magical_armor: 30, max_health: 400 } }],
  ['tainted-guard', { slug: 'tainted-guard', display_name: 'Tainted Guard', stats: { physical_armor: 30 } }],
]);
const eternals = [{ name: 'Vesh', major: 'Ability damage dealt to Enemy Heroes deals 7% of that damage as a DoT over 3s.', minorSlot1: [], minorSlot2: [{ name: 'Mind Rot', desc: "The major also deals 2% of the target's current health as bonus damage." }] }];
const kit = [{ key: 'Q', name: 'Bramble Patch', damage: true, aoe: true }, { key: 'E', name: 'Harvest Nettles', damage: true, aoe: false }, { key: 'LMB', name: 'Floret', damage: true, aoe: false }];
const fey = { heroName: 'The Fey', role: 'midlane', deaths: 2, items: [{ slug: 'combustion' }, { slug: 'megacosm' }], loadout: { eternal: 'Vesh', minor2: 'Mind Rot' } };

describe('why a build worked', () => {
  const w = buildWhy(fey, { items, eternals, augments: {}, kit, haste: 48, damageType: 'magical',
    foes: [{ hero: 'Lt. Belica', items: [], diedTo: 4 }, { hero: 'Khaimera', items: [{ slug: 'guard' }], diedTo: 3 }, { hero: 'Kira', items: [{ slug: 'tainted-guard' }], diedTo: 0 }],
    field: { games: 6326, wins: 3252, eternal: { name: 'Vesh', n: 3600, w: 1796, pair: { n: 1932, w: 942 } }, core: { n: 795, w: 431 }, coreBase: { n: 3000, w: 1674 } } });
  it('finds effects on one trigger, with the Eternal and a minor that changes the major', () => {
    const ab = w.stacks.find((s) => s.family === 'ability')!;
    expect(ab.members.map((m) => m.name)).toEqual(['Combustion', 'Megacosm', 'Vesh', 'Mind Rot']);
    expect(ab.text).toMatch(/Bramble Patch hit an area/);
    expect(ab.text).toMatch(/32% sooner/);
    expect(w.stacks.some((s) => s.family === 'pctHealth')).toBe(true);
    expect(w.eternalPart).toMatch(/^The Eternal was part of it: Vesh/);
  });
  it('checks whether we countered it', () => {
    expect(w.countered[0]).toEqual({ ok: false, text: '1 of the 2 players The Fey killed built magical armor (Khaimera).' });
    expect(w.countered.some((c) => /Health items on Khaimera/.test(c.text))).toBe(true);
  });
  it('judges the Eternal pair against the hero and the core against its cores', () => {
    expect(w.copy?.verdict).toBe('beat-us');
    expect(w.copy?.text).toMatch(/48\.8% .* below the hero's 51\.4%/);
  });
});
