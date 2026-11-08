import { describe, it, expect } from 'vitest';
import { damageMix } from '../src/damage-mix.js';

const pl = (us: boolean, hero: string, d: [number, number, number], extra: any = {}) => ({ us, heroName: hero, heroSlug: hero.toLowerCase(), stream: { dealtToHeroes: { physical: d[0], magical: d[1], true: d[2] } }, ...extra });
const items = new Map<string, any>([['guard', { slug: 'guard', display_name: 'Guard', stats: { magical_armor: 30 } }], ['spectra', { slug: 'spectra', display_name: 'Spectra', effects: [{ condition: 'On hit:', menu_description: 'Deal 20 <TrueText>True Damage</TrueText>.' }] }]]);
const bands = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, n: 2000, w: i === 2 ? 1062 : i >= 5 ? 900 : 1000 }));

describe('damage mix', () => {
  it('sums each team by type, names true damage sources, and places the magical share on the patch bands', () => {
    const m = damageMix([pl(true, 'Kira', [30000, 0, 1000]), pl(true, 'Belica', [0, 20000, 0], { items: [{ slug: 'guard' }] }), pl(false, 'Serath', [20000, 10000, 6000], { items: [{ slug: 'spectra' }] }), pl(false, 'Fey', [0, 36000, 0])],
      { items, eternals: [], augments: {}, abilities: new Map(), teamMix: { magical: bands } })!;
    expect(m.us).toEqual({ physical: 30000, magical: 20000, true: 1000, total: 51000 });
    expect(m.them.total).toBe(72000);
    expect(m.trueFrom[0]).toMatchObject({ hero: 'Serath', share: 17, from: [{ name: 'Spectra', kind: 'item' }] });
    expect(m.field?.them?.band).toBe('60-70% magical');
    expect(m.field?.best).toMatch(/^20-30% magical/);
    expect(m.armor.us).toEqual({ faced: 'magical', physical: [], magical: ['Belica'], of: 2 });
    expect(m.armor.them.faced).toBe('physical');
  });
  it('needs stream detail for every player', () => {
    expect(damageMix([{ us: true, heroName: 'X', heroSlug: 'x' } as any], { items, eternals: [], augments: {}, abilities: new Map() })).toBeNull();
  });
});
