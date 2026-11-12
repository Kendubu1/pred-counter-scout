import { describe, it, expect } from 'vitest';
import { readTeamComp, type CompPlayer, type FieldReport } from '../src/comp-read.js';
import type { HeroTags } from '../src/team-comp.js';

const T = (o: Partial<HeroTags>): HeroTags => ({ cls: 'MAGE', frontline: false, engage: false, diver: false, enchanter: false, ...o });
const tags = new Map<string, HeroTags>([
  ['tank', T({ cls: 'TANK', frontline: true, engage: true })], ['tank2', T({ cls: 'TANK', frontline: true, engage: true })],
  ['div', T({ cls: 'ASSASSIN', diver: true })], ['jdiv', T({ cls: 'BRUISER', frontline: true, diver: true })],
  ['mage', T({})], ['mage2', T({})], ['adc', T({ cls: 'MARKSMAN' })], ['sup', T({ cls: 'SUPPORT', enchanter: true })],
]);
const field: FieldReport = {
  patch: '1.18', matches: 100,
  byDiff: { tanks: { '-1': { n: 100, w: 47, wr: 47, ci95: 9.8 } }, divers: {} },
  shapeGrid: { '0t2d': { n: 100, w: 48, wr: 48, ci95: 9.8 }, '1t1d': { n: 100, w: 51, wr: 51, ci95: 9.8 } },
};
const team = (us: boolean, [off, jng, mid, car, sup]: string[]): CompPlayer[] =>
  [['offlane', off], ['jungle', jng], ['midlane', mid], ['carry', car], ['support', sup]].map(([role, s]) => ({ us, heroSlug: s!, heroName: s!.toUpperCase(), role: role! }));
const wr = { tank: { offlane: { n: 400, w: 220 } }, tank2: { offlane: { n: 900, w: 450 }, support: { n: 900, w: 460 } } };

describe('team-comp read', () => {
  it('flags a no-tank double-dive draft and swaps the non-jungle diver for the best offlane tank', () => {
    const r = readTeamComp([...team(true, ['div', 'jdiv', 'mage', 'adc', 'sup']), ...team(false, ['tank', 'jdiv', 'mage', 'adc', 'sup'])],
      { physical: 3, magical: 2 }, tags, field, wr, new Map(), new Map([['tank', 'Tank'], ['tank2', 'Tank Two']]))!;
    expect(r.us.shape).toBe('0t2d');
    expect(r.us.shapeWr!.wr).toBe(48);
    expect(r.them.shapeWr!.wr).toBe(51);
    const bad = r.checks.filter((c) => !c.ok).map((c) => c.id);
    expect(bad).toEqual(['tank', 'tank-count', 'divers']);
    expect(r.checks.find((c) => c.id === 'tank-count')!.text).toContain('47%');
    expect(r.swap).toMatchObject({ role: 'offlane', out: 'DIV', options: [{ slug: 'tank', wr: 55 }, { slug: 'tank2', wr: 50 }] });
  });
  it('counts a non-tank hero who soaked 1.5x the lane average as playing tank, without changing the draft shape', () => {
    const r = readTeamComp([...team(true, ['tank', 'div', 'mage', 'adc', 'sup']), ...team(false, ['jdiv', 'div', 'mage', 'adc', 'sup'])],
      { physical: 3, magical: 2 }, tags, field, wr, new Map(), new Map(), () => [],
      new Map([['tank', { mpm: 1200, avg: 1300 }], ['sup', { mpm: 900, avg: 950 }]]),
      new Map([['jdiv', { mpm: 3014, avg: 1297 }], ['sup', { mpm: 721, avg: 950 }]]))!;
    expect(r.them.tanks).toBe(0);
    expect(r.them.gameTanks).toBe(1);
    expect(r.them.heroes.find((h) => h.slug === 'jdiv')!.playedTank).toEqual({ mpm: 3014, x: 2.3 });
    expect(r.them.heroes.find((h) => h.slug === 'sup')!.playedTank).toBeUndefined();
    expect(r.us.heroes.find((h) => h.slug === 'tank')!.playedTank).toBeUndefined();
    const tc = r.checks.find((c) => c.id === 'tank-count')!;
    expect(tc.ok).toBe(true);
    expect(tc.text).toContain('1 v 1');
    expect(r.summary).toContain('JDIV played as a tank without being a tank hero');
  });
  it('flags a draft that matched tank heroes but was out-tanked in the game', () => {
    const r = readTeamComp([...team(true, ['div', 'jdiv', 'mage', 'adc', 'sup']), ...team(false, ['jdiv', 'div', 'mage', 'adc', 'sup'])],
      { physical: 3, magical: 2 }, tags, field, wr, new Map(), new Map(), () => [],
      new Map([['jdiv', { mpm: 900, avg: 1300 }]]), new Map([['jdiv', { mpm: 2600, avg: 1297 }]]))!;
    const tc = r.checks.find((c) => c.id === 'tank-count')!;
    expect(tc.ok).toBe(false);
    expect(tc.text).toContain('out-tanked in the game');
  });
  it('passes a two-tank one-diver draft with mixed damage and no swap', () => {
    const r = readTeamComp([...team(true, ['tank', 'jdiv', 'mage', 'adc', 'tank2']), ...team(false, ['div', 'jdiv', 'mage', 'adc', 'sup'])],
      { physical: 3, magical: 2 }, tags, field, wr, new Map(), new Map())!;
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.swap).toBeNull();
  });
  it('catches one-type damage, doubled mages and a support that cannot peel', () => {
    const r = readTeamComp([...team(true, ['tank', 'jdiv', 'mage', 'adc', 'mage2']), ...team(false, ['tank', 'jdiv', 'mage', 'adc', 'sup'])],
      { physical: 1, magical: 4 }, tags, field, wr, new Map(), new Map())!;
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(['damage', 'doubles', 'peel']);
  });
  it('returns null on an incomplete lineup or unknown hero', () => {
    expect(readTeamComp(team(true, ['tank', 'jdiv', 'mage', 'adc', 'sup']), { physical: 2, magical: 3 }, tags, field, {}, new Map(), new Map())).toBeNull();
    expect(readTeamComp([...team(true, ['x', 'jdiv', 'mage', 'adc', 'sup']), ...team(false, ['tank', 'jdiv', 'mage', 'adc', 'sup'])], { physical: 2, magical: 3 }, tags, field, {}, new Map(), new Map())).toBeNull();
  });
});
