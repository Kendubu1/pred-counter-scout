import { describe, it, expect } from 'vitest';
import { buildPatchImpact, forecast, type Digest, type MemberGame } from '../src/patch-impact.js';

const digest: Digest = {
  patch: '9.9', name: 'Test',
  heroes: [
    { slug: 'steel', trend: 'mixed', changes: ['Physical armor 38 -> 35'] },
    { slug: 'legion', trend: 'buff', changes: ['Heavy Caliber damage modifier 310% -> 300%'] },
    { slug: 'kaelen', trend: 'new', changes: ['NEW HERO'] },
  ],
  eternals: { changes: [{ name: 'Aion', dir: 'nerf', change: 'Philosopher gold 4 -> 3.5.' }] },
  itemChanges: [
    { slug: 'solaris', name: 'Solaris', dir: 'nerf', change: 'Ability haste 15 -> 10.' },
    { slug: 'forticus', name: 'Forticus', dir: 'new', change: 'New tank item. The notes name Kaelen and Steel.' },
  ],
  ranked: { summary: 'reset' },
};
const preds = {
  steel: { name: 'Steel', role: 'support', trend: 'mixed', willChange: 'Expect duo-lane Steel to slip. More text.' },
  legion: { name: 'Legion', role: 'carry', trend: 'buff', willChange: 'Expect a rise. More.' },
  kaelen: { name: 'Kaelen', role: 'offlane', altRoles: ['jungle'], trend: 'new', willChange: 'Expect early drafts. More.' },
};
const eternals = [{ name: 'Aion', minorSlot1: [{ name: 'Philosopher' }], minorSlot2: [{ name: 'Runic Focus' }] }];
const profile = (pool: { slug: string; name: string; games: number }[], roles: [string, number][]) => ({
  player: { name: 'P', current: { rank: 'Gold II' } }, pool, roles: roles.map(([role, games]) => ({ role, games })),
});
const g = (o: Partial<MemberGame>): MemberGame => ({ heroSlug: 'steel', heroName: 'Steel', role: 'support', items: [], ...o });

describe('patch impact (same rules for every member)', () => {
  it('forecast is the first sentence', () => {
    expect(forecast('Expect a rise. More.')).toBe('Expect a rise.');
  });
  it('lists a changed hero only at 20+ career games, and never the new hero as a pool hero', () => {
    const r = buildPatchImpact(digest, preds, eternals, profile([{ slug: 'steel', name: 'Steel', games: 20 }, { slug: 'legion', name: 'Legion', games: 19 }], [['support', 50]]), []);
    const heroes = r.lines.filter((l) => l.kind === 'hero');
    expect(heroes.map((l) => l.title)).toEqual(['Steel, your #1 hero']);
    expect(heroes[0]!.text).toBe('Expect duo-lane Steel to slip.');
  });
  it('an Eternal needs 3+ games and a fifth of them, and names the usual minor when it changed', () => {
    const games = [...Array(10)].map((_, i) => g({ eternal: i < 3 ? 'Aion' : 'Krix', minor1: 'Philosopher' }));
    const r = buildPatchImpact(digest, preds, eternals, profile([], [['support', 1]]), games);
    const et = r.lines.find((l) => l.kind === 'eternal');
    expect(et?.title).toBe('Aion, your Eternal in 3 of 10 games');
    expect(et?.text).toContain('your usual minor Philosopher');
    const thin = buildPatchImpact(digest, preds, eternals, profile([], [['support', 1]]), [...games, ...[...Array(6)].map(() => g({ eternal: 'Krix' }))]);
    expect(thin.lines.some((l) => l.kind === 'eternal')).toBe(false); // 3 of 16 < 20%
  });
  it('items, augments, the new hero by main lane, new items by named hero, ranked for everyone', () => {
    const games = [...Array(5)].map(() => g({ heroSlug: 'legion', heroName: 'Legion', items: ['solaris'], augment: 'Heavy Caliber' }));
    const r = buildPatchImpact(digest, preds, eternals,
      profile([{ slug: 'steel', name: 'Steel', games: 30 }], [['jungle', 300], ['carry', 200], ['offlane', 10]]), games);
    expect(r.lines.find((l) => l.kind === 'item')?.title).toBe('Solaris, in 5 of your 5 builds');
    expect(r.lines.find((l) => l.kind === 'augment')?.title).toBe('Heavy Caliber on Legion');
    expect(r.lines.filter((l) => l.kind === 'new').map((l) => l.title)).toEqual(['Kaelen, new hero for jungle', 'Forticus, new item']);
    expect(r.lines.at(-1)?.kind).toBe('ranked');
    expect(r.lines.at(-1)?.text).toContain('Gold II');
  });
});
