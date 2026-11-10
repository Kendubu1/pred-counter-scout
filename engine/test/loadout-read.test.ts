import { describe, it, expect } from 'vitest';
import { evaluate, loadoutRead } from '../src/loadout-read.js';

describe('loadout read', () => {
  it('evaluates numbers for this game', () => {
    expect(evaluate('Deals 7% (+0.4% per minute) of that damage.', { durationMin: 30, level: 16 })[0]).toMatch(/about 19% by the end/);
    expect(evaluate('Deal 1.5 (+0.4 per level) Physical Damage On-Hit.', { durationMin: 30, level: 18 })[0]).toMatch(/8\.7 at level 18/);
    expect(evaluate('Grants 10-34% Attack Speed while active. Increases with Hero Level.', { durationMin: 30, level: 10 })[0]).toMatch(/about 22\.7% at level 10/);
    const lotus = evaluate('Every 2 minutes and every Takedown randomly grants +1% Damage, +4 Ability Haste, +0.75% Move Speed, or +1.25% Max Health.', { durationMin: 26, level: 18, takedowns: 16 })[0]!;
    expect(lotus).toMatch(/29 random bonuses/);
    expect(lotus).toMatch(/about \+29 ability haste/);
    expect(evaluate('Plasma Grenade reduces its own Cooldown by 3.5s when attaching.', { durationMin: 20, level: 12, ability: { name: 'Plasma Grenade', cd: 10, cdHaste: 7 } })[0]).toMatch(/takes 3\.5s off \(50% of it\)/);
  });
  it('explains every piece and places it on the field', () => {
    const r = loadoutRead(
      { heroSlug: 'mourn', heroName: 'Mourn', role: 'offlane', loadout: { augment: { id: '129', name: 'Nightmare Extractor' }, eternal: 'Lotus', minor1: 'Early Bloom', crest: "Winter's Fury", crestSlug: 'winters-fury' } },
      {
        abilities: [{ key: 'Q', display_name: 'Contagion', cooldown: [15, 12] }, { key: 'Passive', display_name: 'Extract', cooldown: [], menu_description: 'Next basic attack deals more damage.' }],
        eternals: [{ name: 'Lotus', major: 'Every 2 minutes randomly grants +1% Damage or +4 Ability Haste.', minorSlot1: [{ name: 'Early Bloom', desc: 'Gain an additional Level upon reaching Level 12.' }], minorSlot2: [] }],
        augments: { '129': { name: 'Nightmare Extractor', description: 'Casting an Ability reduces the Cooldown of Extract by 20%.' } },
        items: new Map([['winters-fury', { display_name: "Winter's Fury", effects: [{ name: 'Chillrend', condition: null, menu_description: 'Release a sphere of icy energy.' }] }]]),
        haste: 50, level: 18, durationMin: 26,
        field: { games: 484, wins: 242, augments: [{ id: '129', name: 'Nightmare Extractor', n: 384, w: 191 }, { id: '162', name: 'Nightstalker', n: 100, w: 51 }] },
      });
    expect(r.map((x) => x.kind)).toEqual(['augment', 'Eternal', 'minor', 'crest']);
    expect(r[0]).toMatchObject({ ability: { name: 'Extract', cd: null }, field: { wr: 49.7, share: 79, verdict: 'level' } });
    expect(r[3]!.text).toMatch(/Chillrend/);
  });
});
