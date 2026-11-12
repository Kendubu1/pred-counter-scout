import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_GAMES, addGame, qualifies, rankTanks, tankAgg, tankStats } from '../src/tank-builds.js';

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
  const f = path.join(ROOT, 'data/artifacts/tank-builds.json');
  it.skipIf(!existsSync(f))('committed board: three lanes, every row winning and with the games', () => {
    const d = JSON.parse(readFileSync(f, 'utf8'));
    expect(Object.keys(d.lanes)).toEqual(['offlane', 'jungle', 'support']);
    for (const l of Object.values<any>(d.lanes)) {
      expect(l.board.length).toBeGreaterThan(0);
      for (let k = 0; k < l.board.length; k++) {
        const b = l.board[k];
        expect(b.games).toBeGreaterThanOrEqual(d.minGames);
        expect(b.shrunkWinPct).toBeGreaterThanOrEqual(50);
        if (k) expect(b.soakPerDeath).toBeLessThanOrEqual(l.board[k - 1].soakPerDeath);
      }
    }
  });
});
