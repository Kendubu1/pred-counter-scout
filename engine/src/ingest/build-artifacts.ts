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
import { buildMetaBoards, lanePriorK, type LaneCell } from '../boards.js';
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
      patch: string; scopeLabel: string; matchesApprox: number; generatedAt: string; versionIds?: string[];
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
const priorK = lanePriorK(laneCells);
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
  // recorded games; the hero has games but no augment pick or item core has
  // reached its evidence floor yet in the public match-stream window (npm run
  // perks; it grows daily); or the sample is genuinely below the floor.
  const onlyGatedFields = missing.every((m) => m === 'augment and Eternal win evidence' || m === 'field build statistics');
  fieldPending[slug] = {
    name,
    missing,
    matchSample,
    reason: matchSample === 0
      ? 'no games in our committed match sample yet — released after the last field pull'
      : onlyGatedFields
        ? `${matchSample.toLocaleString()} ranked games this patch, but no single item core or augment pick has reached its evidence floor in the match-stream window yet; it fills in as the daily pull accumulates games`
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
    perPatch: Record<string, { applied: number; stale: number; pending?: number }>;
  };
  if (!cur.staleAgainstPatch) {
    // A patch in the release-window pending state is NOT verified: omeda has
    // not published it, so the snapshot's numbers are still the prior patch's.
    const verified = Object.entries(cur.perPatch)
      .filter(([, v]) => v.applied > 0 && v.stale === 0 && !(v.pending && v.pending > 0)).map(([p]) => p);
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
  // Scoring lives in src/boards.ts, shared with the past-patch boards
  // (ingest/past-boards.ts) so every patch on the picker reads the same way.
  const bands = laneStats?.rankBands ?? [];
  const { roles, rolesByBand } = buildMetaBoards({
    laneCells: laneCells as Record<string, { byRole?: Record<string, LaneCell> }>,
    matches: laneMatches,
    bands,
    matchesByBand: laneStats?.matchesApproxByBand,
    priorK,
    nameOf: (slug) => (data.kits.has(slug) ? data.kits.get(slug)?.name ?? slug : undefined),
    augmentPending: (slug, role) => !augHeroes[slug]?.[role],
  });
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
    // When the lane stats were pulled from pred.gg (generatedAt above is only
    // the artifact rebuild) and which version ids they pool — the site shows
    // the pull date as the boards' last match refresh.
    pulledAt: laneStats?.generatedAt ?? null,
    versionIds: laneStats?.versionIds,
    matches: laneMatches,
    note: `meta score blends how often a lane picks a hero with how often it wins (small samples adjusted down), both rank-averaged within the lane; ${laneScope}, current-patch window. Badges mark high-winrate/low-pick sleepers and high-pick/low-winrate traps.`,
    roles,
    // Rank-band boards (absent when the lane-stats snapshot predates bands).
    // Bands sum below all-ranks: unplaced players only count unfiltered.
    rankBands: bands.length ? bands.map((b) => ({ key: b.key, label: b.label })) : undefined,
    matchesByBand: bands.length ? laneStats?.matchesApproxByBand : undefined,
    rolesByBand: bands.length ? rolesByBand : undefined,
    topPlayers,
    topPlayersNote: topPlayers ? 'current ranked split leaderboard via the pred.gg API (favRole filter); hero = their most-played ranked hero in that lane; VP = victory points' : null,
  }, null, 1));
  console.log('meta.json written');
}
console.log(`\n${index.length} artifacts in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}`);
