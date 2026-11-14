import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANDS, MIN_GAMES, addGame, eternalEffects, inBand, qualifies, rankTanks, tankAgg, tankStats, type TankAgg } from '../src/tank-builds.js';
import { BOARDS, addOut, outAgg, rankBoard } from '../src/output-boards.js';

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
  const f = path.join(ROOT, 'data/aggregates/top-builds.json');
it.skipIf(!existsSync(f))('committed boards: every rank band and job, each row winning, with the games, one row per hero-lane', () => {
    const d = JSON.parse(readFileSync(f, 'utf8'));
    expect(d.bandOrder).toEqual(BANDS.map((b) => b.key));
    expect(d.boards.map((b: any) => b.key)).toEqual(BOARDS.map((b) => b.key));
    for (const band of BANDS) for (const def of BOARDS) {
      const secs = d.bands[band.key].boards[def.key].sections;
      expect(secs.map((x: any) => x.key)).toEqual(def.sections.map((x) => x.key));
      for (const sec of secs) {
        if (band.key === 'all') expect(sec.rows.length, `${def.key}/${sec.key}`).toBeGreaterThan(0);
        for (const e of sec.eternals) if (e.verdict === 'wins more') expect(e.winDelta - e.margin).toBeGreaterThan(0);
        expect(new Set(sec.rows.map((r: any) => `${r.hero}|${r.lane}`)).size).toBe(sec.rows.length);
        for (let k = 0; k < sec.rows.length; k++) {
          const r = sec.rows[k];
          expect(r.games).toBeGreaterThanOrEqual(band.minGames);
          expect(r.shrunkWinPct).toBeGreaterThanOrEqual(50);
          if (k) expect(r.value).toBeLessThanOrEqual(sec.rows[k - 1].value);
          for (const x of r.alts) expect(x.value).toBeLessThanOrEqual(r.value);
        }
      }
    }
    expect(d.bands.plat.playerRows).toBeLessThan(d.bands.gold.playerRows);
    expect(d.bands.gold.playerRows).toBeLessThan(d.bands.silver.playerRows);
  });
  it('ranks a job board by its own stat, one row per hero-lane, and leaves losers off', () => {
    const mk = (hero: string, eternal: string, n: number, wins: number, heal: number) => { const a = outAgg(); for (let k = 0; k < n; k++) addOut(a, { mitigated: 0, takenFromHeroes: 0, deaths: 2, damage: 100, magic: 0, healing: heal, teamShield: 0, durSec: 1200, won: k < wins }); return { hero, lane: 'support', eternal, agg: a }; };
    const def = BOARDS.find((b) => b.key === 'healing')!;
    const rows = rankBoard([mk('a', 'X', 200, 120, 20000), mk('a', 'Y', 200, 120, 16000), mk('b', 'X', 200, 120, 12000), mk('c', 'X', 400, 150, 40000), mk('d', 'X', 40, 39, 40000)], def, 150);
    expect(rows.map((r) => `${r.lead.hero}+${r.lead.eternal}`)).toEqual(['a+X', 'b+X']); // c loses, d has too few games
    expect(rows[0]!.alts.map((x) => x.eternal)).toEqual(['Y']);
    expect(def.value(rows[0]!.lead.agg)).toBe(1000);
  });
  it('puts a player in a rank band by the rank held in that game, unplaced players only under all ranks', () => {
    const by = (k: string) => BANDS.find((b) => b.key === k)!;
    expect(inBand(by('all'), null)).toBe(true);
    expect(inBand(by('silver'), null)).toBe(false);
    expect([0, 1, 2, 3, 4].map((t) => BANDS.filter((b) => b.key !== 'all' && inBand(b, t)).map((b) => b.key).join())).toEqual(['', 'silver', 'silver,gold', 'silver,gold,plat', 'silver,gold,plat']);
  });
});
