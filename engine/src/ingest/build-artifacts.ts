// Concept A `engine` stage: emit per-hero artifacts to data/artifacts/.
//   npm run artifacts             (all heroes)
//   npm run artifacts -- gideon murdock

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadData } from '../data.js';
import { buildHeroArtifact } from '../artifacts.js';
import { loadCalibration } from '../sim.js';
import { loadAggregates } from '../aggregates.js';
import { momPriorStrength } from '../evidence.js';
import { hasCredentials, topPlayersPerLane } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/artifacts');

const requested = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const data = loadData();
const cal = loadCalibration();
mkdirSync(OUT, { recursive: true });

const slugs = requested.length ? requested : [...data.kits.keys()].sort();
// Per-role field winrate (lightly shrunk toward 50%) so the lane picker can show a
// flex hero's win% in the lane it flexes into. Same match-sample source as the meta board.
const aggForIndex = loadAggregates();
// Lane evidence source, in preference order: the pred.gg ranked lane-stats pull
// (current patch, version-pinned — npm run lanestats) over the omeda feed
// aggregate. The feed runs days behind live and can be down entirely; the 1.16
// era shipped boards measured on pre-1.16 games because the feed window was the
// only source. When lane-stats exists it carries the patch it measured, so the
// board can say which patch it is instead of inheriting the feed window's.
const laneStatsPath = path.join(ROOT, 'data/aggregates/predgg-lane-stats.json');
const laneStats = existsSync(laneStatsPath)
  ? JSON.parse(readFileSync(laneStatsPath, 'utf8')) as {
      patch: string; scopeLabel: string; matchesApprox: number; generatedAt: string;
      rankBands?: { key: string; label: string; rankIds: string[] }[];
      matchesApproxByBand?: Record<string, number>;
      heroes: Record<string, { byRole: Record<string, { n: number; w: number; bands?: Record<string, { n: number; w: number }> }> }>;
    }
  : null;
const laneCells: Record<string, { byRole?: Record<string, { n: number; w: number }> }> =
  laneStats?.heroes ?? (aggForIndex?.heroes as Record<string, { byRole?: Record<string, { n: number; w: number }> }>) ?? {};
const lanePatch = laneStats?.patch ?? cal.patch;
const laneScope = laneStats?.scopeLabel ?? 'all ranks';
const laneMatches = laneStats?.matchesApprox ?? aggForIndex?.meta.matches ?? 0;
// One empirical-Bayes shrink strength per lane, shared by BOTH the meta board and the
// index roleWr below, so the same hero's win% reads identically on every surface.
const SHRINK_ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'];
const priorK: Record<string, number> = {};
for (const r of SHRINK_ROLES) {
  const cells = Object.values(laneCells)
    .map((h) => h.byRole?.[r])
    .filter((c): c is { n: number; w: number } => !!c && c.n >= 30);
  priorK[r] = momPriorStrength(cells, 0.5);
}
const index: { slug: string; name: string; role: string; roles: string[]; roleWr: Record<string, { wr: number; n: number }> }[] = [];
const t0 = Date.now();
for (const slug of slugs) {
  const kit = data.kits.get(slug);
  if (!kit) { console.error(`skip unknown slug ${slug}`); continue; }
  // 6 matchups per hero = lane-wide counter coverage for the lane picker
  const artifact = buildHeroArtifact(kit, data, cal, { matchupEnemies: 6 });
  writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(artifact, null, 1));
  const roles = (artifact.roles || []).map((r) => r.role);
  const byRole = laneCells[slug]?.byRole ?? {};
  const roleWr: Record<string, { wr: number; n: number }> = {};
  for (const r of (roles.length ? roles : [artifact.role])) {
    const c = byRole[r];
    if (c && c.n >= 30) { const k = priorK[r] ?? 30; roleWr[r] = { wr: Math.round(((c.w + k * 0.5) / (c.n + k)) * 1000) / 1000, n: c.n }; }
  }
  index.push({ slug, name: kit.name, role: artifact.role, roles: roles.length ? roles : [artifact.role], roleWr });
  process.stdout.write('.');
}
// Field-evidence coverage, declared per hero.
//
// A hero released this patch has a full kit in the catalog but nothing in the
// field layer: no augment win evidence, no recommended skill order, no build
// statistics, and too few games for a lane winrate. Scarlett (1.16) is the case
// that forced this. Every one of those comes from a pred.gg pull, so it cannot
// be conjured — and inventing a winrate for the hero players are looking up
// most in her first fortnight is the worst place to guess.
//
// So the gap is DECLARED: the surfaces read this and say what is known (kit math
// on current-patch numbers) and what is not (field evidence pending), instead of
// rendering an empty page or a fabricated number.
const readAgg = (f: string): { heroes?: Record<string, unknown> } => {
  const p = path.join(ROOT, 'data/aggregates', f);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
};
const augSrc = readAgg('predgg-augments.json');
const skillSrc = readAgg('skill-orders.json');
const tipSrc = readAgg('ability-tips.json');
const buildSrc = readAgg('predgg-builds.json');
const has = (src: { heroes?: Record<string, unknown> }, slug: string): boolean =>
  Object.keys((src.heroes?.[slug] ?? {}) as Record<string, unknown>).length > 0;

