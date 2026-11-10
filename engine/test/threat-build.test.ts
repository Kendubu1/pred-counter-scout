import { describe, it, expect } from 'vitest';
import { threatBuild, takedownTimes } from '../src/threat-build.js';
import { buildNotes } from '../src/build-notes.js';

const fey = { abilities: [
  { key: 'E', display_name: 'Harvest Nettles', cooldown: [5, 4.5, 4, 3.5, 3] },
  { key: 'R', display_name: 'Fly Trap', cooldown: [125, 110, 95] },
  { key: 'Passive', display_name: "Nature's Vengeance", menu_description: 'Each time The Fey achieves a Takedown she spawns an Untamed Growth.' },
] };
const items = new Map<string, any>([
  ['megacosm', { slug: 'megacosm', display_name: 'Megacosm', stats: { ability_haste: 10 } }],
  ['epoch', { slug: 'epoch', display_name: 'Epoch', stats: { ability_haste: 8 } }],
  ['overseer', { slug: 'overseer', display_name: 'Overseer', stats: { magical_lifesteal: 7 }, effects: [{ name: 'Exalted', condition: '<Condition>Enhance your Ultimate Ability:</Condition>', menu_description: '• Heals you for 25% of the damage dealt to Heroes.' }] }],
]);
const eternals = [{ name: 'Vesh', major: 'Ability damage deals a DoT.', minorSlot1: [{ name: 'Tithe of Death', desc: 'Takedowns restore 15% Max Mana and permanently grant 2 Ability Haste, up to 30 Ability Haste.' }], minorSlot2: [] }];
const augments = { '40': { name: 'Natural Infusion', description: 'Damaging Heroes with Harvest Nettles grants 10 Ability Haste for 6s, stacking infinitely.' } };
const player = { heroSlug: 'the-fey', heroName: 'The Fey', kills: 11, deaths: 2, assists: 11, items: [{ slug: 'megacosm' }, { slug: 'overseer' }], loadout: { eternal: 'Vesh', minor1: 'Tithe of Death', augment: { id: '40', name: 'Natural Infusion' }, crest: 'Epoch', crestSlug: 'epoch' } };

describe('threat build', () => {
  it('counts haste sources and applies the verified cooldown formula', () => {
    const tb = threatBuild(player, { hero: fey, items, eternals, augments });
    expect(tb.haste.total).toBe(48); // 10 + 8 + min(30, 2 x 22)
    expect(tb.ult).toMatchObject({ name: 'Fly Trap', base: 95, endGame: 64.2 });
    // Nettles at 48 haste: 3 x 100 / 148 = 2.03s, so 3 stacks inside 6s -> +30
    expect(tb.haste.fightBonus?.amount).toBe(30);
    expect(tb.ult?.inFight).toBe(53.4);
    expect(tb.fedBy.map((x) => x.split(':')[0])).toEqual(['Tithe of Death (minor)', "Nature's Vengeance (passive)"]);
    expect(tb.lines[0]).toMatch(/^Lesson: takedowns were the fuel/);
    expect(tb.lines.join(' ')).toMatch(/anti-heal/);
  });
  it('places takedowns by kill time and spreads assists over the team\'s other kills', () => {
    const kills = [{ min: 5, killerSlug: 'the-fey', killerSide: 'them' }, { min: 10, killerSlug: 'kaelen', killerSide: 'them' }, { min: 20, killerSlug: 'steel', killerSide: 'them' }, { min: 12, killerSlug: 'kira', killerSide: 'us' }];
    expect(takedownTimes('the-fey', 1, kills, 'them')).toEqual([5, 20]);
  });
});

describe('build notes: core vs the lane opponent', () => {
  const players = [{ pid: 'a', us: true, heroSlug: 'lt-belica', heroName: 'Lt. Belica', role: 'midlane', items: [{ slug: 'combustion', name: 'Combustion' }] }, { pid: 'x', us: false, heroSlug: 'the-fey', heroName: 'The Fey', role: 'midlane' }];
  const cat = new Map([['combustion', { slug: 'combustion', name: 'Combustion', stats: {} }], ['noxia', { slug: 'noxia', name: 'Noxia', stats: {} }], ['wraith-leggings', { slug: 'wraith-leggings', name: 'Wraith Leggings', stats: {} }], ['oblivion-crown', { slug: 'oblivion-crown', name: 'Oblivion Crown', stats: {} }]]);
  const run = (cores: { coreSlugs: string[]; n: number; w: number }[]) => buildNotes(players as any, null, {}, cat as any, new Map(), {}, {}, {}, {}, {}, { 'lt-belica|midlane|the-fey': { n: 580, w: 286, cores } })[0]!.coreVs;
  it('only lets a core with 10% of the pair\'s games lead, and labels a lone one most played', () => {
    const v = run([{ coreSlugs: ['combustion', 'noxia', 'wraith-leggings'], n: 133, w: 67 }, { coreSlugs: ['combustion', 'wraith-leggings', 'oblivion-crown'], n: 21, w: 12 }]);
    expect(v).toMatchObject({ vs: 'The Fey', n: 133, basis: 'most played' });
    expect(v!.items[0]).toMatchObject({ slug: 'combustion', has: true });
  });
  it('is null without matchup data', () => { expect(run([])).toBeNull(); });
});
