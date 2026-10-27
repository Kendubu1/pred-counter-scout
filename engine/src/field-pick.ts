// Field picks: what gives the best statistical edge in the ranked field, per
// hero-role, from the public match stream counts
// (data/aggregates/predgg-augments.json). This is the recommendation everywhere a
// pick is shown (hero page card, the lane steer, the coach lobby, the CLI). The
// kit-math sim is experimental and never overrides it (maintainer, 2026-10-25).
//
// Rule (maintainer, 2026-10-27: "a statistical edge, not whatever everyone uses
// unless it's winning"): every option's win rate is shrunk toward the lane's
// average by empirical Bayes, so its weight grows with its games (no 300-game
// cliff; a 30-game junk floor only). The highest shrunk rate leads, and the page
// says how sure that is: P(lead beats the runner-up) >= 90% "clear", >= 70%
// "slight", else a "toss-up". In a toss-up the options statistically tied with
// the top are equal bets, so the most-played of them leads (its number moves
// least). ui/v6/index.html mirrors these rules client-side; keep the two in step.

type NW = { n: number; w: number };
export interface AugmentCell { id: string; name: string; n: number; w: number }
export interface PairCell { minor1: string; minor2: string; n: number; w: number }
export interface EternalCell { name: string; n: number; w: number; minor1?: ({ name: string } & NW)[]; minor2?: ({ name: string } & NW)[]; pairs?: PairCell[] }
export interface FieldCell { games?: number; wins?: number; augments?: AugmentCell[]; eternals?: EternalCell[]; crests?: ({ name: string } & NW)[] }

type PickInfo = { confidence: Confidence | null; pBeat: number | null; shrunkWr: number; pickRate: number };
export interface FieldPick {
  augment: ({ id: string; name: string; wr: number; n: number } & PickInfo) | null;
  eternal: ({ name: string; wr: number; n: number } & PickInfo) | null;
  minors: { minor1: string; minor2: string; wr: number; n: number; basis: 'best-pair' | 'most-picked' } | null;
  crest: ({ name: string; wr: number; n: number } & PickInfo) | null;
}

const r1 = (x: number) => Math.round(x * 1000) / 10;

/** Options with fewer games than this are noise and never ranked. */
export const MIN_GAMES = 30;
/** Confidence tiers on P(lead beats the runner-up). */
export const CLEAR_P = 0.9, SLIGHT_P = 0.7;
export type Confidence = 'clear' | 'slight' | 'toss-up';

/** The old relative floor (10% of the cell, 30..300). Kept for the minor-pair
 *  and build code that still uses it; picks no longer do. */
export function sampleFloor(cellGames: number): number {
  return Math.min(300, Math.max(30, Math.round(cellGames * 0.1)));
}

const cellGamesOf = (cell: FieldCell) => cell.games || (cell.eternals ?? []).reduce((s, e) => s + e.n, 0);

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
export function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export type Ranked<T> = T & { shrunk: number; sd: number; pickRate: number };
export interface EdgeRanking<T> {
  /** Lead first, then the rest by shrunk win rate. */
  ranked: Ranked<T>[];
  confidence: Confidence | null;
  /** P(lead beats the next option); null with fewer than two options. */
  pBeat: number | null;
  /** Shrunk win-rate gap to the next option, percentage points. */
  edgePts: number | null;
  /** Options statistically tied with the top (toss-up only, lead included). */
  contenders: Ranked<T>[];
  /** True when no option reaches MIN_GAMES: ranked is then by games, unrated. */
  thin: boolean;
  /** Options under MIN_GAMES (by games), listed after the ranked ones, never ranked. */
  below: Ranked<T>[];
}

/** The rows a page list shows: ranked first, then under-30 ones filling slots. */
export function shownOptions<T extends NW>(r: EdgeRanking<T>, max = 3): Ranked<T>[] {
  return [...r.ranked, ...r.below].slice(0, max);
}

/** Rank options by empirical-Bayes win rate and say how sure the lead is.
 *  Prior mean = the pick-weighted mean of the options; prior strength k from
 *  the spread of their rates (method of moments, 10..1000 games), 100 when
 *  there are too few options to fit it (augments: three per hero). */
