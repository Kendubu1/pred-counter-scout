// Meta board + Most-banned board scoring, shared by the current-patch build
// (ingest/build-artifacts.ts, ingest/ban-board.ts) and the past-patch boards
// (ingest/past-boards.ts) so every patch on the site's patch picker is scored
// by exactly the same rules. Pure functions over committed snapshots: zero-API.

import { momPriorStrength } from './evidence.js';

export type NW = { n: number; w: number };
export type LaneCell = NW & { bands?: Record<string, NW> };
export interface LaneStatsFile {
  patch: string; scopeLabel: string; matchesApprox: number; generatedAt: string; versionIds?: string[];
  rankBands?: { key: string; label: string; rankIds?: string[] }[];
  matchesApproxByBand?: Record<string, number>;
  heroes: Record<string, { byRole: Record<string, LaneCell> }>;
}
export type BoardRow = { slug: string; name: string; games: number; rawWr: number; shrunkWr: number; metaScore: number; badge: string | null; augmentPending?: boolean };

export const BOARD_ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'];

/** One empirical-Bayes shrink strength per lane from the all-ranks cells. */
export function lanePriorK(laneCells: Record<string, { byRole?: Record<string, NW> }>): Record<string, number> {
  const priorK: Record<string, number> = {};
  for (const r of BOARD_ROLES) {
    const cells = Object.values(laneCells)
      .map((h) => h.byRole?.[r])
      .filter((c): c is NW => !!c && c.n >= 30);
    priorK[r] = momPriorStrength(cells, 0.5);
  }
  return priorK;
}

/**
 * The meta board for one lane-cell source: all-ranks boards per role plus one
 * board per rank band. Every board runs the same scoring: same scaling games
 * floor, same shrink, same badges. Bands get their OWN prior strength and floor
 * because a 9k-match Diamond+ window is a different evidence regime than the
 * 200k-match all-ranks one.
 */
export function buildMetaBoards(opts: {
  laneCells: Record<string, { byRole?: Record<string, LaneCell> }>;
  matches: number;
  bands: { key: string; label: string }[];
  matchesByBand?: Record<string, number>;
  priorK: Record<string, number>;
  nameOf: (slug: string) => string | undefined; // undefined = no kit: excluded
  augmentPending?: (slug: string, role: string) => boolean;
}): { roles: Record<string, BoardRow[]>; rolesByBand: Record<string, Record<string, BoardRow[]>> } {
  const { laneCells, nameOf } = opts;
  const laneBoard = (role: string, cellOf: (h: { byRole?: Record<string, LaneCell> }) => NW | undefined, matches: number, fallbackK?: number): BoardRow[] => {
    const cells = Object.entries(laneCells)
      // unmapped hero_id:* entries are excluded: no kit, no portrait, no
      // page to link to (one such id is tracked in lessons.md)
      .map(([slug, h]) => ({ slug, cell: cellOf(h) }))
      // The games floor SCALES with the window: 30 games meant something in an
      // 8k-match feed window but is pure noise in a 103k-match patch sample —
      // without scaling, an 89-game off-role blip walked straight onto the
      // board's win-rate column. 1 in 500 matches keeps the old floor for the
      // old window size and moves it to ~200 for a full-patch pull.
      .filter((x): x is { slug: string; cell: NW } =>
        nameOf(x.slug) !== undefined && !!x.cell && x.cell.n >= Math.max(30, Math.round(matches / 500)));
    const k = fallbackK ?? momPriorStrength(cells.map((c) => c.cell), 0.5);
    // The augment gate used to DROP any (hero, lane) the augment pull lacks a
    // cell for. With current-patch lane evidence that quietly censors exactly
    // the interesting rows — a hero newly meta in a role, or a new hero — and
    // "the board is outdated" was the complaint that exposed it. The row now
    // stays and carries augmentPending; the hero page already renders an
    // honest no-field-evidence state for such cells.
    const scored = cells.map(({ slug, cell }) => ({
      slug,
      name: nameOf(slug) ?? slug,
      games: cell.n,
      rawWr: Math.round((cell.w / cell.n) * 1000) / 1000,
      shrunkWr: Math.round(((cell.w + k * 0.5) / (cell.n + k)) * 1000) / 1000,
      augmentPending: (opts.augmentPending?.(slug, role) ?? false) || undefined,
    }));
    // Meta = strong AND prevalent: average of each hero's percentile rank
    // on pick volume and on shrunk winrate within the lane. A naive
    // average of the raw numbers would re-import small-sample bias; the
    // winrate side is shrunk and both sides are rank-normalized.
    const pctl = (vals: number[], v: number) => vals.filter((x) => x < v).length / Math.max(vals.length - 1, 1);
    const gamesAll = scored.map((s) => s.games);
    const wrAll = scored.map((s) => s.shrunkWr);
    const withScore = scored.map((s) => {
      const pickPctl = pctl(gamesAll, s.games);
      const wrPctl = pctl(wrAll, s.shrunkWr);
      const badge = wrPctl >= 0.7 && pickPctl <= 0.35 ? 'sleeper'
        : pickPctl >= 0.7 && wrPctl <= 0.35 ? 'popular but losing' : null;
      return { ...s, metaScore: Math.round(((pickPctl + wrPctl) / 2) * 1000) / 1000, badge };
    });
    // The board is "what's winning in this lane" — so it's the UNION of the most
    // established picks (top by meta score) AND the highest win rates (top by shrunk
    // winrate), so a winning-but-rarely-picked sleeper (e.g. Wraith support, or the
    // many off-role offlane winners) isn't dropped just for low pick volume. The
    // sleeper/sample is disclosed by the game count + the verdict tag in the UI.
    const byMeta = [...withScore].sort((a, b) => b.metaScore - a.metaScore).slice(0, 8);
    const byWr = [...withScore].sort((a, b) => b.shrunkWr - a.shrunkWr).slice(0, 5);
    const seenSlug = new Set<string>();
    // Dedupe the union, then sort the whole board by metaScore so the lane reads
    // high-to-low (the appended sleepers were leaving the tail out of order).
    return [...byMeta, ...byWr]
      .filter((s) => { if (seenSlug.has(s.slug)) return false; seenSlug.add(s.slug); return true; })
      .sort((a, b) => b.metaScore - a.metaScore);
  };
  const roles: Record<string, BoardRow[]> = {};
  const rolesByBand: Record<string, Record<string, BoardRow[]>> = {};
  for (const role of BOARD_ROLES) {
    roles[role] = laneBoard(role, (h) => h.byRole?.[role], opts.matches, opts.priorK[role]);
    for (const band of opts.bands) {
      (rolesByBand[band.key] ??= {})[role] =
        laneBoard(role, (h) => h.byRole?.[role]?.bands?.[band.key], opts.matchesByBand?.[band.key] ?? 0);
    }
  }
  return { roles, rolesByBand };
}

