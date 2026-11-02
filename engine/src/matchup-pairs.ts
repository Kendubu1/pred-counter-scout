// Head-to-head lane pair counting for the counter list (ingest/matchup-feed.ts),
// pure so it is testable without a pull. Every ranked match pairs the two teams
// by role; each lane gives one directed record each way ("a|b" = a's record
// into b).
//
// RANK BANDS (added 2026-11-02, from 1.18): each directed record also counts in
// the band of the rank THAT player held in the game (the sampler's per-match
// rating, not the ladder's current rank), with the same tier split as the meta
// board's lane stats: low = Bronze+Silver, mid = Gold+Platinum, high = Diamond
// and up (Master joins in 1.18). Unplaced players count only in the all-ranks
// cells, so bands sum below them, as on the boards. Zero extra API: the sampler
// already returns the rank.

export type Cell = { n: number; w: number };
export type Cells = Map<string, Cell>;
export const MATCHUP_BANDS = [
  { key: 'low', label: 'Bronze–Silver' },
  { key: 'mid', label: 'Gold–Platinum' },
  { key: 'high', label: 'Diamond+' },
] as const;
export type BandKey = (typeof MATCHUP_BANDS)[number]['key'];
const ROLES = new Set(['carry', 'midlane', 'offlane', 'jungle', 'support']);

/** Sampler rank code (tens = tierIdx + 1, units = division; null = unplaced) -> band. */
export function bandOfRankCode(code: number | null | undefined): BandKey | null {
  if (code == null || !Number.isFinite(code) || code < 10) return null;
  const tier = Math.floor(code / 10) - 1;
  return tier <= 1 ? 'low' : tier <= 3 ? 'mid' : 'high';
}

interface PairPlayer { team: string; hero_slug: string; role: string | null; rank?: number | null }

const bump = (cells: Cells, key: string, won: boolean) => {
  const c = cells.get(key) ?? { n: 0, w: 0 };
  c.n++; if (won) c.w++; cells.set(key, c);
};

/**
 * Count one match's lane pairs into the all-ranks cells and the per-band cells.
 * Returns the number of lanes counted (0 when the match has no winner or does
 * not split into exactly two teams). Duplicate-role rows: the first is kept.
 */
export function countMatchPairs(
  m: { winning_team: string | null | undefined; players: PairPlayer[] },
  cells: Cells,
  byBand: Record<BandKey, Cells>,
): number {
  if (!m.winning_team) return 0;
  const byTeamRole = new Map<string, Map<string, PairPlayer>>();
  for (const p of m.players) {
    const role = p.role && ROLES.has(p.role) ? p.role : null;
    if (!role) continue;
    let tr = byTeamRole.get(p.team);
    if (!tr) { tr = new Map(); byTeamRole.set(p.team, tr); }
    if (!tr.has(role)) tr.set(role, p);
  }
  const teams = [...byTeamRole.keys()];
  if (teams.length !== 2) return 0;
  const [t1, t2] = teams as [string, string];
  let lanes = 0;
  for (const role of ROLES) {
    const a = byTeamRole.get(t1)!.get(role), b = byTeamRole.get(t2)!.get(role);
    if (!a || !b || a.hero_slug === b.hero_slug) continue;
    const aWon = t1 === m.winning_team;
    const fwd = `${a.hero_slug}|${b.hero_slug}`, rev = `${b.hero_slug}|${a.hero_slug}`;
    bump(cells, fwd, aWon);
    bump(cells, rev, !aWon);
    const ba = bandOfRankCode(a.rank), bb = bandOfRankCode(b.rank);
    if (ba) bump(byBand[ba], fwd, aWon);
    if (bb) bump(byBand[bb], rev, !aWon);
    lanes++;
  }
  return lanes;
}

/** The n-gated consumable: { wr (percent, 1 dp), n } per directed pair. */
export function gatePairs(cells: Cells, minGames: number): Record<string, { wr: number; n: number; towerDiff: null }> {
  const out: Record<string, { wr: number; n: number; towerDiff: null }> = {};
  for (const [key, c] of cells) if (c.n >= minGames) out[key] = { wr: Math.round((c.w / c.n) * 1000) / 10, n: c.n, towerDiff: null };
  return out;
}

export const emptyBands = (): Record<BandKey, Cells> => ({ low: new Map(), mid: new Map(), high: new Map() });
