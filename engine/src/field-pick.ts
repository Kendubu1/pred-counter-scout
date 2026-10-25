// Field picks: what the ranked field CLEARLY wins with, per hero-role, from the
// public match stream counts (data/aggregates/predgg-augments.json). This is the
// recommendation everywhere a pick is shown (hero page card, the lane steer, the
// coach lobby, the CLI). The kit-math sim is experimental and never overrides it
// (maintainer, 2026-10-25: "always pick what is clearly winning as the highest
// win rate even if the simulator loses").
//
// "Clearly" = a sample floor, so a 5-game fluke can never lead: 10% of the cell's
// games, clamped to 30..300 (the hero page card's rule since it shipped). The
// Eternal list is shrunk toward the cell mean (method of moments) because Eternal
// pick shares are wildly asymmetric; minor pairs shrink toward their Eternal.
// ui/v6/index.html mirrors these rules client-side; keep the two in step.

type NW = { n: number; w: number };
export interface AugmentCell { id: string; name: string; n: number; w: number }
export interface PairCell { minor1: string; minor2: string; n: number; w: number }
export interface EternalCell { name: string; n: number; w: number; minor1?: ({ name: string } & NW)[]; minor2?: ({ name: string } & NW)[]; pairs?: PairCell[] }
export interface FieldCell { games?: number; wins?: number; augments?: AugmentCell[]; eternals?: EternalCell[]; crests?: ({ name: string } & NW)[] }

export interface FieldPick {
  augment: { id: string; name: string; wr: number; n: number } | null;
  eternal: { name: string; wr: number; shrunkWr: number; n: number } | null;
  minors: { minor1: string; minor2: string; wr: number; n: number; basis: 'best-pair' | 'most-picked' } | null;
  crest: { name: string; wr: number; n: number } | null;
}

const r1 = (x: number) => Math.round(x * 1000) / 10;

export function sampleFloor(cellGames: number): number {
  return Math.min(300, Math.max(30, Math.round(cellGames * 0.1)));
}

const cellGamesOf = (cell: FieldCell) => cell.games || (cell.eternals ?? []).reduce((s, e) => s + e.n, 0);

/** Highest raw win rate among options at or above the floor (all of them when
 *  none clears it, so a thin early-patch cell still names a leader). */
function bestByWr<T extends NW>(xs: T[], floor: number): T | null {
  if (!xs.length) return null;
  const pool = xs.filter((x) => x.n >= floor);
  return [...(pool.length ? pool : xs)].sort((a, b) => b.w / b.n - a.w / a.n)[0] ?? null;
}

export function bestAugment(cell: FieldCell): FieldPick['augment'] {
  const a = bestByWr(cell.augments ?? [], sampleFloor(cellGamesOf(cell)));
  return a ? { id: String(a.id), name: a.name, wr: r1(a.w / a.n), n: a.n } : null;
}

export function bestCrest(cell: FieldCell): FieldPick['crest'] {
  const pool = (cell.crests ?? []).filter((c) => c.n >= sampleFloor(cellGamesOf(cell)));
  const c = [...pool].sort((a, b) => b.w / b.n - a.w / a.n)[0];
  return c ? { name: c.name, wr: r1(c.w / c.n), n: c.n } : null;
}

/** Eternals ranked by win rate shrunk toward the cell's pick-weighted mean,
 *  prior strength from the spread of the rates themselves (10..500 games). */
export function rankedEternals(cell: FieldCell): (EternalCell & { shrunk: number })[] {
  const all = cell.eternals ?? [];
  const totN = all.reduce((s, e) => s + e.n, 0);
  const mean = totN ? all.reduce((s, e) => s + e.w, 0) / totN : 0.5;
  const usable = all.filter((c) => c.n >= 5);
  let k = 50;
  if (usable.length >= 5) {
    const rates = usable.map((c) => c.w / c.n);
    const m = rates.reduce((s, r) => s + r, 0) / rates.length;
    const varObs = rates.reduce((s, r) => s + (r - m) ** 2, 0) / rates.length;
    const noise = usable.reduce((s, c) => s + (mean * (1 - mean)) / c.n, 0) / usable.length;
    k = Math.min(Math.max((mean * (1 - mean)) / Math.max(varObs - noise, 1e-5) - 1, 10), 500);
  }
  const floor = sampleFloor(cellGamesOf(cell));
  return all.filter((e) => e.n >= floor)
    .map((e) => ({ ...e, shrunk: (e.w + k * mean) / (e.n + k) }))
    .sort((x, y) => y.shrunk - x.shrunk);
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
  const et = rankedEternals(cell)[0];
  return {
    augment: bestAugment(cell),
    eternal: et ? { name: et.name, wr: r1(et.w / et.n), shrunkWr: r1(et.shrunk), n: et.n } : null,
    minors: et ? bestMinors(et) : null,
    crest: bestCrest(cell),
  };
}