export function rankByEdge<T extends NW>(xs: T[], cellGames: number): EdgeRanking<T> {
  const usable = xs.filter((x) => x.n >= MIN_GAMES);
  const thin = !usable.length;
  const pool = thin ? xs.filter((x) => x.n > 0) : usable;
  const totN = pool.reduce((s, x) => s + x.n, 0);
  const mean = totN ? pool.reduce((s, x) => s + x.w, 0) / totN : 0.5;
  let k = 100;
  if (pool.length >= 5) {
    const rates = pool.map((x) => x.w / x.n);
    const m = rates.reduce((s, r) => s + r, 0) / rates.length;
    const varObs = rates.reduce((s, r) => s + (r - m) ** 2, 0) / rates.length;
    const noise = pool.reduce((s, x) => s + (mean * (1 - mean)) / x.n, 0) / pool.length;
    k = Math.min(Math.max((mean * (1 - mean)) / Math.max(varObs - noise, 1e-5) - 1, 10), 1000);
  }
  const games = cellGames || totN;
  const shrink = (x: T): Ranked<T> => {
    const shrunk = (x.w + k * mean) / (x.n + k);
    return { ...x, shrunk, sd: Math.sqrt((shrunk * (1 - shrunk)) / (x.n + k)), pickRate: games ? x.n / games : 0 };
  };
  const byShrunk = pool.map(shrink).sort((a, b) => b.shrunk - a.shrunk);
  const pOver = (a: Ranked<T>, b: Ranked<T>) => phi((a.shrunk - b.shrunk) / Math.hypot(a.sd, b.sd));
  const below = thin ? [] : xs.filter((x) => x.n < MIN_GAMES).sort((a, b) => b.n - a.n).map(shrink);
  // Nothing has enough games to rank: say so and lead with the most-played.
  if (thin) return { ranked: byShrunk.sort((a, b) => b.n - a.n), confidence: null, pBeat: null, edgePts: null, contenders: [], thin, below };
  // One option with enough games: nothing to compare, so no edge is claimed.
  if (byShrunk.length < 2) return { ranked: byShrunk, confidence: null, pBeat: null, edgePts: null, contenders: [], thin, below };
  const top = byShrunk[0]!;
  const p = pOver(top, byShrunk[1]!);
  const confidence: Confidence = p >= CLEAR_P ? 'clear' : p >= SLIGHT_P ? 'slight' : 'toss-up';
  let ranked = byShrunk, contenders: Ranked<T>[] = [];
  if (confidence === 'toss-up') {
    contenders = byShrunk.filter((x) => x === top || pOver(top, x) < SLIGHT_P);
    const lead = [...contenders].sort((a, b) => b.n - a.n)[0]!;
    ranked = [lead, ...byShrunk.filter((x) => x !== lead)];
  }
  const next = ranked[1]!;
  return { ranked, confidence, pBeat: confidence === 'toss-up' ? null : p, edgePts: (ranked[0]!.shrunk - next.shrunk) * 100, contenders, thin, below };
}

const meta = <T>(r: EdgeRanking<T>): PickInfo => ({
  confidence: r.confidence, pBeat: r.pBeat == null ? null : Math.round(r.pBeat * 100) / 100,
  shrunkWr: r1(r.ranked[0]!.shrunk), pickRate: Math.round(r.ranked[0]!.pickRate * 1000) / 10,
});

export function bestAugment(cell: FieldCell): FieldPick['augment'] {
  const r = rankByEdge(cell.augments ?? [], cellGamesOf(cell));
  const a = r.ranked[0];
  return a ? { id: String(a.id), name: a.name, wr: r1(a.w / a.n), n: a.n, ...meta(r) } : null;
}

export function bestCrest(cell: FieldCell): FieldPick['crest'] {
  const r = rankByEdge(cell.crests ?? [], cellGamesOf(cell));
  const c = r.ranked[0];
  return c && !r.thin ? { name: c.name, wr: r1(c.w / c.n), n: c.n, ...meta(r) } : null;
}

/** Eternals in recommendation order (rankByEdge). */
export function rankedEternals(cell: FieldCell): Ranked<EternalCell>[] {
  return rankByEdge(cell.eternals ?? [], cellGamesOf(cell)).ranked;
}

/** The minor pair that wins most under this Eternal: pairs with 10% of the
 *  Eternal's games (min 30), shrunk 50 games toward the Eternal's own rate.
 *  Falls back to the most-picked minor per slot when no pair clears the floor. */
export function bestMinors(et: EternalCell): FieldPick['minors'] {
  const floor = Math.max(30, Math.round(et.n * 0.1));
  const base = et.n ? et.w / et.n : 0.5;
  const pairs = (et.pairs ?? []).filter((p) => p.n >= floor)
    .map((p) => ({ ...p, shrunk: (p.w + 50 * base) / (p.n + 50) }))
    .sort((a, b) => b.shrunk - a.shrunk);
  const p = pairs[0];
  if (p) return { minor1: p.minor1, minor2: p.minor2, wr: r1(p.w / p.n), n: p.n, basis: 'best-pair' };
  const m1 = et.minor1?.[0], m2 = et.minor2?.[0];
  if (!m1 || !m2) return null;
  return { minor1: m1.name, minor2: m2.name, wr: r1(Math.min(m1.w / m1.n, m2.w / m2.n)), n: Math.min(m1.n, m2.n), basis: 'most-picked' };
}

export function fieldPickOf(cell: FieldCell | undefined | null): FieldPick | null {
  if (!cell) return null;
  const er = rankByEdge(cell.eternals ?? [], cellGamesOf(cell));
  const et = er.ranked[0];
  return {
    augment: bestAugment(cell),
    eternal: et ? { name: et.name, wr: r1(et.w / et.n), n: et.n, ...meta(er) } : null,
    minors: et ? bestMinors(et) : null,
    crest: bestCrest(cell),
  };
}
