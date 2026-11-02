// Head-to-head counter records, shrunk by empirical Bayes (maintainer, 2026-11-02:
// rank counters the way picks are ranked, so a 24-game 62% record can't top
// the list over an 818-game 54% one).
//
// A pair "a|b" is a's same-lane record into b from the pred.gg match sample
// (data/aggregates/feed-matchups.json). Its prior is what the two heroes'
// overall lane win rates predict for the pair: 0.5 + (a's lane rate - 0.5)
// - (b's lane rate - 0.5), from the index roleWr (ranked lane stats, this
// patch), in the lane both play most. Strength k is fitted from the spread of
// the records around that prior (method of moments, same estimator and 10..1000
// clamp as field-pick.ts rankByEdge). On the 1.17 sample (1,946 pairs, 2026-11-02)
// the fitted spread is ~0, so k sits at the 1000-game cap. Fitting only on
// records of 100+ games gives a true matchup spread of ~1 pt around the prior
// (k ~3000), so the cap is the generous end: by GAME win rate, the two heroes'
// lane strength explains almost all of a head-to-head record, and the specific
// matchup moves it about a point.

export interface NW { n: number; w: number }
export type RoleWr = Record<string, Record<string, { wr: number; n: number }>>;

export const MATCHUP_MIN_GAMES = 20;
export const K_MIN = 10, K_MAX = 1000, K_DEFAULT = 100;

const clampP = (p: number) => Math.min(0.95, Math.max(0.05, p));

/** The lane the pair most likely met in: the shared role with the most games
 *  for the thinner of the two heroes. Null when they share none. */
export function pairLane(a: string, b: string, roleWr: RoleWr): string | null {
  const ra = roleWr[a], rb = roleWr[b];
  if (!ra || !rb) return null;
  const common = Object.keys(ra).filter((r) => rb[r]);
  if (!common.length) return null;
  return common.reduce((best, r) => (Math.min(ra[r]!.n, rb[r]!.n) > Math.min(ra[best]!.n, rb[best]!.n) ? r : best));
}

/** Prior win rate (0..1) of a into b from their lane strength; 0.5 when unknown. */
export function pairPrior(a: string, b: string, roleWr: RoleWr): number {
  const lane = pairLane(a, b, roleWr);
  if (!lane) return 0.5;
  return clampP(0.5 + (roleWr[a]![lane]!.wr - 0.5) - (roleWr[b]![lane]!.wr - 0.5));
}

/** Prior strength in games: p(1-p) / (observed spread - binomial noise) - 1. */
export function fitK(xs: (NW & { p: number })[]): number {
  const live = xs.filter((x) => x.n > 0);
  if (live.length < 5) return K_DEFAULT;
  const resid = live.map((x) => x.w / x.n - x.p);
  const m = resid.reduce((s, r) => s + r, 0) / resid.length;
  const varObs = resid.reduce((s, r) => s + (r - m) ** 2, 0) / resid.length;
  const noise = live.reduce((s, x) => s + (x.p * (1 - x.p)) / x.n, 0) / live.length;
  const pbar = live.reduce((s, x) => s + x.p, 0) / live.length;
  return Math.min(Math.max((pbar * (1 - pbar)) / Math.max(varObs - noise, 1e-5) - 1, K_MIN), K_MAX);
}

/** lane: where the pair most likely met (pairLane). The records don't carry a
 *  lane, so a flex hero's record can come from another lane; pages countering a
 *  specific lane should only use records whose lane matches it. */
export interface ShrunkPair { wr: number; n: number; towerDiff: null; shrunkWr: number; prior: number; lane: string | null }

const pct = (x: number) => Math.round(x * 1000) / 10;

/** The n-gated consumable `pairs` with each record's shrunk rate and prior (percent, 1 dp). */
export function shrinkPairs(cells: Record<string, NW>, roleWr: RoleWr, minGames = MATCHUP_MIN_GAMES): { pairs: Record<string, ShrunkPair>; k: number } {
  const gated = Object.entries(cells).filter(([, c]) => c.n >= minGames).map(([key, c]) => {
    const [a, b] = key.split('|') as [string, string];
    return { key, ...c, p: pairPrior(a, b, roleWr), lane: pairLane(a, b, roleWr) };
  });
  const k = fitK(gated);
  const pairs: Record<string, ShrunkPair> = {};
  for (const x of gated) pairs[x.key] = { wr: pct(x.w / x.n), n: x.n, towerDiff: null, shrunkWr: pct((x.w + k * x.p) / (x.n + k)), prior: pct(x.p), lane: x.lane };
  return { pairs, k: Math.round(k) };
}

/** Plat+-style band prior weight (games), as field-pick.ts BAND_K. */
export const BAND_K = 100;

/** A rank band's n-gated records, shrunk toward the same pair's all-ranks
 *  shrunk rate (or, when the pair has no all-ranks record, its lane-strength
 *  prior) with BAND_K games of prior: a thin band sample borrows the all-ranks
 *  evidence, as Plat+ picks do (CLAUDE.md recommendation policy). */
export function shrinkBandPairs(bandCells: Record<string, NW>, allPairs: Record<string, ShrunkPair>, roleWr: RoleWr, minGames = MATCHUP_MIN_GAMES): Record<string, ShrunkPair> {
  const out: Record<string, ShrunkPair> = {};
  for (const [key, c] of Object.entries(bandCells)) {
    if (c.n < minGames) continue;
    const [a, b] = key.split('|') as [string, string];
    const all = allPairs[key];
    const p = all ? all.shrunkWr / 100 : pairPrior(a, b, roleWr);
    out[key] = { wr: pct(c.w / c.n), n: c.n, towerDiff: null, shrunkWr: pct((c.w + BAND_K * p) / (c.n + BAND_K)), prior: pct(p), lane: all ? all.lane : pairLane(a, b, roleWr) };
  }
  return out;
}

/** Index heroes -> RoleWr (data/artifacts/index.json roleWr). */
export function roleWrOf(index: { heroes: { slug: string; roleWr?: Record<string, { wr: number; n: number }> }[] }): RoleWr {
  return Object.fromEntries(index.heroes.filter((h) => h.roleWr).map((h) => [h.slug, h.roleWr!]));
}

export const SHRINK_NOTE = 'shrunkWr = empirical-Bayes head-to-head rate: (wins + k*prior) / (games + k). prior = 0.5 + (a lane wr - 0.5) - (b lane wr - 0.5) from the index roleWr in the lane both play most; k fitted from the records\' spread around the prior (method of moments, 10..1000). lane = the lane the pair most likely met in (shared role with the most games for the thinner hero); records carry no lane of their own. Counters rank by shrunkWr (src/matchup-edge.ts).';
