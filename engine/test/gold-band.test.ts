import { describe, expect, it } from 'vitest';
import { isGoldPlus, isPlatPlus, matchTimeRanks, RANK_BATCH } from '../src/ingest/match-rank.js';
import { bandEvidence, MIN_BAND_BUILD_GAMES, pickBuildBand, poolBySet } from '../src/artifacts.js';

// 2026-10-25: Gold+ moved from the ladder's CURRENT rank (winners climb, so the
// band read ~+3 points high) to the rank each player held in that game.
describe('Gold+ by rank at match time', () => {
  const players = (rows: [string, number | null][]) => ({ matchPlayers: rows.map(([uuid, t]) => ({ player: { uuid }, rating: t == null ? null : { rank: { tierIdx: t } } })) });

  it('maps each player to the tier they held in that game; Silver and unplaced are not Gold+', async () => {
    const fake = async <T,>(q: string) => {
      expect(q).toContain('match(by: { id: "a" })');
      return { m0: players([['p1', 2], ['p2', 1], ['p3', null]]), m1: null } as T;
    };
    const r = await matchTimeRanks(['a', 'missing'], fake);
    expect(r.has('missing')).toBe(false); // unresolved stays out, never guessed
    const a = r.get('a')!;
    expect([a.get('p1'), a.get('p2'), a.get('p3')]).toEqual([2, 1, null]);
    expect([isGoldPlus(a.get('p1')), isGoldPlus(a.get('p2')), isGoldPlus(a.get('p3')), isGoldPlus(undefined)]).toEqual([true, false, false, false]);
    expect([isPlatPlus(2), isPlatPlus(3), isPlatPlus(5), isPlatPlus(null)]).toEqual([false, true, true, false]);
  });

  it('batches lookups and retries a failed batch one match at a time', async () => {
    const calls: string[] = [];
    const fake = async <T,>(q: string) => {
      calls.push(q);
      if (q.includes('"bad"')) throw new Error('not found');
      return Object.fromEntries([...q.matchAll(/(m\d*): match\(by: \{ id: "([^"]+)" \}\)/g)].map(([, k]) => [k, players([['p', 3]])])) as T;
    };
    const ids = Array.from({ length: RANK_BATCH + 1 }, (_, i) => (i === 1 ? 'bad' : `id${i}`));
    const r = await matchTimeRanks(ids, fake);
    expect(r.size).toBe(RANK_BATCH); // every id but the bad one
    expect(r.has('bad')).toBe(false);
    expect(calls.length).toBe(1 + RANK_BATCH + 1); // failed batch, its singles, then the second batch
  });
});

describe('build band: a lane moves up a band only once it has the games', () => {
  const row = (slugs: string[], n: number, w: number) => ({ core: slugs, coreSlugs: slugs, n, w });
  const base = { all: { n: 1000, w: 500 }, gold: { n: 400, w: 210 }, plat: { n: 150, w: 80 } };

  it('pools buy orders of one item set', () => {
    const p = poolBySet([row(['a', 'b', 'c'], 60, 30), row(['b', 'a', 'c'], 50, 30), row(['x', 'y', 'z'], 70, 35)]);
    expect(p.map((x) => [x.n, x.otherOrderGames])).toEqual([[110, 50], [70, 0]]);
  });

  const pg = (goldN: number, platN: number, basis?: 'match-time') => ({
    heroes: {}, byRole: { h: { support: [row(['a', 'b', 'c'], 500, 260)] } },
    goldBasis: basis,
    goldByRole: { h: { support: [row(['a', 'b', 'c'], goldN, Math.round(goldN / 2))] } },
    platByRole: { h: { support: [row(['a', 'b', 'c'], platN, Math.round(platN / 2))] } },
    baselineByRole: { h: { support: base } },
  });

  it('opens on Plat+ once it has the games, else all ranks, each with its own baseline', () => {
    const F = MIN_BAND_BUILD_GAMES;
    expect(pickBuildBand(pg(5000, F - 1, 'match-time'), 'h', 'support')).toMatchObject({ band: 'all', baseline: base.all });
    expect(pickBuildBand(pg(5000, F, 'match-time'), 'h', 'support')).toMatchObject({ band: 'plat+', baseline: base.plat });
    // A thin Plat+ band still ships for the filter, just not as the opening band.
    expect(bandEvidence(pg(5000, 20, 'match-time'), 'h', 'support', 'plat+').rows?.[0]?.n).toBe(20);
  });

  it('Plat+ needs its own baseline, and ladder-basis rows are never used', () => {
    const noPlatBase = { ...pg(500, 500, 'match-time'), baselineByRole: { h: { support: { ...base, plat: null } } } };
    expect(bandEvidence(noPlatBase, 'h', 'support', 'plat+').rows).toBeUndefined();
    expect(pickBuildBand(noPlatBase, 'h', 'support').band).toBe('all');
    expect(pickBuildBand(pg(5000, 5000), 'h', 'support').band).toBe('all');
  });
});