const fieldPending: Record<string, { name: string; missing: string[]; matchSample: number; reason: string }> = {};
for (const { slug, name } of index) {
  const missing: string[] = [];
  if (!has(augSrc, slug)) missing.push('augment and Eternal win evidence');
  if (!has(skillSrc, slug)) missing.push('recommended skill order');
  if (!has(tipSrc, slug)) missing.push('ability tips');
  if (!has(buildSrc, slug)) missing.push('field build statistics');
  if (!missing.length) continue;
  const byRole = laneCells[slug]?.byRole ?? {};
  const matchSample = Object.values(byRole).reduce((t, c) => t + (c?.n ?? 0), 0);
  // Three honest reasons, in order of what actually happened: the hero has no
  // recorded games; the hero has games but the missing pieces are the fields
  // the current pred.gg app tier cannot read (simpleBuild/coreBuild — see
  // priorities item 1); or the sample is genuinely below the floor.
  const onlyGatedFields = missing.every((m) => m === 'augment and Eternal win evidence' || m === 'field build statistics');
  fieldPending[slug] = {
    name,
    missing,
    matchSample,
    reason: matchSample === 0
      ? 'no games in our committed match sample yet — released after the last field pull'
      : onlyGatedFields
        ? `${matchSample.toLocaleString()} ranked games this patch, but the augment and build evidence fields are not readable at the current pred.gg app tier (priorities item 1)`
        : `only ${matchSample} games in our committed match sample — below the evidence floor`,
  };
}
writeFileSync(path.join(ROOT, 'data/aggregates/field-data-pending.json'), JSON.stringify({
  note: 'Heroes carrying kit math but no field evidence. Kit numbers are current-patch; everything derived from a pred.gg pull is absent, NOT estimated. Regenerated by npm run artifacts.',
  generatedAt: new Date().toISOString(),
  heroes: fieldPending,
}, null, 1));
if (Object.keys(fieldPending).length) {
  console.log(`\nfield evidence pending for ${Object.keys(fieldPending).length} hero(es): ${Object.keys(fieldPending).join(', ')}`);
}

// TWO patches, not one. cal.patch labels the MATCH WINDOW the aggregates were
// collected in (lane boards, gold curves, winrates); the hero and item numbers
// come from the catalog snapshot, which is refreshed separately and is usually
// AHEAD of the feed — the public match feed runs days behind live. Publishing a
// single "patch X" pill made the site claim the boards' patch for the kit math,
// which was wrong in both directions at different times. Each is now labelled
// with the patch it actually describes.
//
// catalogPatch is derived, never typed in: it is the newest patch whose stated
// changes npm run patchcheck finds present in the snapshot with none stale.
const currencyPath = path.join(ROOT, 'data/aggregates/patch-currency.json');
let catalogPatch: string | null = null;
if (existsSync(currencyPath)) {
  const cur = JSON.parse(readFileSync(currencyPath, 'utf8')) as {
    staleAgainstPatch: string | null;
    perPatch: Record<string, { applied: number; stale: number }>;
  };
  if (!cur.staleAgainstPatch) {
    const verified = Object.entries(cur.perPatch).filter(([, v]) => v.applied > 0 && v.stale === 0).map(([p]) => p);
    catalogPatch = verified.length ? verified[verified.length - 1]! : null;
  }
}

// Spike minutes are read off the measured gold table, which was collected in a
// patch-1.15 window; 1.16 reworked the economy that table describes. Surfaces
// that print a spike minute need to say so, so the gap travels with the data.
const goldEconomy = {
  measuredIn: (cal.checkpoints as { goldEconomyPatch?: string }).goldEconomyPatch ?? null,
  staleAgainst: (cal.checkpoints as { goldEconomyStaleAgainst?: string }).goldEconomyStaleAgainst ?? null,
  note: (cal.checkpoints as { goldEconomyNote?: string }).goldEconomyNote ?? null,
};

writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  patch: cal.patch,
  goldEconomy,
  patchNote: 'patch = the match window the aggregates were collected in. catalogPatch = the patch the hero/item numbers are verified against (npm run patchcheck). They differ whenever the public match feed is behind live, which is most of the time.',
  catalogPatch,
  generatedAt: new Date().toISOString(),
  heroes: index.map((h) => (fieldPending[h.slug] ? { ...h, fieldDataPending: true } : h)),
}, null, 1));

// Meta board: most played per lane with empirical-Bayes shrunk winrates.
// Pure evidence display for the landing page; never feeds the generator.
const agg = loadAggregates();
// Augment coverage gate: the meta board must not surface a (hero, lane) the
// augment pull doesn't cover, or the UI links a cell with no field evidence
// behind it (e.g. an off-role 45-game blip). Keying the board to augment cells
// keeps the two sources consistent (artifacts test enforces this).
const augFile = path.join(ROOT, 'data/aggregates/predgg-augments.json');
const augHeroes: Record<string, Record<string, unknown>> = existsSync(augFile)
  ? (JSON.parse(readFileSync(augFile, 'utf8')).heroes ?? {}) : {};
