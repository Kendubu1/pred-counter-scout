// Readers over data/aggregates/build-matchups.json (ingest/build-matchups.ts):
// how builds shift by matchup, in both directions. Pure functions; evidence
// only, never a generator input.
//
//   intoOpponent(st, 'serath', 'jungle', 'khaimera')  what Serath junglers build INTO Khaimera
//   againstHero(st, 'khaimera')                        what ENEMIES build when Khaimera is on the other team
//
// Each item's rate is compared with the same players' usual rate (their
// hero-role's games WITHOUT this matchup). Shifts are judged by z = (observed
// - expected) / sd; every list reports how many rows that extreme pure luck
// would give among all rows tested, because a top-N list is otherwise
// unreadable (docs/fork-in-the-road.md 14b: the shuffled null matched most
// of a 40-row Plat+ list).
import type { BuildMatchups, Cell, Counts } from './ingest/build-matchups.js';

export type Band = 'all' | 'plat';
export interface Shift {
  item: string; n: number; has: number;
  /** per 100 players in this matchup, and per 100 for the same players' usual builds */
  per100: number; usual100: number;
  z: number;
}
export interface ShiftList<S extends Shift = Shift> { tested: number; zMin: number; expectedByLuck: number; rises: S[]; drops: S[] }
export interface OppShift extends Shift { opp: string }
export interface RoleShifts extends ShiftList { role: string; players: number }

const pick = (c: Cell | undefined, band: Band): Counts | undefined => (band === 'plat' ? c?.p : c);

/** Two-sided normal tail P(|Z| >= z) (Abramowitz-Stegun erfc, |error| < 1.5e-7). */
export function tail2(z: number): number {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return erfc;
}

// The z score overstates rare items (normal approximation near 0%), so a shown
// shift also needs MIN_PTS of real difference and MIN_HAS players with the item.
export const MIN_PTS = 2, MIN_HAS = 5;
const big = (r: Shift) => Math.abs(r.per100 - r.usual100) >= MIN_PTS && Math.max(r.has, (r.usual100 / 100) * r.n) >= MIN_HAS;

function finish<S extends Shift>(rows: S[], zMin: number): ShiftList<S> {
  return {
    tested: rows.length, zMin, expectedByLuck: rows.length * tail2(zMin),
    rises: rows.filter((r) => r.z >= zMin && big(r)).sort((a, b) => b.per100 - b.usual100 - (a.per100 - a.usual100)),
    drops: rows.filter((r) => r.z <= -zMin && big(r)).sort((a, b) => a.per100 - a.usual100 - (b.per100 - b.usual100)),
  };
}

/** One matchup cell vs the rest of its hero-role: per item observed vs usual. */
function cellShifts(all: Counts, c: Counts, minN: number, minItem: number): Shift[] {
  const baseN = all.n - c.n;
  if (c.n < minN || baseN < minN) return [];
  const out: Shift[] = [];
  for (const [item, allHas] of Object.entries(all.i)) {
    if (allHas < minItem) continue;
    const has = c.i[item] ?? 0, usual = (allHas - has) / baseN;
    const sd = Math.sqrt(c.n * usual * (1 - usual) + (c.n * c.n * usual * (1 - usual)) / baseN);
    if (sd === 0) continue;
    out.push({ item, n: c.n, has, per100: (has / c.n) * 100, usual100: usual * 100, z: (has - c.n * usual) / sd });
  }
  return out;
}

export interface Opts { band?: Band; minN?: number; minItem?: number; zMin?: number }
const D = { band: 'all' as Band, minN: 25, minItem: 10, zMin: 3 };

/** What `hero` in `role` builds into `opp` (as lane opponent, or anywhere on the enemy team). */
export function intoOpponent(st: BuildMatchups, hero: string, role: string, opp: string, scope: 'lane' | 'team' = 'lane', o: Opts = {}): ShiftList {
  const { band, minN, minItem, zMin } = { ...D, ...o };
  const hr = st.heroes[`${hero}|${role}`];
  const all = pick(hr?.all, band), c = pick(hr?.[scope][opp], band);
  return finish(all && c ? cellShifts(all, c, minN, minItem) : [], zMin);
}

/** Every lane opponent of `hero` in `role` at once: the biggest build changes, by opponent. */
export function allOpponents(st: BuildMatchups, hero: string, role: string, o: Opts = {}): ShiftList<OppShift> {
  const { band, minN, minItem, zMin } = { ...D, ...o };
  const hr = st.heroes[`${hero}|${role}`];
  const all = pick(hr?.all, band);
  const rows: OppShift[] = [];
  if (all && hr) for (const [opp, c] of Object.entries(hr.lane)) { const cc = pick(c, band); if (cc) rows.push(...cellShifts(all, cc, minN, minItem).map((s) => ({ ...s, opp }))); }
  return finish(rows, zMin);
}

/**
 * What enemies build when `target` is on the other team, per enemy role.
 * Pools every enemy hero in that role; each player's expected rate is their
 * OWN hero-role's usual rate, so a role full of heroes that always buy an
 * item does not read as a reaction to `target`.
 */
export function againstHero(st: BuildMatchups, target: string, o: Opts = {}): RoleShifts[] {
  const { band, minN, minItem, zMin } = { ...D, ...o };
  const byRole = new Map<string, { players: number; items: Map<string, { has: number; exp: number; v: number; n: number }> }>();
  for (const [key, hr] of Object.entries(st.heroes)) {
    const [hero, role] = key.split('|') as [string, string];
    if (hero === target) continue;
    const all = pick(hr.all, band), c = pick(hr.team[target], band);
    if (!all || !c) continue;
    const baseN = all.n - c.n;
    if (baseN < minN || c.n === 0) continue;
    const r = byRole.get(role) ?? { players: 0, items: new Map() };
    r.players += c.n;
    for (const [item, allHas] of Object.entries(all.i)) {
      const has = c.i[item] ?? 0, usual = (allHas - has) / baseN;
      const a = r.items.get(item) ?? { has: 0, exp: 0, v: 0, n: 0 };
      a.has += has; a.exp += c.n * usual; a.v += c.n * usual * (1 - usual) + (c.n * c.n * usual * (1 - usual)) / baseN; a.n += allHas;
      r.items.set(item, a);
    }
    byRole.set(role, r);
  }
  const out: RoleShifts[] = [];
  for (const [role, r] of byRole) {
    if (r.players < minN) continue;
    const rows: Shift[] = [];
    for (const [item, a] of r.items) {
      if (a.n < minItem || a.v === 0) continue;
      rows.push({ item, n: r.players, has: a.has, per100: (a.has / r.players) * 100, usual100: (a.exp / r.players) * 100, z: (a.has - a.exp) / Math.sqrt(a.v) });
    }
    out.push({ role, players: r.players, ...finish(rows, zMin) });
  }
  return out.sort((a, b) => b.players - a.players);
}
