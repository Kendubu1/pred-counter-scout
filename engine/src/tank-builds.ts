// Tankiest winning builds (pure): which hero + Eternal is hardest to kill in a lane AND wins.
//
//   soak per death   (damage mitigated + hero damage taken) / deaths, summed over the group's games:
//                    how much punishment the enemy spends per kill. The ranking stat.
//   deaths per 10    deaths per ten minutes of game
//   winning          the group's win rate, pulled WIN_K games toward 50%, must be WIN_MIN or better:
//                    a build that soaks everything and loses is not on this board
// A group is one hero in one lane on one Eternal with MIN_GAMES+ ranked games of ten minutes or
// more (shorter games are surrenders and remakes with no real fights). The augment, crest, opening
// three and later items shown with a group are what ITS players run most: descriptions of the
// build, not picks ranked by edge. Surviving and winning go together, so a high win rate here is
// partly "the team that is ahead dies less"; the board says so.
export interface TankAgg { n: number; w: number; min: number; mit: number; takenH: number; deaths: number }
export const tankAgg = (): TankAgg => ({ n: 0, w: 0, min: 0, mit: 0, takenH: 0, deaths: 0 });
export function addGame(a: TankAgg, mitigated: number, takenFromHeroes: number, deaths: number, durSec: number, won: boolean) {
  a.n++; if (won) a.w++; a.min += durSec / 60; a.mit += mitigated; a.takenH += takenFromHeroes; a.deaths += deaths;
}
export const MIN_GAMES = 150, MIN_DURATION = 600, WIN_K = 100, WIN_MIN = 0.5, BOARD = 8;
export interface TankStats { games: number; winPct: number; shrunkWinPct: number; soakPerDeath: number; deathsPer10: number; mitigatedPerMin: number; takenPerMin: number }
export function tankStats(a: TankAgg): TankStats {
  return {
    games: a.n, winPct: Math.round((1000 * a.w) / a.n) / 10, shrunkWinPct: Math.round((1000 * (a.w + WIN_K * 0.5)) / (a.n + WIN_K)) / 10,
    soakPerDeath: Math.round((a.mit + a.takenH) / Math.max(1, a.deaths)), deathsPer10: Math.round((100 * 10 * a.deaths) / a.min) / 100,
    mitigatedPerMin: Math.round(a.mit / a.min), takenPerMin: Math.round(a.takenH / a.min),
  };
}
export const qualifies = (a: TankAgg, minGames = MIN_GAMES) => a.n >= minGames && (a.w + WIN_K * 0.5) / (a.n + WIN_K) >= WIN_MIN;
/** Rank bands of the board (rank the player held IN THAT GAME; unplaced players count under All ranks
 *  only). Bands are "this rank and above" (Silver+, Gold+, Plat+), the way the rest of the site cuts rank,
 *  so a player looks at the band they play in and everything above it. A band's floors shrink with its share of the games: Plat+ is about 6% of placed tank-lane
 *  rows, so its rows are thin by nature and the page prints each row's games. */
export interface BandRule { key: string; label: string; tiers: [number, number] | null; minGames: number; tankMin: number; etMin: number; othersMin: number; etShow: number }
export const BANDS: BandRule[] = [
  { key: 'all', label: 'All ranks', tiers: null, minGames: MIN_GAMES, tankMin: 300, etMin: 80, othersMin: 100, etShow: 400 },
  { key: 'silver', label: 'Silver+', tiers: [1, 99], minGames: 100, tankMin: 200, etMin: 60, othersMin: 80, etShow: 300 },
  { key: 'gold', label: 'Gold+', tiers: [2, 99], minGames: 60, tankMin: 120, etMin: 40, othersMin: 50, etShow: 150 },
  { key: 'plat', label: 'Plat+', tiers: [3, 99], minGames: 30, tankMin: 60, etMin: 20, othersMin: 30, etShow: 60 },
];
export const inBand = (b: BandRule, tier: number | null | undefined) => !b.tiers || (tier != null && tier >= b.tiers[0] && tier <= b.tiers[1]);
/** The board for one lane: qualifying groups, most soak per death first. */
export function rankTanks<T extends { agg: TankAgg }>(groups: T[], max = BOARD, minGames = MIN_GAMES): T[] {
  return groups.filter((g) => qualifies(g.agg, minGames)).sort((x, y) => (y.agg.mit + y.agg.takenH) / Math.max(1, y.agg.deaths) - (x.agg.mit + x.agg.takenH) / Math.max(1, x.agg.deaths)).slice(0, max);
}

