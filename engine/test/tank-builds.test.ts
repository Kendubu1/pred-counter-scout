import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANDS, MIN_GAMES, addGame, eternalEffects, inBand, qualifies, rankTanks, tankAgg, tankStats, type TankAgg } from '../src/tank-builds.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const group = (n: number, wins: number, mit: number, taken: number, deaths: number) => { const a = tankAgg(); for (let k = 0; k < n; k++) addGame(a, mit, taken, deaths, 1800, k < wins); return { agg: a }; };

describe('tankiest winning builds', () => {
  it('reads soak per death and deaths per ten minutes from the summed games', () => {
    const s = tankStats(group(200, 120, 60000, 30000, 3).agg);
    expect(s).toMatchObject({ games: 200, winPct: 60, soakPerDeath: 30000, deathsPer10: 1, mitigatedPerMin: 2000, takenPerMin: 1000 });
    expect(s.shrunkWinPct).toBeCloseTo(56.7, 1);
  });
  it('keeps a build off the board when it soaks the most but loses, or has too few games', () => {
    const loser = group(400, 150, 90000, 40000, 2), thin = group(MIN_GAMES - 1, 149, 90000, 40000, 2), winner = group(300, 170, 60000, 30000, 3), weaker = group(300, 170, 40000, 20000, 4);
    expect(qualifies(loser.agg)).toBe(false);
    expect(qualifies(thin.agg)).toBe(false);
    expect(rankTanks([loser, thin, weaker, winner])).toEqual([winner, weaker]);
  });
  it('compares an Eternal with the same hero on other Eternals, and only calls it when the margin clears zero', () => {
    const sum = (a: TankAgg, b: TankAgg): TankAgg => ({ n: a.n + b.n, w: a.w + b.w, min: a.min + b.min, mit: a.mit + b.mit, takenH: a.takenH + b.takenH, deaths: a.deaths + b.deaths });
    const good = group(2000, 1160, 80000, 30000, 2).agg, plain = group(2000, 1000, 60000, 30000, 3).agg, same = group(600, 300, 60000, 30000, 3).agg;
    const heroes = new Map([['tank', sum(sum(good, plain), same)], ['squishy', group(900, 450, 5000, 5000, 6).agg]]);
    const byEt = new Map([['tank', new Map([['Good', good], ['Plain', plain], ['Same', same]])], ['squishy', new Map([['Good', group(450, 100, 5000, 5000, 6).agg]])]]);
    const r = eternalEffects(heroes, byEt, 20000);
    const g = r.find((x) => x.eternal === 'Good')!;
    expect(g).toMatchObject({ heroes: 1, games: 2000, verdict: 'wins more' }); // the squishy hero is not a tank: not counted
    expect(g.winDelta).toBeCloseTo(8, 0);
    expect(g.soakPct).toBeGreaterThan(50);
    expect(g.deathsPct).toBeLessThan(0);
    expect(r.find((x) => x.eternal === 'Same')!.verdict).toBe('no clear change');
    expect(r[0]!.eternal).toBe('Good');
  });
  const f = path.join(ROOT, 'data/aggregates/tank-builds.json');
it.skipIf(!existsSync(f))('committed board: four rank bands, three lanes, every row winning and with its band\'s games', () => {
    const d = JSON.parse(readFileSync(f, 'utf8'));
    expect(d.bandOrder).toEqual(BANDS.map((b) => b.key));
    for (const band of BANDS) {
      const bd = d.bands[band.key];
      expect(Object.keys(bd.lanes)).toEqual(['offlane', 'jungle', 'support']);
      for (const l of Object.values<any>(bd.lanes)) {
        if (band.key === 'all') { expect(l.board.length).toBeGreaterThan(0); expect(l.eternals.length).toBeGreaterThan(0); }
        for (const e of l.eternals) if (e.verdict === 'wins more') expect(e.winDelta - e.margin).toBeGreaterThan(0);
        for (let k = 0; k < l.board.length; k++) {
          const b = l.board[k];
          expect(b.games).toBeGreaterThanOrEqual(band.minGames);
          expect(b.shrunkWinPct).toBeGreaterThanOrEqual(50);
          if (k) expect(b.soakPerDeath).toBeLessThanOrEqual(l.board[k - 1].soakPerDeath);
        }
      }
    }
    expect(d.bands.plat.playerRows).toBeLessThan(d.bands.gold.playerRows);
    expect(d.bands.gold.playerRows).toBeLessThan(d.bands.silver.playerRows);
  });
  it('puts a player in a rank band by the rank held in that game, unplaced players only under all ranks', () => {
    const by = (k: string) => BANDS.find((b) => b.key === k)!;
    expect(inBand(by('all'), null)).toBe(true);
    expect(inBand(by('silver'), null)).toBe(false);
    expect([0, 1, 2, 3, 4].map((t) => BANDS.filter((b) => b.key !== 'all' && inBand(b, t)).map((b) => b.key).join())).toEqual(['', 'silver', 'silver,gold', 'silver,gold,plat', 'silver,gold,plat']);
  });
});
