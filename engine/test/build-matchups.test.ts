import { describe, it, expect } from 'vitest';
import { addSegment, countMatch, emptyState, type MatchPlayer } from '../src/ingest/build-matchups.js';
import { againstHero, allOpponents, intoOpponent, tail2 } from '../src/matchup-builds.js';

const P = (hero: string, role: string, team: number, core: string[], plat = false): MatchPlayer => ({ hero, role, team, core, plat });

describe('build-matchups counting', () => {
  it('counts each player once in all, once per lane opponent, once per enemy hero', () => {
    const st = emptyState('1.0', '2026-01-01T00:00:00Z');
    countMatch(st, [
      P('serath', 'jungle', 0, ['a', 'b', 'c'], true), P('grux', 'offlane', 0, ['x', 'y', 'z']),
      P('khaimera', 'jungle', 1, ['k', 'l', 'm']), P('gideon', 'offlane', 1, ['g', 'h']),
    ]);
    const s = st.heroes['serath|jungle']!;
    expect(s.all).toMatchObject({ n: 1, i: { a: 1, b: 1, c: 1 } });
    expect(s.all.p!.n).toBe(1);
    expect(Object.keys(s.lane)).toEqual(['khaimera']);
    expect(Object.keys(s.team).sort()).toEqual(['gideon', 'khaimera']);
    // gideon has only 2 core items: no row of its own, but still an enemy of others
    expect(st.heroes['gideon|offlane']).toBeUndefined();
    expect(st.heroes['grux|offlane']!.lane.gideon!.n).toBe(1);
    expect(st.window.matches).toBe(1);
  });

  it('extends a contiguous segment and starts a new one after a gap', () => {
    const st = emptyState('1.0', 'x');
    addSegment(st, 'A', 'B', 'daily'); addSegment(st, 'B', 'C', 'daily'); addSegment(st, 'D', 'E', 'daily');
    expect(st.window.segments).toEqual([{ from: 'A', to: 'C', via: 'daily' }, { from: 'D', to: 'E', via: 'daily' }]);
  });
});

describe('matchup build readers', () => {
  // 600 Serath junglers: anti-heal 'ah' 60% into Khaimera, 15% otherwise. Enemies of
  // 'healer' (any role) buy 'ah' 50% vs 20% usually; 'plain' changes nothing.
  const st = emptyState('1.0', 'x');
  for (let i = 0; i < 600; i++) {
    const vsK = i % 3 === 0;
    const ah = vsK ? i % 5 < 3 : i % 20 < 3;
    const enemyHasHealer = i % 2 === 0;
    const midAh = enemyHasHealer ? i % 4 === 0 : i % 10 < 2;
    countMatch(st, [
      P('serath', 'jungle', 0, [ah ? 'ah' : 'dmg', 'b', 'c']),
      P('aurora', 'midlane', 0, [midAh ? 'ah' : 'mp', 'q', 'r']),
      P(vsK ? 'khaimera' : 'zarus', 'jungle', 1, ['k', 'l', 'm']),
      P(enemyHasHealer ? 'healer' : 'plain', 'midlane', 1, ['s', 't', 'u']),
    ]);
  }

  it('intoOpponent finds the counter item rising and the swapped item falling', () => {
    const l = intoOpponent(st, 'serath', 'jungle', 'khaimera');
    const ah = l.rises.find((s) => s.item === 'ah')!;
    expect(ah.per100).toBeCloseTo(60, 0);
    expect(ah.usual100).toBeCloseTo(15, 0);
    expect(l.drops.find((s) => s.item === 'dmg')).toBeDefined();
    expect(l.rises.find((s) => s.item === 'b')).toBeUndefined(); // everyone buys it
  });

  it('allOpponents labels each shift with its opponent', () => {
    expect(allOpponents(st, 'serath', 'jungle').rises.some((s) => s.opp === 'khaimera' && s.item === 'ah')).toBe(true);
  });

  it('againstHero reads the table the other way: what enemies build into a hero', () => {
    const mid = againstHero(st, 'healer').find((r) => r.role === 'midlane')!;
    const ah = mid.rises.find((s) => s.item === 'ah')!;
    expect(ah.per100).toBeCloseTo(50, 0);
    expect(ah.usual100).toBeCloseTo(20, 0);
    expect(againstHero(st, 'plain').find((r) => r.role === 'midlane')!.drops.find((s) => s.item === 'ah')).toBeDefined();
  });

  it('reports how many shifts luck alone would pass', () => {
    const l = intoOpponent(st, 'serath', 'jungle', 'khaimera', 'lane', { zMin: 3 });
    expect(l.expectedByLuck).toBeCloseTo(l.tested * 0.0027, 3);
    expect(tail2(1.96)).toBeCloseTo(0.05, 3);
  });

  it('Plat+ band reads only Plat+ counts', () => {
    expect(intoOpponent(st, 'serath', 'jungle', 'khaimera', 'lane', { band: 'plat' }).tested).toBe(0);
  });
});
