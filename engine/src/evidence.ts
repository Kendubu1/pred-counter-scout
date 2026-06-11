// Statistical evidence layer v0 (design doc component D, low tier):
// empirical-Bayes shrinkage over the committed aggregates. Evidence is
// NEVER a generator input; it calibrates, badges, and sanity-checks.
//
// Method: beta-binomial shrinkage with a method-of-moments prior strength
// estimated from the data itself (no hand-picked K). For a cell with w
// wins in n games and prior mean m: shrunk = (w + K*m) / (n + K).
//
// KNOWN BIAS, carried on every output: item cells count presence in
// FINISHED inventories. Winners hold gold leads and finish more items, so
// presence-winrate is inflated for late/expensive items and the deltas
// skew positive. Treat deltas comparatively (item vs item on the same
// hero), not absolutely. Fix planned: condition on duration/slot index.

import { loadAggregates, type AggregateSnapshot } from './aggregates.js';

export interface ShrunkRate {
  raw: number;
  shrunk: number;
  n: number;
  priorMean: number;
  priorStrength: number;
}

/**
 * Method-of-moments prior strength across cells sharing a prior mean:
 * observed variance of cell rates minus expected binomial sampling noise
 * leaves the prior variance; K = m(1-m)/tau2 - 1, clamped to sane bounds.
 */
export function momPriorStrength(cells: { n: number; w: number }[], priorMean: number): number {
  const usable = cells.filter((c) => c.n >= 5);
  if (usable.length < 5) return 50; // not enough cells to estimate; conservative default
  const rates = usable.map((c) => c.w / c.n);
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  const varObs = rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length;
  const samplingNoise = usable.reduce((s, c) => s + (priorMean * (1 - priorMean)) / c.n, 0) / usable.length;
  const tau2 = Math.max(varObs - samplingNoise, 1e-5);
  const k = (priorMean * (1 - priorMean)) / tau2 - 1;
  return Math.min(Math.max(k, 10), 500);
}

function shrink(w: number, n: number, priorMean: number, k: number): ShrunkRate {
  return {
    raw: n > 0 ? w / n : priorMean,
    shrunk: (w + k * priorMean) / (n + k),
    n,
    priorMean,
    priorStrength: k,
  };
}

let heroK: number | null = null;

/** Hero winrate shrunk toward the global 50% (every match has one winner). */
export function heroWinRate(slug: string, agg: AggregateSnapshot | null = loadAggregates()): ShrunkRate | null {
  const h = agg?.heroes[slug];
  if (!h || !agg) return null;
  if (heroK == null) {
    heroK = momPriorStrength(Object.values(agg.heroes).map((x) => ({ n: x.games, w: x.wins })), 0.5);
  }
  return shrink(h.wins, h.games, 0.5, heroK);
}

const itemKCache = new Map<string, number>();

/**
 * Item-on-hero winrate delta: the item cell shrunk toward the hero's own
 * shrunk mean (hierarchical: item within hero), minus that mean. Positive
 * = the hero wins more with the item than their baseline, subject to the
 * survivorship bias documented above.
 */
export function itemWinDelta(
  slug: string, itemGameId: number | null, agg: AggregateSnapshot | null = loadAggregates(),
): (ShrunkRate & { delta: number; biased: 'finished-inventory survivorship' }) | null {
  if (!agg || itemGameId == null) return null;
  const h = agg.heroes[slug];
  const hero = heroWinRate(slug, agg);
  if (!h || !hero || h.games < 30) return null;
  const cell = h.items[String(itemGameId)];
  if (!cell || cell.n < 10) return null;
  let k = itemKCache.get(slug);
  if (k == null) {
    k = momPriorStrength(Object.values(h.items), hero.shrunk);
    itemKCache.set(slug, k);
  }
  const s = shrink(cell.w, cell.n, hero.shrunk, k);
  return { ...s, delta: s.shrunk - hero.shrunk, biased: 'finished-inventory survivorship' };
}
