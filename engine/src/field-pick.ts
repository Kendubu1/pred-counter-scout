// Field picks: what gives the best statistical edge in the ranked field, per
// hero-role, from the public match stream counts
// (data/aggregates/predgg-augments.json). This is the recommendation everywhere a
// pick is shown (hero page card, the lane steer, the coach lobby, the CLI). The
// kit-math sim is experimental and never overrides it (maintainer, 2026-10-25).
//
// Rule (maintainer, 2026-10-27: "a statistical edge, not whatever everyone uses
// unless it's winning"): every option's win rate is shrunk by empirical Bayes,
// so its weight grows with its games. All ranks: toward the lane's average
// (30-game junk floor). Plat+: toward that option's OWN all-ranks rate, shifted
// by the band gap (BAND_K games of prior), so a thin Plat+ sample borrows the
// all-ranks evidence instead of standing alone. The lead is the highest shrunk
// rate among options with enough games to lead (leadFloor: 10% of the lane,
// 10..300), and the page says how sure: P(lead beats the next best) >= 90%
// "clear", >= 70% "slight", else a "toss-up" (maintainer, 2026-10-27: toss-ups
// lead with the best odds, not the most-played). ui/v6/index.html mirrors these
// rules client-side; keep the two in step.

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

/** All ranks: options with fewer games than this are noise and never ranked. */
export const MIN_GAMES = 30;
/** Plat+: prior weight (games) of an option's all-ranks rate. */
export const BAND_K = 100;
/** Confidence tiers on P(lead beats the next best). */
export const CLEAR_P = 0.9, SLIGHT_P = 0.7;
export type Confidence = 'clear' | 'slight' | 'toss-up';

/** Games an option needs to lead (or be crowned): 10% of the lane, 10..300.
 *  Ranked options under it are listed, tagged few, and never move the label. */
export function leadFloor(cellGames: number): number {
  return Math.min(300, Math.max(10, Math.round(cellGames * 0.1)));
}

/** The old relative floor (10% of the cell, 30..300). Kept for the minor-pair
 *  and build code that still uses it; picks use leadFloor. */
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

export type Ranked<T> = T & { shrunk: number; sd: number; pickRate: number; few: boolean };
export interface EdgeRanking<T> {
  /** Lead first, then the rest by shrunk win rate. */
  ranked: Ranked<T>[];
  confidence: Confidence | null;
  /** P(lead beats the next option with enough games); null unless clear or slight. */
  pBeat: number | null;
  /** Shrunk win-rate gap to the next best, percentage points. */
  edgePts: number | null;
  /** Toss-up only: the options statistically tied with the lead (lead first). */
  contenders: Ranked<T>[];
  /** True when nothing has enough games to lead: ranked is then by games, unrated. */
  thin: boolean;
  /** All ranks: options under MIN_GAMES (by games), listed after, never ranked. */
  below: Ranked<T>[];
}

/** The rows a page list shows: ranked first, then under-30 ones filling slots. */
export function shownOptions<T extends NW>(r: EdgeRanking<T>, max = 3): Ranked<T>[] {
  return [...r.ranked, ...r.below].slice(0, max);
}

export interface RankOpts<T> {
  /** Per-option prior mean (Plat+: the option's all-ranks rate); BAND_K games strong. */
  prior?: (x: T) => number;
}

/** Rank options by empirical-Bayes win rate and say how sure the lead is.
 *  Without a prior: mean = the options' pick-weighted mean, strength k from the
 *  spread of their rates (method of moments, 10..1000 games), 100 when there are
 *  too few options to fit it (augments: three per hero). */