export interface BanPull { patch: string; generatedAt: string; heroes: Record<string, { bans: number; bands: Record<string, number> }> }

/**
 * The Most-banned board (data/artifacts/bans.json shape). Ban counts from the
 * bans pull; picks and wins from the same lane-stats cells the meta board uses,
 * so every rate shares one match count.
 *
 * LANES: a ban removes a hero, not a lane, so a hero is listed under the lane
 * it is played in MOST at that rank band (lane + laneShare on each row).
 */
export function buildBanBoard(banSrc: BanPull, lane: LaneStatsFile, names: Map<string, string>) {
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const bands = lane.rankBands ?? [];
  const board = (band: string | null, matches: number) => {
    const rows = Object.entries(banSrc.heroes).filter(([slug]) => names.has(slug)).map(([slug, b]) => {
      const cells = BOARD_ROLES.map((r) => {
        const c = lane.heroes[slug]?.byRole?.[r];
        return { role: r, cell: band ? c?.bands?.[band] : c };
      }).filter((x): x is { role: string; cell: NW } => !!x.cell && x.cell.n > 0);
      const picks = cells.reduce((s, x) => s + x.cell.n, 0);
      const wins = cells.reduce((s, x) => s + x.cell.w, 0);
      const main = [...cells].sort((a, b2) => b2.cell.n - a.cell.n)[0];
      const bans = band ? (b.bands[band] ?? 0) : b.bans;
      return {
        slug, name: names.get(slug) ?? slug, bans, picks,
        banRate: r3(bans / matches),
        pickRate: r3(picks / matches),
        winRate: picks ? r3(wins / picks) : null,
        lane: main?.role ?? null,
        laneShare: main && picks ? r3(main.cell.n / picks) : null,
      };
    });
    return { matches, heroes: rows.sort((a, b2) => b2.bans - a.bans) };
  };
  return {
    patch: banSrc.patch,
    scope: lane.scopeLabel,
    generatedAt: banSrc.generatedAt,
    note: 'ban rate = share of ranked matches the hero was banned in (4-ban draft). Pick rate and win rate are summed over every lane the hero was played in; lane = the lane it is played in most at that rank. Rank bands follow the player\'s rank at the open split; they sum below all ranks because unplaced players only count there.',
    rankBands: bands.map((b) => ({ key: b.key, label: b.label })),
    all: board(null, lane.matchesApprox),
    byBand: Object.fromEntries(bands.map((b) => [b.key, board(b.key, lane.matchesApproxByBand?.[b.key] ?? 0)])),
  };
}
