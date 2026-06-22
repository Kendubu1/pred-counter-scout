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
const index: { slug: string; name: string; role: string; roles: string[]; roleWr: Record<string, { wr: number; n: number }> }[] = [];
const t0 = Date.now();
for (const slug of slugs) {
  const kit = data.kits.get(slug);
  if (!kit) { console.error(`skip unknown slug ${slug}`); continue; }
  // 6 matchups per hero = lane-wide counter coverage for the lane picker
  const artifact = buildHeroArtifact(kit, data, cal, { matchupEnemies: 6 });
  writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(artifact, null, 1));
  const roles = (artifact.roles || []).map((r) => r.role);
  const byRole = aggForIndex?.heroes?.[slug]?.byRole ?? {};
  const roleWr: Record<string, { wr: number; n: number }> = {};
  for (const r of (roles.length ? roles : [artifact.role])) {
    const c = byRole[r];
    if (c && c.n >= 30) roleWr[r] = { wr: Math.round(((c.w + 15) / (c.n + 30)) * 1000) / 1000, n: c.n };
  }
  index.push({ slug, name: kit.name, role: artifact.role, roles: roles.length ? roles : [artifact.role], roleWr });
  process.stdout.write('.');
}
writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ patch: cal.patch, generatedAt: new Date().toISOString(), heroes: index }, null, 1));

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
if (agg) {
  const roles: Record<string, { slug: string; name: string; games: number; rawWr: number; shrunkWr: number; metaScore: number; badge: string | null }[]> = {};
  for (const role of ['carry', 'midlane', 'offlane', 'jungle', 'support']) {
    const cells = Object.entries(agg.heroes)
      // unmapped hero_id:* entries are excluded: no kit, no portrait, no
      // page to link to (one such id is tracked in lessons.md)
      .map(([slug, h]) => ({ slug, cell: h.byRole?.[role] }))
      .filter((x): x is { slug: string; cell: { n: number; w: number } } => data.kits.has(x.slug) && !!x.cell && x.cell.n >= 30 && !!augHeroes[x.slug]?.[role]);
    const k = momPriorStrength(cells.map((c) => c.cell), 0.5);
    const scored = cells.map(({ slug, cell }) => ({
      slug,
      name: data.kits.get(slug)?.name ?? slug,
      games: cell.n,
      rawWr: Math.round((cell.w / cell.n) * 1000) / 1000,
      shrunkWr: Math.round(((cell.w + k * 0.5) / (cell.n + k)) * 1000) / 1000,
    }));
    // Meta = strong AND prevalent: average of each hero's percentile rank
    // on pick volume and on shrunk winrate within the lane. A naive
    // average of the raw numbers would re-import small-sample bias; the
    // winrate side is shrunk and both sides are rank-normalized.
    const pctl = (vals: number[], v: number) => vals.filter((x) => x < v).length / Math.max(vals.length - 1, 1);
    const gamesAll = scored.map((s) => s.games);
    const wrAll = scored.map((s) => s.shrunkWr);
    roles[role] = scored
      .map((s) => {
        const pickPctl = pctl(gamesAll, s.games);
        const wrPctl = pctl(wrAll, s.shrunkWr);
        const badge = wrPctl >= 0.7 && pickPctl <= 0.35 ? 'sleeper'
          : pickPctl >= 0.7 && wrPctl <= 0.35 ? 'popular but losing' : null;
        return { ...s, metaScore: Math.round(((pickPctl + wrPctl) / 2) * 1000) / 1000, badge };
      })
      .sort((a, b) => b.metaScore - a.metaScore)
      .slice(0, 8);
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
    patch: cal.patch,
    generatedAt: new Date().toISOString(),
    matches: agg.meta.matches,
    note: 'meta score blends how often a lane picks a hero with how often it wins (small samples adjusted down), both rank-averaged within the lane; all ranks, current-patch window. Badges mark high-winrate/low-pick sleepers and high-pick/low-winrate traps.',
    roles,
    topPlayers,
    topPlayersNote: topPlayers ? 'current ranked split leaderboard via the pred.gg API (favRole filter); VP = victory points' : null,
  }, null, 1));
  console.log('meta.json written');
}
console.log(`\n${index.length} artifacts in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}`);