export function rankByEdge<T extends NW>(xs: T[], cellGames: number, opts: RankOpts<T> = {}): EdgeRanking<T> {
  const prior = opts.prior;
  const live = xs.filter((x) => x.n > 0);
  const usable = prior ? live : live.filter((x) => x.n >= MIN_GAMES);
  const pool = usable.length ? usable : live;
  const totN = pool.reduce((s, x) => s + x.n, 0);
  const mean = totN ? pool.reduce((s, x) => s + x.w, 0) / totN : 0.5;
  let k = 100;
  if (!prior && pool.length >= 5) {
    const rates = pool.map((x) => x.w / x.n);
    const m = rates.reduce((s, r) => s + r, 0) / rates.length;
    const varObs = rates.reduce((s, r) => s + (r - m) ** 2, 0) / rates.length;
    const noise = pool.reduce((s, x) => s + (mean * (1 - mean)) / x.n, 0) / pool.length;
    k = Math.min(Math.max((mean * (1 - mean)) / Math.max(varObs - noise, 1e-5) - 1, 10), 1000);
  }
  const games = cellGames || totN;
  const floor = leadFloor(games);
  const shrink = (x: T): Ranked<T> => {
    const pm = prior ? prior(x) : mean, kk = prior ? BAND_K : k;
    const shrunk = (x.w + kk * pm) / (x.n + kk);
    return { ...x, shrunk, sd: Math.sqrt((shrunk * (1 - shrunk)) / (x.n + kk)), pickRate: games ? x.n / games : 0, few: x.n < floor };
  };
  const byShrunk = pool.map(shrink).sort((a, b) => b.shrunk - a.shrunk);
  const below = usable.length && !prior ? live.filter((x) => x.n < MIN_GAMES).sort((a, b) => b.n - a.n).map(shrink) : [];
  const none = { pBeat: null, edgePts: null, contenders: [] as Ranked<T>[], below };
  const lead = byShrunk.find((x) => !x.few);
  // Nothing has enough games to lead: say so and list by games.
  if (!lead) return { ranked: byShrunk.sort((a, b) => b.n - a.n), confidence: null, thin: true, ...none };
  const others = byShrunk.filter((x) => x !== lead);
  const ranked = [lead, ...others];
  // Confidence compares the lead with options that could lead too; ones under
  // the lead floor are listed (tagged few) but never move the label.
  const rivals = others.filter((x) => !x.few);
  // One option with enough games: nothing to compare, so no edge is claimed.
  if (!rivals.length) return { ranked, confidence: null, thin: false, ...none };
  const pOver = (a: Ranked<T>, b: Ranked<T>) => phi((a.shrunk - b.shrunk) / Math.hypot(a.sd, b.sd));
  const next = rivals[0]!;
  const p = pOver(lead, next);
  const confidence: Confidence = p >= CLEAR_P ? 'clear' : p >= SLIGHT_P ? 'slight' : 'toss-up';
  const contenders = confidence === 'toss-up' ? [lead, ...rivals.filter((x) => pOver(lead, x) < SLIGHT_P)] : [];
  return { ranked, confidence, pBeat: confidence === 'toss-up' ? null : p, edgePts: (lead.shrunk - next.shrunk) * 100, contenders, thin: false, below };
}

type Keyed = NW & { id?: string | number; name: string };
const keyOf = (x: Keyed) => String(x.id ?? x.name);

/** Plat+ prior: each option's all-ranks shrunk rate plus the band's win-rate gap
 *  (an option with no all-ranks evidence gets the band's average). */
export function bandPrior<T extends Keyed>(allXs: T[], allCell: { games?: number; wins?: number }, band: { games?: number; wins?: number }): (x: T) => number {
  const all = rankByEdge(allXs, allCell.games ?? 0);
  const rate = new Map([...all.ranked, ...all.below].filter((x) => x.n >= MIN_GAMES).map((x) => [keyOf(x), x.shrunk]));
  const bandMean = band.games ? (band.wins ?? 0) / band.games : 0.5;
  const gap = allCell.games ? bandMean - (allCell.wins ?? 0) / allCell.games : 0;
  return (x) => { const r = rate.get(keyOf(x)); return r === undefined ? bandMean : Math.min(0.95, Math.max(0.05, r + gap)); };
}

/** Rank one list of a Plat+ cell, borrowing each option's all-ranks rate. */
export function rankBand<K extends 'augments' | 'eternals' | 'crests'>(allCell: FieldCell, band: FieldCell, kind: K): EdgeRanking<NonNullable<FieldCell[K]>[number]> {
  type T = NonNullable<FieldCell[K]>[number];
  const allXs = (allCell[kind] ?? []) as T[];
  return rankByEdge((band[kind] ?? []) as T[], cellGamesOf(band), { prior: bandPrior<T & Keyed>(allXs as (T & Keyed)[], allCell, band) as (x: T) => number });
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