// Which Eternal for a tank: each Eternal against the SAME hero in the same lane on every other
// Eternal, pooled over the lane's tank hero-lanes (TANK_MIN_GAMES+ games and soak per death at least
// TANK_SOAK_X times the lane average). A hero counts for an Eternal with ET_MIN+ games on it and
// OTHERS_MIN+ off it. winDelta is the inverse-variance weighted win-rate gap in points with its 95%
// margin; soakPct / deathsPct are the game-weighted changes in soak per death and death rate.
// verdict: "wins more" / "wins less" only when the whole margin is on one side of zero.
export const TANK_MIN_GAMES = 300, TANK_SOAK_X = 1.2, ET_MIN = 80, OTHERS_MIN = 100, ET_SHOW = 400;
const soakOf = (a: TankAgg) => (a.mit + a.takenH) / Math.max(1, a.deaths);
export interface EternalEffect { eternal: string; games: number; heroes: number; winDelta: number; margin: number; soakPct: number; deathsPct: number; verdict: 'wins more' | 'wins less' | 'no clear change' }
export function eternalEffects(heroLanes: Map<string, TankAgg>, byEternal: Map<string, Map<string, TankAgg>>, laneAvgSoak: number,
  f: { tankMin: number; etMin: number; othersMin: number; etShow: number } = { tankMin: TANK_MIN_GAMES, etMin: ET_MIN, othersMin: OTHERS_MIN, etShow: ET_SHOW }): EternalEffect[] {
  const acc = new Map<string, { n: number; heroes: number; d: number; w: number; soak: number; deaths: number }>();
  for (const [hero, all] of heroLanes) {
    if (all.n < f.tankMin || soakOf(all) < TANK_SOAK_X * laneAvgSoak) continue;
    for (const [et, a] of byEternal.get(hero) ?? []) {
      const o: TankAgg = { n: all.n - a.n, w: all.w - a.w, min: all.min - a.min, mit: all.mit - a.mit, takenH: all.takenH - a.takenH, deaths: all.deaths - a.deaths };
      if (a.n < f.etMin || o.n < f.othersMin) continue;
      const v = 0.25 / a.n + 0.25 / o.n, e = acc.get(et) ?? { n: 0, heroes: 0, d: 0, w: 0, soak: 0, deaths: 0 };
      e.n += a.n; e.heroes++; e.d += (a.w / a.n - o.w / o.n) / v; e.w += 1 / v;
      e.soak += a.n * (soakOf(a) / soakOf(o) - 1); e.deaths += a.n * (a.deaths / a.min / (o.deaths / o.min) - 1);
      acc.set(et, e);
    }
  }
  return [...acc].filter(([, e]) => e.n >= f.etShow).map(([eternal, e]) => {
    const winDelta = Math.round((1000 * e.d) / e.w) / 10, margin = Math.round(1960 * Math.sqrt(1 / e.w)) / 10;
    return { eternal, games: e.n, heroes: e.heroes, winDelta, margin, soakPct: Math.round((100 * e.soak) / e.n), deathsPct: Math.round((100 * e.deaths) / e.n),
      verdict: (winDelta - margin > 0 ? 'wins more' : winDelta + margin < 0 ? 'wins less' : 'no clear change') as EternalEffect['verdict'] };
  }).sort((x, y) => y.winDelta - x.winDelta);
}