if (agg || laneStats) {
  type BoardRow = { slug: string; name: string; games: number; rawWr: number; shrunkWr: number; metaScore: number; badge: string | null; augmentPending?: boolean };
  type NW = { n: number; w: number };
  // One lane board from a cell accessor, so the all-ranks board and each
  // rank-band board (added 2026-08-29) run the exact same scoring: same
  // scaling games floor, same per-board shrink prior, same badges. Bands get
  // their OWN prior strength and floor because a 3.7k-match Diamond+ window
  // is a different evidence regime than the 106k-match all-ranks one.
  const laneBoard = (role: string, cellOf: (h: { byRole?: Record<string, NW & { bands?: Record<string, NW> }> }) => NW | undefined, matches: number, fallbackK?: number): BoardRow[] => {
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
        data.kits.has(x.slug) && !!x.cell && x.cell.n >= Math.max(30, Math.round(matches / 500)));
    const k = fallbackK ?? momPriorStrength(cells.map((c) => c.cell), 0.5);
    // The augment gate used to DROP any (hero, lane) the augment pull lacks a
    // cell for. With current-patch lane evidence that quietly censors exactly
    // the interesting rows — a hero newly meta in a role, or a new hero — and
    // "the board is outdated" was the complaint that exposed it. The row now
    // stays and carries augmentPending; the hero page already renders an
    // honest no-field-evidence state for such cells.
    const scored = cells.map(({ slug, cell }) => ({
      slug,
      name: data.kits.get(slug)?.name ?? slug,
      games: cell.n,
      rawWr: Math.round((cell.w / cell.n) * 1000) / 1000,
      shrunkWr: Math.round(((cell.w + k * 0.5) / (cell.n + k)) * 1000) / 1000,
      augmentPending: !augHeroes[slug]?.[role] || undefined,
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
  const bands = laneStats?.rankBands ?? [];
  for (const role of ['carry', 'midlane', 'offlane', 'jungle', 'support']) {
    roles[role] = laneBoard(role, (h) => h.byRole?.[role], laneMatches, priorK[role]);
    for (const band of bands) {
      (rolesByBand[band.key] ??= {})[role] =
        laneBoard(role, (h) => h.byRole?.[role]?.bands?.[band.key], laneStats?.matchesApproxByBand?.[band.key] ?? 0);
    }
  }
  // Top ranked pilots per lane from the pred.gg split leaderboard.
  // Env-gated: without PREDGG_* credentials the board ships without them.
  let topPlayers: Awaited<ReturnType<typeof topPlayersPerLane>> = null;
  if (hasCredentials()) {
    try {
      topPlayers = await topPlayersPerLane(5);
      console.log('top players per lane fetched from pred.gg');
    } catch (e) {
      console.error('pred.gg leaderboard fetch failed, shipping without:', (e as Error).message);
    }
  } else {
    // No credentials here: carry over the committed leaderboard rather
    // than wiping it, so zero-API regeneration stays harness-green.
    const metaPath = path.join(OUT, 'meta.json');
    if (existsSync(metaPath)) {
      topPlayers = (JSON.parse(readFileSync(metaPath, 'utf8')) as { topPlayers: typeof topPlayers }).topPlayers ?? null;
    }
    console.log(topPlayers
      ? 'no PREDGG_CLIENT_ID/SECRET in env; carried over committed top players'
      : 'no PREDGG_CLIENT_ID/SECRET in env; meta.json ships without top players');
  }

  writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({
    patch: lanePatch,
    scope: laneScope,
    laneSource: laneStats ? `pred.gg ranked general statistics, patch ${lanePatch}` : 'omeda public match feed window',
    generatedAt: new Date().toISOString(),
    matches: laneMatches,
    note: `meta score blends how often a lane picks a hero with how often it wins (small samples adjusted down), both rank-averaged within the lane; ${laneScope}, current-patch window. Badges mark high-winrate/low-pick sleepers and high-pick/low-winrate traps.`,
    roles,
    // Rank-band boards (absent when the lane-stats snapshot predates bands).
    // Bands sum below all-ranks: unplaced players only count unfiltered.
    rankBands: bands.length ? bands.map((b) => ({ key: b.key, label: b.label })) : undefined,
    matchesByBand: bands.length ? laneStats?.matchesApproxByBand : undefined,
    rolesByBand: bands.length ? rolesByBand : undefined,
    topPlayers,
    topPlayersNote: topPlayers ? 'current ranked split leaderboard via the pred.gg API (favRole filter); VP = victory points' : null,
  }, null, 1));
  console.log('meta.json written');
}
console.log(`\n${index.length} artifacts in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}`);
