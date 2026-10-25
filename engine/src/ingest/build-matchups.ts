// Matchup build counts: how a hero-role's first three core items change by
// who is on the other team. Counted inside the daily `npm run perks` loop
// (zero extra requests) and stored in data/aggregates/build-matchups.json.
// docs/fork-in-the-road.md section 14b.
//
// One table answers both directions:
//   "what I build into X"           -> heroes["<me>|<role>"].lane[X] / .team[X]
//   "what enemies build against X"  -> every heroes[*].team[X], compared with
//                                      those heroes' own usual builds
//
// Cell C = { n, i: { itemSlug: count }, p?: C-without-p } where n = players
// who completed 3 core items, i = how many had the item among those three,
// p = the same counts for Plat+ players: tier >= 3 IN THAT GAME (rank at match
// time, from match-rank.ts) since platBasis 'match-time'; the seed and the first
// daily runs used the ladder's CURRENT tier, which reads high (winners climb),
// so those p counts are dropped on migration and platFrom says when p restarted.
// The window resets with the patch, like perk-stream.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const BUILD_MATCHUPS = path.join(ROOT, 'data/aggregates/build-matchups.json');
export const PLAT_TIER = 3;
export const CORE_DEPTH = 3;

export interface Counts { n: number; i: Record<string, number> }
export interface Cell extends Counts { p?: Counts }
export interface HeroRoleCells { all: Cell; lane: Record<string, Cell>; team: Record<string, Cell> }
export interface BuildMatchups {
  source: string; note: string; generatedAt: string;
  patch: string | null; patchReleasedAt: string;
  /** segments of the stream that were counted (seeded or daily), so gaps are visible */
  window: { matches: number; segments: { from: string; to: string; via: string }[] };
  /** 'match-time' once p is counted by rank at match time; p counts start at platFrom. */
  platBasis?: 'match-time';
  platFrom?: string;
  heroes: Record<string, HeroRoleCells>;
}

/** One ranked match player, already decoded by the caller. */
export interface MatchPlayer { hero: string; role: string; team: number; core: string[]; plat: boolean }

export function emptyState(patch: string | null, patchReleasedAt: string): BuildMatchups {
  return {
    source: 'pred.gg public match stream (get-matches-since), RANKED, counted by npm run perks',
    note: 'heroes["hero|role"]: all = every player who completed 3 core items; lane[opp] = into that lane opponent; team[enemy] = with that hero anywhere on the other team (lane opponent included). n = players, i = players with the item among their first 3 core items, p = the same for Plat+ (tier >= 3 IN THAT GAME, counted from platFrom).',
    generatedAt: '', patch, patchReleasedAt, window: { matches: 0, segments: [] }, heroes: {},
  };
}

export function loadState(patch: string | null, patchReleasedAt: string): BuildMatchups {
  const prev = existsSync(BUILD_MATCHUPS) ? JSON.parse(readFileSync(BUILD_MATCHUPS, 'utf8')) as BuildMatchups : null;
  return prev && prev.patchReleasedAt === patchReleasedAt ? prev : emptyState(patch, patchReleasedAt);
}

/** Drop Plat+ (p) counts made on any basis but rank at match time; p restarts at `from`. */
export function migratePlatBasis(st: BuildMatchups, from: string): boolean {
  if (st.platBasis === 'match-time') return false;
  const strip = (c: Cell) => { delete c.p; };
  for (const h of Object.values(st.heroes)) { strip(h.all); Object.values(h.lane).forEach(strip); Object.values(h.team).forEach(strip); }
  st.platBasis = 'match-time';
  st.platFrom = from;
  return true;
}

export function saveState(st: BuildMatchups) {
  st.generatedAt = new Date().toISOString();
  writeFileSync(BUILD_MATCHUPS, JSON.stringify(st));
}

/** Record a counted stretch of the stream; extends the last segment when contiguous. */
export function addSegment(st: BuildMatchups, from: string, to: string, via: string) {
  const last = st.window.segments[st.window.segments.length - 1];
  if (last && last.via === via && last.to === from) last.to = to;
  else st.window.segments.push({ from, to, via });
}

const bump = (c: Counts, items: string[]) => { c.n++; for (const it of items) c.i[it] = (c.i[it] ?? 0) + 1; };
const cell = (o: Record<string, Cell>, k: string) => (o[k] ??= { n: 0, i: {} });

/** Count one ranked match. Players without 3 core items, or without a lane role, add nothing. */
export function countMatch(st: BuildMatchups, players: MatchPlayer[]) {
  st.window.matches++;
  for (const p of players) {
    if (p.core.length < CORE_DEPTH) continue;
    const items = p.core.slice(0, CORE_DEPTH);
    const hr = (st.heroes[`${p.hero}|${p.role}`] ??= { all: { n: 0, i: {} }, lane: {}, team: {} });
    const add = (c: Cell) => { bump(c, items); if (p.plat) bump((c.p ??= { n: 0, i: {} }), items); };
    add(hr.all);
    for (const e of players) {
      if (e.team === p.team) continue;
      if (e.role === p.role) add(cell(hr.lane, e.hero));
      add(cell(hr.team, e.hero));
    }
  }
}
