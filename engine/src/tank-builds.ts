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
export const qualifies = (a: TankAgg) => a.n >= MIN_GAMES && (a.w + WIN_K * 0.5) / (a.n + WIN_K) >= WIN_MIN;
/** The board for one lane: qualifying groups, most soak per death first. */
export function rankTanks<T extends { agg: TankAgg }>(groups: T[], max = BOARD): T[] {
  return groups.filter((g) => qualifies(g.agg)).sort((x, y) => (y.agg.mit + y.agg.takenH) / Math.max(1, y.agg.deaths) - (x.agg.mit + x.agg.takenH) / Math.max(1, x.agg.deaths)).slice(0, max);
}
