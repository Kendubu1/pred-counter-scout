// Picks by build (pure): does the augment / Eternal / crest change with the three items a player
// opens with? Counted from the patch's ranked lineups (full build + loadout per player).
//
// Ranking is the site's one rule (field-pick.ts rankByEdge, recommendation policy): a build is
// treated exactly like a rank band. Each option's win rate inside the build is shrunk toward that
// option's OWN lane-wide rate plus the build's win-rate gap (BAND_K games of prior), so a
// 7-game "71%" never leads, and the label says how sure: clear -> Best, slight -> Leans, toss-up,
// or most played when only one option has the games. A pick is flagged as CHANGING with the build
// only when the build's lead differs from the lane's lead and the edge is CLEAR (90%+): with three
// lists on each of ~400 builds, a 70% bar would flag dozens by luck alone.
//
// Later items are counts only, among players who bought an item in that slot: win rates per
// fourth / fifth / sixth item are a handful of games each and mostly say who was already ahead.
import { bandPrior, rankByEdge, shownOptions, type Confidence } from './field-pick.js';

export interface Opt { id?: string; name: string; n: number; w: number }
export interface PickCell { games: number; wins: number; augments: Opt[]; eternals: Opt[]; crests: Opt[] }
export type Kind = 'augments' | 'eternals' | 'crests';
export interface PickRow { id?: string; name: string; n: number; w: number; shrunk: number; few: boolean }
export interface PickRead {
  /** Best | Leans | Toss-up | Most played | By games (nothing has the games to lead) */
  label: 'Best' | 'Leans' | 'Toss-up' | 'Most played' | 'By games';
  rows: PickRow[];
  /** the lane-wide lead for the same kind, and whether this build's lead is a different pick with a clear edge */
  laneLead: string | null; changes: boolean;
  /** What players on this build actually RUN (a choice, not a win claim): the most-run option and its
   *  share, the lane's most-run, and whether the build pairs with a different one (see PAIR_*). */
  mostRun: { name: string; pct: number } | null; laneMostRun: string | null; pairs: boolean;
}
/** A build "pairs with" a pick when most of its players run one the lane as a whole does not lead with:
 *  a different most-run option, held by PAIR_SHARE of the build, PAIR_PTS above its lane-wide share, and
 *  past |z| >= 3 against the lane share (it is a count of what players do, so no win test applies). */
export const PAIR_SHARE = 0.5, PAIR_PTS = 15;
const LABEL: Record<Confidence, PickRead['label']> = { clear: 'Best', slight: 'Leans', 'toss-up': 'Toss-up' };
const key = (x: { id?: string; name: string }) => String(x.id ?? x.name);

/** Rank one list inside a slice of the lane (a build, an augment) against the same list lane-wide. */
export function readList(laneXs: Opt[], lane: { games: number; wins: number }, xs: Opt[], sub: { games: number; wins: number }): PickRead {
  const laneRank = rankByEdge(laneXs, lane.games);
  const laneLead = laneRank.thin ? null : laneRank.ranked[0] ?? null;
  const r = rankByEdge(xs, sub.games, { prior: bandPrior(laneXs, lane, sub) });
  const label: PickRead['label'] = r.thin ? 'By games' : r.confidence ? LABEL[r.confidence] : 'Most played';
  const lead = r.ranked[0];
  const top = (ys: Opt[]) => [...ys].sort((x, y) => y.n - x.n)[0] ?? null;
  const bt = top(xs), lt = top(laneXs);
  const share = bt && sub.games ? bt.n / sub.games : 0;
  const laneShare = bt && lane.games ? (laneXs.find((x) => key(x) === key(bt))?.n ?? 0) / lane.games : 0;
  const z = bt && laneShare > 0 && laneShare < 1 ? (share - laneShare) / Math.sqrt((laneShare * (1 - laneShare)) / sub.games) : 0;
  return {
    mostRun: bt ? { name: bt.name, pct: Math.round(share * 100) } : null, laneMostRun: lt?.name ?? null,
    pairs: !!bt && !!lt && key(bt) !== key(lt) && share >= PAIR_SHARE && (share - laneShare) * 100 >= PAIR_PTS && z >= 3,
    label,
    rows: shownOptions(r, 3).map((x) => ({ id: x.id, name: x.name, n: x.n, w: x.w, shrunk: Math.round(x.shrunk * 1000) / 10, few: x.few })),
    laneLead: laneLead?.name ?? null,
    changes: !!lead && !!laneLead && key(lead) !== key(laneLead) && r.confidence === 'clear',
  };
}
export const readPick = (lane: PickCell, build: PickCell, kind: Kind): PickRead => readList(lane[kind], lane, build[kind], build);

export interface NextSlot { slot: number; n: number; top: { item: string; pct: number }[] }
export interface BuildRead {
  /** the three opening items: in purchase order when `ordered`, else the set (sorted slugs, any order) */
  core: string[]; ordered: boolean; n: number; w: number;
  augments: PickRead; eternals: PickRead; crests: PickRead;
  next: NextSlot[];
}
export interface BuildCells { cell: PickCell; slots: Record<string, number>[]; reach: number[] }
export const MIN_BUILD = 60, NEXT_MIN = 30, NEXT_TOP = 3;

export function readBuild(core: string[], lane: PickCell, b: BuildCells, ordered = false): BuildRead {
  const next: NextSlot[] = [];
  b.reach.forEach((n, k) => {
    if (n < NEXT_MIN) return;
    next.push({ slot: k + 4, n, top: Object.entries(b.slots[k]!).sort((x, y) => y[1] - x[1]).slice(0, NEXT_TOP).map(([item, v]) => ({ item, pct: Math.round((100 * v) / n) })).filter((x) => x.pct >= 5) });
  });
  return { core, ordered, n: b.cell.games, w: b.cell.wins, augments: readPick(lane, b.cell, 'augments'), eternals: readPick(lane, b.cell, 'eternals'), crests: readPick(lane, b.cell, 'crests'), next };
}
